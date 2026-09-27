import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";

// Tests that touch accounts start an embedded Postgres (PGlite), which is slower on shared CI runners.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const origin = "https://temt.example.com";
const client = { "X-TEMT-Client": "web" };
const person = { name: "Asha Rao", email: "Asha.Rao@Example.com ", password: "correct horse battery", organisation: "Sample FMCG Ltd" };

function workspace(shipments = 2) {
  return {
    app: "TEMT", version: 1, exportedAt: new Date().toISOString(), settings: { factorSet: "glec-india", organisation: { name: "Sample FMCG Ltd" } },
    shipments: Array.from({ length: shipments }, (_, i) => ({ id: `s${i}`, ref: `REF-${i}`, date: "2026-05-01", input: { legs: [{ mode: "road", tonnes: 10, distanceKm: 500, vehicleClass: "gvw-30-50", fuel: "diesel" }] } })),
  };
}

let app: Express;
beforeEach(() => { app = createApp({ allowedOrigins: [origin], rateLimitMax: 10_000 }); });

async function signUp(agent = request.agent(app), body: Record<string, unknown> = person) {
  const response = await agent.post("/api/auth/signup").set(client).send(body);
  return { agent, response };
}

describe("accounts and sessions", () => {
  it("signs up, keeps a secure HttpOnly session and signs out", async () => {
    const { agent, response } = await signUp();
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: "asha.rao@example.com", name: "Asha Rao", organisation: "Sample FMCG Ltd" });
    expect(response.body.user.passwordHash).toBeUndefined();
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect((await agent.get("/api/auth/me").expect(200)).body.user.email).toBe("asha.rao@example.com");
    await agent.post("/api/auth/signout").set(client).expect(200);
    expect((await agent.get("/api/auth/me").expect(200)).body.user).toBeNull();
  });

  it("rejects duplicate emails, weak passwords and wrong passwords with generic errors", async () => {
    await signUp();
    expect((await signUp(request.agent(app), { ...person, email: "ASHA.RAO@example.com" })).response.status).toBe(409);
    expect((await signUp(request.agent(app), { ...person, email: "new@example.com", password: "short" })).response.status).toBe(400);
    const wrong = await request(app).post("/api/auth/signin").set(client).send({ email: person.email, password: "not the password" });
    const unknown = await request(app).post("/api/auth/signin").set(client).send({ email: "nobody@example.com", password: "not the password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    const ok = await request(app).post("/api/auth/signin").set(client).send({ email: "asha.rao@example.com", password: person.password });
    expect(ok.status).toBe(200);
  });

  it("locks an email after repeated failed sign-ins", async () => {
    await signUp();
    for (let i = 0; i < 8; i += 1) await request(app).post("/api/auth/signin").set(client).send({ email: person.email, password: `wrong-${i}-password` }).expect(401);
    const locked = await request(app).post("/api/auth/signin").set(client).send({ email: person.email, password: person.password });
    expect(locked.status).toBe(429);
  });

  it("blocks cross-site requests: missing client header or a foreign origin", async () => {
    expect((await request(app).post("/api/auth/signup").send(person)).status).toBe(403);
    expect((await request(app).post("/api/auth/signup").set(client).set("Origin", "https://evil.example").send(person)).status).toBe(403);
    // Same-origin requests are accepted without configuration.
    const same = await request(app).post("/api/auth/signup").set(client).set("Host", "temt.vercel.app").set("Origin", "https://temt.vercel.app").send(person);
    expect(same.status).toBe(201);
  });

  it("treats SQL injection payloads as plain data", async () => {
    const payloads = ["' OR '1'='1", "x'); DROP TABLE temt_users; --", "\" OR 1=1 --", "Robert'); DELETE FROM temt_sessions;--"];
    const { agent } = await signUp(request.agent(app), { ...person, name: payloads[1], organisation: payloads[3] });
    const me = (await agent.get("/api/auth/me").expect(200)).body.user;
    expect(me.name).toBe(payloads[1]);
    expect(me.organisation).toBe(payloads[3]);
    for (const payload of payloads) {
      const response = await request(app).post("/api/auth/signin").set(client).send({ email: `${payload}@example.com`, password: payload });
      expect([400, 401]).toContain(response.status);
      const signin = await request(app).post("/api/auth/signin").set(client).send({ email: person.email, password: payload });
      expect(signin.status).toBe(401);
    }
    await agent.patch("/api/account").set(client).send({ jobTitle: "'; UPDATE temt_users SET name='pwned'; --" }).expect(200);
    await agent.delete(`/api/account/sessions/${encodeURIComponent("' OR 1=1 --")}`).set(client).expect(400);
    // Tables and the account still exist and nothing else changed.
    const after = (await agent.get("/api/auth/me").expect(200)).body.user;
    expect(after.name).toBe(payloads[1]);
    expect(after.jobTitle).toBe("'; UPDATE temt_users SET name='pwned'; --");
  });

  it("strips control characters from names", async () => {
    const { response } = await signUp(request.agent(app), { ...person, name: "Asha\u0000 Rao‮" });
    expect(response.body.user.name).toBe("Asha Rao");
  });

  it("changes password, lists and revokes sessions, exports and deletes the account", async () => {
    const { agent } = await signUp();
    const other = request.agent(app);
    await other.post("/api/auth/signin").set(client).set("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/140").send({ email: person.email, password: person.password }).expect(200);
    const sessions = (await agent.get("/api/account/sessions").expect(200)).body.sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    await agent.post("/api/account/password").set(client).send({ current: "wrong password", next: "a brand new passphrase" }).expect(401);
    await agent.post("/api/account/password").set(client).send({ current: person.password, next: "a brand new passphrase" }).expect(200);
    expect((await other.get("/api/auth/me").expect(200)).body.user).toBeNull();
    const exported = (await agent.get("/api/account/export").expect(200)).body;
    expect(exported.account.email).toBe("asha.rao@example.com");
    expect(exported.activity.some((a: { kind: string }) => a.kind === "password_changed")).toBe(true);
    await agent.delete("/api/account").set(client).send({ password: person.password }).expect(401);
    await agent.delete("/api/account").set(client).send({ password: "a brand new passphrase" }).expect(200);
    expect((await agent.get("/api/auth/me").expect(200)).body.user).toBeNull();
    await request(app).post("/api/auth/signin").set(client).send({ email: person.email, password: "a brand new passphrase" }).expect(401);
  });
});

