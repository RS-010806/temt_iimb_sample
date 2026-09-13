import { describe, expect, it } from "vitest";
import request from "supertest";
import { analyze, MAX_LEGS } from "@temt/calculator";
import { createApp, MAX_BODY_BYTES, parseAllowedOrigins } from "../src/app.js";

const origin = "https://temt.example.com";
const row = { shipmentId: "SHIP-001", legIndex: 1, date: "2026-01-20", subsidiary: "Industrial", mode: "road", profile: "road-hcv", tonnes: 10, kilometres: 100 };
const app = () => createApp({ allowedOrigins: [origin] });

describe("stateless API contract", () => {
  it("serves health and documented factors", async () => {
    for (const route of ["/health", "/api/health"]) {
      const response = await request(app()).get(route).expect(200);
      expect(response.body).toMatchObject({ status: "ok", persistence: "none" });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-powered-by"]).toBeUndefined();
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
    const response = await request(app()).get("/api/factors").expect(200);
    expect(response.body.maxLegs).toBe(1000);
    expect(response.body.factors["road-hcv"].kgCO2ePerTonneKm).toBe(0.0663);
    expect(response.body.factors["ocean-container"].sourcePage).toBe(112);
  });

  it("agrees exactly with the shared engine, except measured metadata", async () => {
    const response = await request(app()).post("/api/analyze").send({ rows: [row] }).expect(200);
    const local = analyze([row]);
    const { processingMs, calculatedAt, ...remoteData } = response.body;
    const { processingMs: _localMs, calculatedAt: _localAt, ...localData } = local;
    expect(remoteData).toEqual(localData);
    expect(processingMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(calculatedAt))).toBe(false);
  });

  it("returns per-row errors without including incomplete shipment emissions", async () => {
    const response = await request(app()).post("/api/analyze").send({ rows: [row, { ...row, legIndex: 2, profile: "rail-india" }] }).expect(200);
    expect(response.body.totals.emissionsKg).toBe(0);
    expect(response.body.errors.map((error: { code: string }) => error.code)).toEqual(["shipment_excluded", "invalid_row"]);
  });

  it("does not retain earlier shipment results", async () => {
    const instance = app();
    await request(instance).post("/api/analyze").send({ rows: [row] }).expect(200);
    const response = await request(instance).post("/api/analyze").send({ rows: [] }).expect(200);
    expect(response.body.rows).toEqual([]);
    expect(response.body.totals.shipmentCount).toBe(0);
  });
});

describe("request boundaries", () => {
  it.each([{}, { rows: null }, { rows: "bad" }, [row]])("rejects malformed request envelopes", async (body) => {
    const response = await request(app()).post("/api/analyze").send(body).expect(400);
    expect(response.body.error.code).toBe("invalid_request");
  });

  it("returns sanitized errors for malformed JSON", async () => {
    const response = await request(app()).post("/api/analyze").set("Content-Type", "application/json").send('{"rows": SECRET_TEST_VALUE').expect(400);
    expect(response.body.error.code).toBe("invalid_json");
    expect(JSON.stringify(response.body)).not.toContain("SECRET_TEST_VALUE");
    expect(response.body).not.toHaveProperty("stack");
  });

  it("requires JSON media type", async () => {
    const response = await request(app()).post("/api/analyze").set("Content-Type", "text/plain").send("rows=[]").expect(415);
    expect(response.body.error.code).toBe("unsupported_media_type");
  });

  it("rejects more than 1,000 rows", async () => {
    const response = await request(app()).post("/api/analyze").send({ rows: Array(MAX_LEGS + 1).fill(row) }).expect(413);
    expect(response.body.error.code).toBe("row_limit_exceeded");
  });

  it("rejects JSON bodies larger than 2 MiB before analysis", async () => {
    const response = await request(app()).post("/api/analyze").send({ rows: [], padding: "x".repeat(MAX_BODY_BYTES) }).expect(413);
    expect(response.body.error.code).toBe("body_too_large");
  });

  it("serves JSON 404 errors", async () => {
    const response = await request(app()).get("/missing").expect(404);
    expect(response.body.error.code).toBe("not_found");
  });
});

describe("CORS and request limits", () => {
  it("allows an exact origin and permits its JSON preflight", async () => {
    const response = await request(app()).post("/api/analyze").set("Origin", origin).send({ rows: [] }).expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    const preflight = await request(app()).options("/api/analyze").set("Origin", origin)
      .set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "Content-Type").expect(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
    expect(preflight.headers["access-control-allow-methods"]).toContain("POST");
  });

  it.each(["https://temt.example.com.attacker.test", "http://temt.example.com", "https://temt.example.com:444", "null"])("rejects a non-exact origin %s", async (blocked) => {
    const response = await request(app()).post("/api/analyze").set("Origin", blocked).send({ rows: [] }).expect(403);
    expect(response.body.error.code).toBe("origin_not_allowed");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows origin-less server requests but rejects unknown preflights", async () => {
    await request(app()).post("/api/analyze").send({ rows: [] }).expect(200);
    await request(app()).options("/api/analyze").set("Origin", "https://unknown.example.com").expect(403);
  });

  it("parses only exact configured origins and rejects wildcards or paths", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:3000"]);
    expect(parseAllowedOrigins("  https://one.example,https://two.example  ")).toEqual(["https://one.example", "https://two.example"]);
    expect(parseAllowedOrigins("")).toEqual([]);
    for (const value of ["*", "https://*.example.com", "https://example.com/", "https://example.com/path", "https://user:pass@example.com", "null"]) {
      expect(() => parseAllowedOrigins(value)).toThrow();
    }
  });

  it("throttles analysis calls while keeping health checks available", async () => {
    const instance = createApp({ allowedOrigins: [origin], rateLimitMax: 2 });
    await request(instance).post("/api/analyze").send({ rows: [] }).expect(200);
    await request(instance).post("/api/analyze").send({ rows: [] }).expect(200);
    const response = await request(instance).post("/api/analyze").send({ rows: [] }).expect(429);
    expect(response.body.error.code).toBe("rate_limit_exceeded");
    expect(response.headers["retry-after"]).toBeDefined();
    await request(instance).get("/api/health").expect(200);
  });
});
