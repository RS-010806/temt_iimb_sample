import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { dbOptionsFromEnv, openDb, type Db, type DbOptions } from "./db.js";
import { createPortal } from "./portal.js";
import {
  analyze, AnalysisInputError, calculateShipment, ENGINE_V2_VERSION, ENGINE_VERSION, FACTOR_SETS, FACTORS, FUELS, GLEC_AIR, HUB_TYPES, IWW_VESSELS, MAX_LEGS,
  RAIL_FACTORS, ROAD_CLASSES, ROAD_FACTORS, shipmentInputSchema, SOURCES, TEMT_AIR, TRADE_LANES, VESSELS,
} from "@temt/calculator";

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export interface AppOptions {
  allowedOrigins?: readonly string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  /** Number of reverse proxies controlled by the hosting platform. Defaults to zero. */
  trustProxyHops?: number;
  /** Account storage. Defaults to DATABASE_URL, else an embedded database (see db.ts). */
  db?: DbOptions;
  /** An already-open database, for example in tests. */
  database?: Db;
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = value === undefined ? ["http://localhost:3000"] : value.split(",").map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error("ALLOWED_ORIGINS must contain exact HTTP(S) origins separated by commas."); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || origin.includes("*") || parsed.username || parsed.password) {
      throw new Error("ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths, wildcards or credentials.");
    }
  }
  return [...new Set(origins)];
}

const requestSchema = z.object({ rows: z.array(z.unknown()) });
export const MAX_V2_SHIPMENTS = 1000;
const v2Schema = z.object({ factorSet: z.enum(["glec-india", "temt-legacy"]).optional(), shipments: z.array(z.unknown()).max(MAX_V2_SHIPMENTS) });

const requireJson: express.RequestHandler = (req, res, next) => {
  if (!req.is("application/json")) {
    res.status(415).json({ error: { code: "unsupported_media_type", message: "Send an application/json request body." } });
    return;
  }
  next();
};

/**
 * Calculation endpoints are stateless. Account endpoints store only what a signed-in user syncs.
 * Request bodies are never logged.
 */