describe("workspace sync", () => {
  it("requires a session", async () => {
    await request(app).get("/api/workspace").expect(401);
    await request(app).put("/api/workspace").set(client).set("X-TEMT-Base-Version", "0").set("Content-Type", "application/json").send(JSON.stringify(workspace())).expect(401);
  });

  it("uploads gzip, detects conflicting versions and summarises with the shared engine", async () => {
    const { agent } = await signUp();
    expect((await agent.get("/api/workspace").expect(200)).body).toMatchObject({ version: 0, data: null });
    const first = await agent.put("/api/workspace").set(client).set("X-TEMT-Base-Version", "0").set("Content-Type", "application/gzip").send(gzipSync(JSON.stringify(workspace(3)))).expect(200);
    expect(first.body.version).toBe(1);
    // A second device still based on version 0 must not overwrite version 1.
    const stale = await agent.put("/api/workspace").set(client).set("X-TEMT-Base-Version", "0").set("Content-Type", "application/json").send(JSON.stringify(workspace(1)));
    expect(stale.status).toBe(409);
    expect(stale.body.error.version).toBe(1);
    await agent.put("/api/workspace").set(client).set("X-TEMT-Base-Version", "1").set("Content-Type", "application/json").send(JSON.stringify(workspace(4))).expect(200);
    const stored = (await agent.get("/api/workspace").expect(200)).body;
    expect(stored.version).toBe(2);
    expect(stored.data.shipments).toHaveLength(4);
    const summary = (await agent.get("/api/workspace/summary").expect(200)).body.summary;
    expect(summary.calculated).toBe(4);
    expect(summary.wtwKg).toBeGreaterThan(0);
    expect(summary.byMode.road).toBeCloseTo(summary.wtwKg, 6);
  });

  it("rejects malformed workspaces, bad versions and decompression bombs", async () => {
    const { agent } = await signUp();
    const put = () => agent.put("/api/workspace").set(client);
    await put().set("Content-Type", "application/json").send(JSON.stringify(workspace())).expect(400);
    await put().set("X-TEMT-Base-Version", "-1").set("Content-Type", "application/json").send(JSON.stringify(workspace())).expect(400);
    await put().set("X-TEMT-Base-Version", "0").set("Content-Type", "application/json").send(JSON.stringify({ app: "Other", shipments: [] })).expect(400);
    await put().set("X-TEMT-Base-Version", "0").set("Content-Type", "application/json").send("{not json").expect(400);
    const bomb = gzipSync(Buffer.alloc(60 * 1024 * 1024, 32));
    expect(bomb.length).toBeLessThan(4 * 1024 * 1024);
    await put().set("X-TEMT-Base-Version", "0").set("Content-Type", "application/gzip").send(bomb).expect(400);
    await put().set("X-TEMT-Base-Version", "0").set("Content-Type", "text/plain").send("hello").expect(415);
  });

  it("keeps each user's data separate", async () => {
    const { agent: a } = await signUp();
    const { agent: b } = await signUp(request.agent(app), { ...person, email: "second@example.com" });
    await a.put("/api/workspace").set(client).set("X-TEMT-Base-Version", "0").set("Content-Type", "application/json").send(JSON.stringify(workspace(5))).expect(200);
    expect((await b.get("/api/workspace").expect(200)).body.version).toBe(0);
    const sessionsA = (await a.get("/api/account/sessions").expect(200)).body.sessions;
    await b.delete(`/api/account/sessions/${sessionsA[0].id}`).set(client).expect(404);
    expect((await a.get("/api/auth/me").expect(200)).body.user).not.toBeNull();
  });

  it("records report history", async () => {
    const { agent } = await signUp();
    await agent.post("/api/reports").set(client).send({ title: "Freight emissions report", period: "FY 2025–26", format: "pdf", shipments: 169, wtwKg: 325_700 }).expect(201);
    await agent.post("/api/reports").set(client).send({ title: "x", period: "y", format: "exe", shipments: 1, wtwKg: 1 }).expect(400);
    const reports = (await agent.get("/api/reports").expect(200)).body.reports;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ format: "pdf", period: "FY 2025–26", shipments: 169, wtwKg: 325_700 });
  });
});
