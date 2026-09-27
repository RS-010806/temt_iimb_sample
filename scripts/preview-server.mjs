// Serves the production build the way Render does: static export, the API at /api on the same origin,
// and the static site's response headers (including the Content-Security-Policy) from render.yaml.
// Used for end-to-end checks and the product video.
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../apps/api/dist/app.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "apps/web/out");
const port = Number(process.env.PORT ?? 3000);

// Read the static site's `headers:` entries (path / name / value) from render.yaml.
const blueprint = readFileSync(path.join(root, "render.yaml"), "utf8");
const staticSite = blueprint.slice(0, blueprint.indexOf("- type: web", blueprint.indexOf("- type: web") + 1));
const rules = [...staticSite.matchAll(/- path: (\S+)\n\s+name: (\S+)\n\s+value: (.+)/g)].map(([, source, key, value]) => ({
  pattern: new RegExp(`^${source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`),
  key, value: value.trim().replace(/^"(.*)"$/, "$1"),
}));

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  for (const rule of rules) if (rule.pattern.test(req.path)) res.setHeader(rule.key, rule.value);
  next();
});
const api = createApp({ allowedOrigins: [], db: process.env.TEMT_DATA_DIR ? { dataDir: process.env.TEMT_DATA_DIR } : {} });
app.use((req, res, next) => (req.path === "/api" || req.path.startsWith("/api/") ? api(req, res, next) : next()));
// Optional extra folder (the demo video's export viewer), served on the same origin.
if (process.env.DEMO_DIR) app.use("/__demo", express.static(process.env.DEMO_DIR, { extensions: ["html"] }));
app.use(express.static(out, { extensions: ["html"] }));
app.use((_req, res) => res.status(404).sendFile(path.join(out, "404.html")));
app.listen(port, () => console.info(`Preview on http://localhost:${port} (static build + API + production headers)`));
