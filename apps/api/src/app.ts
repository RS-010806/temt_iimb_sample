import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { analyze, AnalysisInputError, ENGINE_VERSION, FACTORS, MAX_LEGS } from "@temt/calculator";

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export interface AppOptions {
  allowedOrigins?: readonly string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  /** Number of reverse proxies controlled by the hosting platform. Defaults to zero. */
  trustProxyHops?: number;
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

/** Stateless service. Request bodies are never persisted or logged. */
export function createApp(options: AppOptions = {}) {
  const app = express();
  const allowedOrigins = new Set(options.allowedOrigins === undefined
    ? parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
    : parseAllowedOrigins(options.allowedOrigins.join(",")));
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxyHops ?? 0);
  app.use(helmet());
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: { code: "origin_not_allowed", message: "This origin is not allowed." } });
      return;
    }
    next();
  });
  app.use(cors({
    origin(origin, callback) { callback(null, origin === undefined || allowedOrigins.has(origin)); },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
    maxAge: 600,
  }));

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ status: "ok", engineVersion: ENGINE_VERSION, persistence: "none" });
  });

  app.use("/api", rateLimit({
    windowMs: options.rateLimitWindowMs ?? 60_000,
    limit: options.rateLimitMax ?? 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limit_exceeded", message: "Too many requests. Please try again shortly." } },
  }));

  app.get("/api/factors", (_req, res) => {
    res.json({ engineVersion: ENGINE_VERSION, maxLegs: MAX_LEGS, factors: FACTORS,
      methodology: "Illustrative well-to-wheel estimates using published GLEC v3.2 defaults. No certification or complete reporting compliance is implied." });
  });

  app.post("/api/analyze", (req, res, next) => {
    if (!req.is("application/json")) {
      res.status(415).json({ error: { code: "unsupported_media_type", message: "Send an application/json request body." } });
      return;
    }
    next();
  }, express.json({ limit: MAX_BODY_BYTES, strict: true }), (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "invalid_request", message: "Provide a JSON object containing a rows array." } });
      return;
    }
    res.json(analyze(parsed.data.rows));
  });

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
    res.status(500).json({ error: { code: "internal_error", message: "The analysis could not be completed. Please try again." } });
  };
  app.use(errorHandler);
  return app;
}
