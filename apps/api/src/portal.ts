import express, { type Request, type RequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { gunzip } from "node:zlib";
import { z } from "zod";
import { calculateShipment, shipmentInputSchema, type FactorSetId } from "@temt/calculator";
import type { Db } from "./db.js";
import { cleanText, dummyHash, hashPassword, newToken, parseCookies, serializeCookie, sha256, verifyPassword } from "./security.js";

const SESSION_DAYS = 30;
const SECURE_COOKIE = "__Host-temt_session";
const DEV_COOKIE = "temt_session";
/** Compressed upload limit (Vercel functions accept 4.5 MB bodies) and the decompressed workspace ceiling. */
export const MAX_WORKSPACE_UPLOAD = 4 * 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 40 * 1024 * 1024;
export const MAX_WORKSPACE_SHIPMENTS = 50_000;
const FAILURE_WINDOW_MINUTES = 15;
const MAX_EMAIL_FAILURES = 8;
const MAX_IP_FAILURES = 40;

interface UserRow { id: string; email: string; name: string; organisation: string; job_title: string; password_hash: string; created_at: Date | string }
interface Authed { user: UserRow; sessionId: string }
type AuthedRequest = Request & { auth?: Authed };

const text = (max: number) => z.string().max(max * 4).transform(cleanText).pipe(z.string().max(max));
const email = z.string().max(320).transform((value) => value.trim().toLowerCase()).pipe(z.email({ message: "Enter a valid email address." }).max(254));
const password = z.string().min(10, "Use at least 10 characters.").max(200, "Use at most 200 characters.");
const signupSchema = z.object({ name: text(120).pipe(z.string().min(1, "Enter your name.")), email, password, organisation: text(160).optional().default(""), jobTitle: text(80).optional().default("") });
const signinSchema = z.object({ email, password: z.string().min(1).max(200) });
const profileSchema = z.object({ name: text(120).pipe(z.string().min(1, "Enter your name.")).optional(), organisation: text(160).optional(), jobTitle: text(80).optional() });
const passwordSchema = z.object({ current: z.string().min(1).max(200), next: password });
const deleteSchema = z.object({ password: z.string().min(1).max(200) });
const reportSchema = z.object({ title: text(160), period: text(60), format: z.enum(["pdf", "xlsx", "docx", "csv", "json", "powerbi"]), shipments: z.number().int().min(0).max(10_000_000), wtwKg: z.number().finite().min(0).max(1e13) });
const shipmentShape = z.looseObject({ id: z.string().min(1).max(64), ref: z.string().max(120), date: z.string().max(40), input: z.unknown() });
const workspaceSchema = z.object({
  app: z.literal("TEMT"),
  version: z.number().int(),
  exportedAt: z.string().max(40).optional(),
  settings: z.record(z.string(), z.unknown()),
  shipments: z.array(shipmentShape).max(MAX_WORKSPACE_SHIPMENTS),
});

/** ISO timestamp, optionally offset by milliseconds. Stored as text so SQLite and Postgres sort it the same way. */
const stamp = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const fail = (res: Response, status: number, code: string, message: string, extra?: Record<string, unknown>) => res.status(status).json({ error: { code, message, ...extra } });
const iso = (value: Date | string | null | undefined) => (value instanceof Date ? value.toISOString() : value ?? null);
const publicUser = (user: UserRow) => ({ id: user.id, email: user.email, name: user.name, organisation: user.organisation, jobTitle: user.job_title, createdAt: iso(user.created_at) });
const deviceOf = (req: Request) => {
  const agent = req.get("user-agent") ?? "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Mac OS X|Macintosh/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

function unzip(buffer: Buffer) {
  return new Promise<Buffer>((resolve, reject) => gunzip(buffer, { maxOutputLength: MAX_WORKSPACE_BYTES }, (error, out) => (error ? reject(error) : resolve(out))));
}

/** Server-side totals, calculated with the same engine the browser uses. */
function summarise(data: { settings: Record<string, unknown>; shipments: { input: unknown }[] }) {
  // Same rule as the browser: TEMT's factors unless the workspace deliberately chose the GLEC comparison set
  // (workspaces saved before settings version 2 defaulted to GLEC and now use TEMT's factors).
  const glec = data.settings.factorSet === "glec-india" && Number(data.settings.factorSetVersion ?? 1) >= 2;
  const factorSet: FactorSetId = glec ? "glec-india" : "temt";
  let wtwKg = 0, tonneKm = 0, calculated = 0;
  const byMode: Record<string, number> = {};
  for (const shipment of data.shipments) {
    const input = shipmentInputSchema.safeParse(shipment.input);
    if (!input.success) continue;
    try {
      const result = calculateShipment(input.data, factorSet);
      wtwKg += result.wtwKg; tonneKm += result.tonneKm; calculated += 1;
      for (const leg of result.legs) byMode[leg.mode] = (byMode[leg.mode] ?? 0) + leg.wtwKg;
    } catch { /* counted as not calculated */ }
  }
  return { factorSet, shipments: data.shipments.length, calculated, wtwKg, tonneKm, byMode };
}

export function createPortal(getDb: () => Promise<Db>) {
  const router = express.Router();
  const json = express.json({ limit: 64 * 1024, strict: true });

  // Every request needs storage; open it once per process.
  let db: Db;
  router.use(async (_req, res, next) => {
    try { db = await getDb(); next(); } catch { fail(res, 503, "storage_unavailable", "Account storage is unavailable. Your workspace is still saved in this browser."); }
  });

  // Cross-site request forgery guard: state-changing requests must come from TEMT's own pages.
  // A custom header cannot be sent cross-site without a CORS preflight, which this API does not grant.
  router.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("x-temt-client") !== "web") return fail(res, 403, "client_header_required", "Requests must come from the TEMT web app.");
    next();
  });

  const cookieSecure = (req: Request) => req.secure || process.env.NODE_ENV === "production";
  const cookieName = (req: Request) => (cookieSecure(req) ? SECURE_COOKIE : DEV_COOKIE);
  const setSession = (req: Request, res: Response, token: string) => res.append("Set-Cookie", serializeCookie(cookieName(req), token, { maxAge: SESSION_DAYS * 86_400, secure: cookieSecure(req) }));
  const clearSession = (req: Request, res: Response) => res.append("Set-Cookie", serializeCookie(cookieName(req), "", { maxAge: 0, secure: cookieSecure(req) }));
  const log = (userId: string, kind: string, detail = "") => db.query("INSERT INTO temt_activity (id, user_id, kind, detail, created_at) VALUES ($1, $2, $3, $4, $5)", [randomUUID(), userId, kind, detail.slice(0, 300), stamp()]);

  async function startSession(req: Request, res: Response, userId: string) {
    const token = newToken();
    const at = stamp();
    await db.query("INSERT INTO temt_sessions (id, user_id, token_hash, user_agent, created_at, last_seen_at, expires_at) VALUES ($1, $2, $3, $4, $5, $5, $6)", [randomUUID(), userId, sha256(token), deviceOf(req), at, stamp(SESSION_DAYS * 86_400_000)]);
    setSession(req, res, token);
  }

  // Resolve the session cookie on every request; routes that need a user call `requireUser`.
  router.use(async (req: AuthedRequest, _res, next) => {
    const cookies = parseCookies(req.get("cookie"));
    const token = cookies[SECURE_COOKIE] ?? cookies[DEV_COOKIE];
    if (!token || token.length > 128) return next();
    const rows = await db.query<UserRow & { session_id: string; last_seen_at: Date | string }>(
      `SELECT u.*, s.id AS session_id, s.last_seen_at FROM temt_sessions s JOIN temt_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`, [sha256(token), stamp()]);
    const row = rows[0];
    if (row) {
      req.auth = { user: row, sessionId: row.session_id };
      if (Date.now() - new Date(row.last_seen_at).getTime() > 3_600_000) await db.query("UPDATE temt_sessions SET last_seen_at = $2 WHERE id = $1", [row.session_id, stamp()]);
    }
    next();
  });
  const requireUser: RequestHandler = (req: AuthedRequest, res, next) => (req.auth ? next() : fail(res, 401, "not_signed_in", "Sign in to continue."));

  const authLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "rate_limit_exceeded", message: "Too many attempts. Wait a minute and try again." } } });

  async function tooManyFailures(emailKey: string, ip: string) {
    const rows = await db.query<{ key: string; n: string | number }>(
      "SELECT key, count(*) AS n FROM temt_login_failures WHERE key IN ($1, $2) AND at > $3 GROUP BY key",
      [`email:${sha256(emailKey)}`, `ip:${ip}`, stamp(-FAILURE_WINDOW_MINUTES * 60_000)]);
    return rows.some((row) => Number(row.n) >= (row.key.startsWith("email:") ? MAX_EMAIL_FAILURES : MAX_IP_FAILURES));
  }
  async function recordFailure(emailKey: string, ip: string) {
    const at = stamp();
    await db.query("INSERT INTO temt_login_failures (key, at) VALUES ($1, $3), ($2, $3)", [`email:${sha256(emailKey)}`, `ip:${ip}`, at]);
    if (Math.random() < 0.05) await db.query("DELETE FROM temt_login_failures WHERE at < $1", [stamp(-86_400_000)]);
  }

  router.get("/auth/me", (req: AuthedRequest, res) => {
    res.json({ user: req.auth ? publicUser(req.auth.user) : null, storage: { mode: db.mode, persistent: db.persistent } });
  });

  router.post("/auth/signup", authLimit, json, async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid_request", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    const { name, email: address, password: secret, organisation, jobTitle } = parsed.data;
    const hash = await hashPassword(secret);
    const id = randomUUID();
    const inserted = await db.query<UserRow>(
      `INSERT INTO temt_users (id, email, email_key, name, organisation, job_title, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (email_key) DO NOTHING RETURNING *`, [id, address, address, name, organisation, jobTitle, hash, stamp()]);
    const user = inserted[0];
    if (!user) return fail(res, 409, "email_taken", "An account with this email already exists. Sign in instead.");
    await startSession(req, res, user.id);
    await log(user.id, "account_created");
    res.status(201).json({ user: publicUser(user) });
  });

  router.post("/auth/signin", authLimit, json, async (req, res) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid_request", "Enter your email and password.");
    const ip = req.ip ?? "unknown";
    if (await tooManyFailures(parsed.data.email, ip)) return fail(res, 429, "too_many_failures", `Too many failed attempts. Try again in ${FAILURE_WINDOW_MINUTES} minutes.`);
    const user = (await db.query<UserRow>("SELECT * FROM temt_users WHERE email_key = $1", [parsed.data.email]))[0];
    const ok = await verifyPassword(parsed.data.password, user?.password_hash ?? await dummyHash());
    if (!user || !ok) {
      await recordFailure(parsed.data.email, ip);
      return fail(res, 401, "invalid_credentials", "Email or password is incorrect.");
    }
    await startSession(req, res, user.id);
    await log(user.id, "signed_in", deviceOf(req));
    res.json({ user: publicUser(user) });
  });

  router.post("/auth/signout", async (req: AuthedRequest, res) => {
    if (req.auth) await db.query("DELETE FROM temt_sessions WHERE id = $1", [req.auth.sessionId]);
    clearSession(req, res);
    res.json({ ok: true });
  });

  router.patch("/account", requireUser, json, async (req: AuthedRequest, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid_request", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    const { name, organisation, jobTitle } = parsed.data;
    const user = (await db.query<UserRow>(
      `UPDATE temt_users SET name = COALESCE($2, name), organisation = COALESCE($3, organisation), job_title = COALESCE($4, job_title), updated_at = $5
       WHERE id = $1 RETURNING *`, [req.auth!.user.id, name ?? null, organisation ?? null, jobTitle ?? null, stamp()]))[0]!;
    await log(user.id, "profile_updated");
    res.json({ user: publicUser(user) });
  });

  router.post("/account/password", requireUser, authLimit, json, async (req: AuthedRequest, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid_request", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    if (!(await verifyPassword(parsed.data.current, req.auth!.user.password_hash))) return fail(res, 401, "invalid_credentials", "Your current password is incorrect.");
    await db.query("UPDATE temt_users SET password_hash = $2, updated_at = $3 WHERE id = $1", [req.auth!.user.id, await hashPassword(parsed.data.next), stamp()]);
    await db.query("DELETE FROM temt_sessions WHERE user_id = $1 AND id <> $2", [req.auth!.user.id, req.auth!.sessionId]);
    await log(req.auth!.user.id, "password_changed", "Other sessions signed out");
    res.json({ ok: true });
  });

  router.get("/account/sessions", requireUser, async (req: AuthedRequest, res) => {
    const rows = await db.query<{ id: string; user_agent: string; created_at: Date; last_seen_at: Date }>(
      "SELECT id, user_agent, created_at, last_seen_at FROM temt_sessions WHERE user_id = $1 AND expires_at > $2 ORDER BY last_seen_at DESC LIMIT 50", [req.auth!.user.id, stamp()]);
    res.json({ sessions: rows.map((row) => ({ id: row.id, device: row.user_agent, createdAt: iso(row.created_at), lastSeenAt: iso(row.last_seen_at), current: row.id === req.auth!.sessionId })) });
  });

  router.delete("/account/sessions/:id", requireUser, async (req: AuthedRequest, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "invalid_request", "Unknown session.");
    const rows = await db.query("DELETE FROM temt_sessions WHERE id = $1 AND user_id = $2 RETURNING id", [id.data, req.auth!.user.id]);
    if (!rows.length) return fail(res, 404, "not_found", "Session not found.");
    if (id.data === req.auth!.sessionId) clearSession(req, res);
    await log(req.auth!.user.id, "session_revoked");
    res.json({ ok: true });
  });

  router.post("/account/sessions/revoke-others", requireUser, async (req: AuthedRequest, res) => {
    const rows = await db.query("DELETE FROM temt_sessions WHERE user_id = $1 AND id <> $2 RETURNING id", [req.auth!.user.id, req.auth!.sessionId]);
    await log(req.auth!.user.id, "sessions_revoked", `${rows.length} other sessions`);
    res.json({ revoked: rows.length });
  });

  router.get("/account/activity", requireUser, async (req: AuthedRequest, res) => {
    const rows = await db.query<{ kind: string; detail: string; created_at: Date }>("SELECT kind, detail, created_at FROM temt_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60", [req.auth!.user.id]);
    res.json({ activity: rows.map((row) => ({ kind: row.kind, detail: row.detail, at: iso(row.created_at) })) });
  });

  router.get("/account/export", requireUser, async (req: AuthedRequest, res) => {
    const id = req.auth!.user.id;
    const [workspace] = await db.query<{ data: unknown; version: number; updated_at: Date }>("SELECT data, version, updated_at FROM temt_workspaces WHERE user_id = $1", [id]);
    const reports = await db.query("SELECT title, period, format, shipments, wtw_kg, created_at FROM temt_reports WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    const activity = await db.query("SELECT kind, detail, created_at FROM temt_activity WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    res.setHeader("Content-Disposition", 'attachment; filename="temt-account-export.json"');
    res.json({ exportedAt: new Date().toISOString(), account: publicUser(req.auth!.user), workspace: workspace ? { version: workspace.version, updatedAt: iso(workspace.updated_at), data: workspace.data } : null, reports, activity });
  });

  router.delete("/account", requireUser, json, async (req: AuthedRequest, res) => {
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success || !(await verifyPassword(parsed.data.password, req.auth!.user.password_hash))) return fail(res, 401, "invalid_credentials", "Enter your password to delete the account.");
    await db.query("DELETE FROM temt_users WHERE id = $1", [req.auth!.user.id]);
    clearSession(req, res);
    res.json({ ok: true });
  });

  // ─── Workspace sync ──────────────────────────────────────────────────────
  router.get("/workspace", requireUser, async (req: AuthedRequest, res) => {
    const [row] = await db.query<{ data: unknown; version: number; shipments: number; bytes: number; device: string; updated_at: Date }>(
      "SELECT data, version, shipments, bytes, device, updated_at FROM temt_workspaces WHERE user_id = $1", [req.auth!.user.id]);
    if (!row) return res.json({ version: 0, data: null });
    res.json({ version: row.version, shipments: row.shipments, bytes: row.bytes, device: row.device, updatedAt: iso(row.updated_at), data: typeof row.data === "string" ? JSON.parse(row.data) : row.data });
  });

  router.get("/workspace/summary", requireUser, async (req: AuthedRequest, res) => {
    const [row] = await db.query<{ data: unknown; version: number; updated_at: Date; device: string; bytes: number }>("SELECT data, version, updated_at, device, bytes FROM temt_workspaces WHERE user_id = $1", [req.auth!.user.id]);
    if (!row) return res.json({ version: 0, summary: null });
    const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as { settings: Record<string, unknown>; shipments: { input: unknown }[] };
    res.json({ version: row.version, updatedAt: iso(row.updated_at), device: row.device, bytes: row.bytes, summary: summarise(data) });
  });

  router.put("/workspace", requireUser, express.raw({ type: ["application/gzip", "application/json"], limit: MAX_WORKSPACE_UPLOAD }), async (req: AuthedRequest, res) => {
    const base = Number(req.get("x-temt-base-version"));
    if (!Number.isInteger(base) || base < 0) return fail(res, 400, "invalid_request", "Missing the workspace version this upload is based on.");
    if (!Buffer.isBuffer(req.body)) return fail(res, 415, "unsupported_media_type", "Send the workspace as JSON or gzip-compressed JSON.");
    let parsed: z.infer<typeof workspaceSchema>;
    let bytes: number;
    try {
      const raw = req.is("application/gzip") ? await unzip(req.body) : req.body;
      bytes = raw.length;
      const result = workspaceSchema.safeParse(JSON.parse(raw.toString("utf8")));
      if (!result.success) return fail(res, 400, "invalid_workspace", "The workspace is not in TEMT's format.");
      parsed = result.data;
    } catch {
      return fail(res, 400, "invalid_workspace", `The workspace could not be read, or is larger than ${MAX_WORKSPACE_BYTES / 1024 / 1024} MB uncompressed.`);
    }
    // Optimistic concurrency: the update only applies if nobody synced a newer version in the meantime.
    const rows = await db.query<{ version: number; updated_at: Date }>(
      `INSERT INTO temt_workspaces AS w (user_id, version, data, shipments, bytes, device, updated_at) VALUES ($1, 1, $2, $3, $4, $5, $7)
       ON CONFLICT (user_id) DO UPDATE SET version = w.version + 1, data = excluded.data, shipments = excluded.shipments, bytes = excluded.bytes, device = excluded.device, updated_at = excluded.updated_at
       WHERE w.version = $6
       RETURNING version, updated_at`,
      [req.auth!.user.id, JSON.stringify(parsed), parsed.shipments.length, bytes, deviceOf(req), base, stamp()]);
    const row = rows[0];
    if (!row) {
      const [current] = await db.query<{ version: number; updated_at: Date; device: string }>("SELECT version, updated_at, device FROM temt_workspaces WHERE user_id = $1", [req.auth!.user.id]);
      return fail(res, 409, "version_conflict", "Your account has a newer copy of this workspace.", { version: current?.version ?? 0, updatedAt: iso(current?.updated_at), device: current?.device });
    }
    await log(req.auth!.user.id, "workspace_synced", `${parsed.shipments.length} shipments, version ${row.version}`);
    res.json({ version: row.version, updatedAt: iso(row.updated_at) });
  });

  // ─── Report history ──────────────────────────────────────────────────────
  router.get("/reports", requireUser, async (req: AuthedRequest, res) => {
    const rows = await db.query<{ id: string; title: string; period: string; format: string; shipments: number; wtw_kg: number; created_at: Date }>(
      "SELECT id, title, period, format, shipments, wtw_kg, created_at FROM temt_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [req.auth!.user.id]);
    res.json({ reports: rows.map((row) => ({ id: row.id, title: row.title, period: row.period, format: row.format, shipments: row.shipments, wtwKg: Number(row.wtw_kg), createdAt: iso(row.created_at) })) });
  });

  router.post("/reports", requireUser, json, async (req: AuthedRequest, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid_request", "The report record is incomplete.");
    const { title, period, format, shipments, wtwKg } = parsed.data;
    await db.query("INSERT INTO temt_reports (id, user_id, title, period, format, shipments, wtw_kg, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [randomUUID(), req.auth!.user.id, title, period, format, shipments, wtwKg, stamp()]);
    await log(req.auth!.user.id, "report_generated", `${format.toUpperCase()} · ${period}`);
    res.status(201).json({ ok: true });
  });

  return router;
}
