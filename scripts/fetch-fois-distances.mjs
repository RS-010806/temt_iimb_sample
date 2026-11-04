/**
 * Saves Indian Railways' FOIS freight distances for well-known station pairs into the web app, so the demo routes
 * and the checks in scripts/build-rail-data.py answer at once, without a live FOIS lookup.
 *
 *   npm run build --workspace=@temt/api && node scripts/fetch-fois-distances.mjs [FROM-TO …] [--db path/to/accounts.sqlite]
 *
 * Pairs: the checks in build-rail-data.py, any FROM-TO codes given, and (with --db) every pair a local API has
 * already looked up, for example during the end-to-end run. Uses the API's own polite FOIS client (apps/api/src/fois.ts).
 * Writes apps/web/public/data/geo/fois-distances.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFois } from "../apps/api/dist/fois.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "apps", "web", "public", "data", "geo", "fois-distances.json");
const args = process.argv.slice(2);
const pairs = new Set();
const build = fs.readFileSync(path.join(ROOT, "scripts", "build-rail-data.py"), "utf8");
for (const [, a, b] of build.matchAll(/\("([A-Z0-9]+)", "([A-Z0-9]+)", \d+\)/g)) pairs.add(`${a}-${b}`);
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--db") {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(args[(i += 1)]);
    for (const row of db.prepare("SELECT from_code, to_code FROM temt_rail_distances").all()) pairs.add(`${row.from_code}-${row.to_code}`);
  } else if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(args[i])) pairs.add(args[i]);
}

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).distances : [];
const byPair = new Map(existing.map((item) => [`${item.from}-${item.to}`, item]));
const fois = createFois(() => Promise.reject(new Error("no database")), { minGapMs: 1000 });
for (const pair of [...pairs].sort()) {
  const [from, to] = pair.split("-");
  if (byPair.has(pair) || byPair.has(`${to}-${from}`)) continue;
  const answer = await fois.distance(from, to);
  console.log(pair, answer.ok ? `${answer.distance.km} km (${answer.distance.route})` : answer.reason);
  if (answer.ok) byPair.set(pair, { from, to, km: answer.distance.km, route: answer.distance.route, via: answer.distance.via, fetchedAt: answer.distance.fetchedAt.slice(0, 10) });
}
const distances = [...byPair.values()].sort((a, b) => `${a.from}-${a.to}`.localeCompare(`${b.from}-${b.to}`));
fs.writeFileSync(OUT, JSON.stringify({ source: "FOIS, Indian Railways (RailSAHAY freight calculator)", distances }).replace(/\},\{/g, "},\n{"));
console.log(`${distances.length} FOIS distances saved to ${path.relative(ROOT, OUT)}`);