export function createApp(options: AppOptions = {}) {
  const app = express();
  let dbPromise: Promise<Db> | undefined;
  const getDb = () => (dbPromise ??= (options.database ? Promise.resolve(options.database) : openDb(options.db ?? dbOptionsFromEnv())).catch((error: unknown) => { dbPromise = undefined; throw error; }));
  const allowedOrigins = new Set(options.allowedOrigins === undefined
    ? parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
    : parseAllowedOrigins(options.allowedOrigins.join(",")));
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxyHops ?? 0);
  app.use(helmet());
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.get("origin");
    // Same-origin requests (the web app and API served from one host, as on Vercel) are always allowed.
    const sameOrigin = origin !== undefined && (() => { try { return new URL(origin).host === req.get("host"); } catch { return false; } })();
    if (origin !== undefined && !sameOrigin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: { code: "origin_not_allowed", message: "This origin is not allowed." } });
      return;
    }
    next();
  });
  app.use(cors({
    origin(origin, callback) { callback(null, origin === undefined || allowedOrigins.has(origin)); },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-TEMT-Client", "X-TEMT-Base-Version"],
    // Only the exact origins in ALLOWED_ORIGINS (for example the local web app) may send the session cookie.
    credentials: true,
    maxAge: 600,
  }));

  app.get(["/health", "/api/health"], async (_req, res) => {
    const db = await getDb().catch(() => undefined);
    res.json({ status: "ok", engineVersion: ENGINE_V2_VERSION, accounts: db ? { storage: db.mode, persistent: db.persistent } : { storage: "unavailable", persistent: false } });
  });

  app.use("/api", rateLimit({
    windowMs: options.rateLimitWindowMs ?? 60_000,
    // Generous per-IP ceiling: many employees can share one office IP. Sign-in has its own stricter limits.
    limit: options.rateLimitMax ?? 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limit_exceeded", message: "Too many requests. Please try again shortly." } },
  }));

  app.get("/api/factors", (_req, res) => {
    res.json({ engineVersion: ENGINE_VERSION, maxLegs: MAX_LEGS, factors: FACTORS,
      methodology: "Illustrative well-to-wheel estimates using published GLEC v3.2 defaults. No certification or complete reporting compliance is implied." });
  });

  app.post("/api/analyze", requireJson, express.json({ limit: MAX_BODY_BYTES, strict: true }), (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "invalid_request", message: "Provide a JSON object containing a rows array." } });
      return;
    }
    res.json(analyze(parsed.data.rows));
  });

  // Engine v2: multimodal transport chains with versioned factor sets. Same code as the browser.
  app.get("/api/v2/factors", (_req, res) => {
    res.json({ engineVersion: ENGINE_V2_VERSION, factorSets: FACTOR_SETS, sources: SOURCES, road: { classes: ROAD_CLASSES, factors: ROAD_FACTORS },
      rail: RAIL_FACTORS, air: { glec: GLEC_AIR, temt: TEMT_AIR }, sea: { tradeLanes: TRADE_LANES, vessels: VESSELS }, inlandWaterways: IWW_VESSELS, hubs: HUB_TYPES, fuels: FUELS });
  });

  app.post("/api/v2/calculate", requireJson, express.json({ limit: MAX_BODY_BYTES, strict: true }), (req, res) => {
    const parsed = v2Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "invalid_request", message: `Provide a JSON object with a shipments array of at most ${MAX_V2_SHIPMENTS} items.` } });
      return;
    }
    const factorSet = parsed.data.factorSet ?? "glec-india";
    const totals = { wtwKg: 0, ttwKg: 0, wttKg: 0, hubKg: 0, tonneKm: 0, shipments: 0 };
    const results = parsed.data.shipments.map((raw, index) => {
      const id = raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string" ? raw.id.slice(0, 128) : String(index);
      const input = shipmentInputSchema.safeParse(raw);
      if (!input.success) return { id, error: input.error.issues.map((issue) => `${issue.path.join(".") || "shipment"}: ${issue.message}`).join(" ") };
      try {
        const full = calculateShipment(input.data, factorSet);
        // Publish results and their basis (factor, source, data type), not the engine's internal working.
        const result = { ...full, legs: full.legs.map(({ trace: _trace, ...leg }) => leg), hubs: full.hubs.map(({ trace: _trace, ...hub }) => hub) };
        totals.wtwKg += result.wtwKg; totals.ttwKg += result.ttwKg; totals.wttKg += result.wttKg; totals.hubKg += result.hubKg; totals.tonneKm += result.tonneKm; totals.shipments += 1;
        return { id, result };
      } catch (error) {
        return { id, error: error instanceof Error ? error.message : "Calculation failed." };
      }
    });
    res.json({ engineVersion: ENGINE_V2_VERSION, factorSet, totals, results, calculatedAt: new Date().toISOString() });
  });

  app.use("/api", createPortal(getDb));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Endpoint not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AnalysisInputError) {
      res.status(error.code === "row_limit_exceeded" ? 413 : 400).json({ error: { code: error.code, message: error.message } });
      return;
    }
    const parserError = error as { type?: string; status?: number } | null;
    if (parserError?.type === "entity.too.large") {
      res.status(413).json({ error: { code: "body_too_large", message: "Request bodies must not exceed 2 MiB." } });
      return;
    }
    if (parserError?.type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "invalid_json", message: "The request body contains invalid JSON." } });
      return;
    }
    if (parserError?.status === 415) {
      res.status(415).json({ error: { code: "unsupported_encoding", message: "The request body uses an unsupported encoding." } });
      return;
    }
    if (typeof parserError?.status === "number" && parserError.status >= 400 && parserError.status < 500) {
      res.status(400).json({ error: { code: "invalid_request", message: "The request could not be read." } });
      return;
    }
    res.status(500).json({ error: { code: "internal_error", message: "The request could not be completed. Please try again." } });
  };
  app.use(errorHandler);
  return app;
}
