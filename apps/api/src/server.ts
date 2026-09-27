import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { dbOptionsFromEnv } from "./db.js";

const port = Number(process.env.PORT ?? 3001);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5.");

// Local development keeps accounts in a folder next to the API; production uses DATABASE_URL.
const db = dbOptionsFromEnv();
if (!db.url && !db.dataDir && process.env.NODE_ENV !== "production") db.dataDir = fileURLToPath(new URL("../.data/accounts", import.meta.url));

const server = createApp({ trustProxyHops, db }).listen(port, "0.0.0.0", () => {
  // Startup metadata only. Shipment data and request bodies must never be logged.
  const storage = db.url ? "Postgres" : db.dataDir ? "embedded database on disk" : "in-memory embedded database (accounts reset on restart)";
  console.info(`TEMT API listening on port ${port}. Account storage: ${storage}.`);
});

let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
