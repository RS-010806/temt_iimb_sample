/**
 * One-time lookup of coordinates from FOIS (Indian Railways / CRIS) for station codes that TEMT's rail data
 * cannot place from the 2016 datameet set. Uses RailSAHAY's terminal search, one code per request, one request
 * at a time and at most one a second, and saves every point each answer returns. Resumable: codes already answered are skipped.
 *
 *   node scripts/fetch-fois-stations.mjs <path to cached fois-asttn.js>
 *
 * Writes scripts/data/fois-stations.json: { code: [name, lat, lon, zone, division, district/state] }.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "scripts", "data", "fois-stations.json");
const STATIONS = path.join(ROOT, "apps", "web", "public", "data", "geo", "stations.json");
const UA = "TEMT-rail-distance/1.0 (+https://temt-iimb-sample.onrender.com)";
const GAP_MS = 1000;
const EXCLUDE = /\b(CABIN|BLOCK HUT|BLOCK STATION|LOCO|DIESEL SHED|ELECTRIC SHED|EMU SHED|CARRIAGE|POWER CAR|IB|INTERMEDIATE BLOCK)\b/;

const master = fs.readFileSync(process.argv[2], "utf8");
const fois = new Map();
for (const [, item] of master.slice(master.indexOf("[")).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
  const match = item.trim().match(/^(.*)- ([A-Z0-9]+) \(([A-Z]+)\)$/);
  if (match) fois.set(match[2], match[1].trim());
}
// Points already in TEMT, including sidings placed at the station that serves them (FOIS charges to that station).
const located = new Set(JSON.parse(fs.readFileSync(STATIONS, "utf8")).map((row) => row[0]));
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { source: "FOIS RailSAHAY terminal search (GG_TrmlDataJson, STTN_LIST)", asked: [], points: {} };
const asked = new Set(store.asked);
const wanted = [...fois].filter(([code, name]) => !located.has(code) && !(EXCLUDE.test(name) || (/\bYARD\b/.test(name) && !name.includes("TERMINAL")))).map(([code]) => code);
const todo = () => wanted.filter((code) => !asked.has(code) && !store.points[code]);
console.log(`FOIS codes without a location of their own: ${wanted.length}; still to ask: ${todo().length}`);

const save = () => { store.asked = [...asked].sort(); fs.writeFileSync(OUT, JSON.stringify(store, null, 0).replace(/\],"/g, '],\n"')); };
let requests = 0, failures = 0;
for (const code of todo()) {
  if (store.points[code]) continue;
  const started = Date.now();
  try {
    const response = await fetch("https://www.fois.indianrail.gov.in/RailSAHAY/GG_TrmlDataJson", {
      method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ Optn: "STTN_LIST", Sttn: code }), signal: AbortSignal.timeout(30_000),
    });
    const data = JSON.parse(await response.text());
    for (const item of data.SttnList ?? []) {
      const match = String(item.Sttn).match(/^([A-Z0-9]+) \((.*)\)$/);
      const lat = Number(item.Lat), lon = Number(item.Lan);
      if (!match || !(lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 98)) continue;
      store.points[match[1]] = [match[2].trim(), lat, lon, item.Zone ?? "", item.Dvsn ?? "", item.Stat ?? ""];
    }
    asked.add(code);
    failures = 0;
  } catch (error) {
    failures += 1;
    console.log(`${code}: ${error instanceof Error ? error.message : error}`);
    if (failures >= 5) { console.log("FOIS is not answering; stopping. Run again later to resume."); break; }
  }
  requests += 1;
  if (requests % 25 === 0) { save(); console.log(`${requests} requests, ${Object.keys(store.points).length} points saved, ${todo().length} codes left`); }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, GAP_MS - (Date.now() - started))));
}
save();
const found = wanted.filter((code) => store.points[code]).length;
console.log(`Done: ${requests} requests. ${found} of ${wanted.length} codes now have FOIS coordinates; ${Object.keys(store.points).length} points saved in all.`);
