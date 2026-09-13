import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5.");

const server = createApp({ trustProxyHops }).listen(port, "0.0.0.0", () => {
  // Startup metadata only. Shipment data and request bodies must never be logged.
  console.info(`TEMT API listening on port ${port}. Shipment persistence is disabled.`);
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
