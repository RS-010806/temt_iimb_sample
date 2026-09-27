// Serves the production build the way Vercel does: static export, the API at /api on the same origin,
// and the headers (including the Content-Security-Policy) from vercel.json. Used for end-to-end checks.
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../apps/api/dist/app.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "apps/web/out");
const port = Number(process.env.PORT ?? 3000);
const rules = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")).headers.map((rule) => ({
  pattern: new RegExp(`^${rule.source.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === "(" || c === ")" ? c : `\\${c}`)).replace(/\(\\\.\*\)|\(\.\*\)/g, ".*")}$`),
  headers: rule.headers,
}));

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  for (const rule of rules) if (rule.pattern.test(req.path)) for (const { key, value } of rule.headers) res.setHeader(key, value);
  next();
});
const api = createApp({ allowedOrigins: [], db: process.env.TEMT_DATA_DIR ? { dataDir: process.env.TEMT_DATA_DIR } : {} });
app.use((req, res, next) => (req.path === "/api" || req.path.startsWith("/api/") ? api(req, res, next) : next()));
app.use(express.static(out, { extensions: ["html"] }));
app.use((_req, res) => res.status(404).sendFile(path.join(out, "404.html")));
app.listen(port, () => console.info(`Preview on http://localhost:${port} (static build + API + production headers)`));
