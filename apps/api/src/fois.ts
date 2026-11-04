/**
 * Official Indian Railways freight distances from FOIS (Freight Operations Information System, run by CRIS),
 * read from the RailSAHAY freight calculator: the "rationalised" route Indian Railways charges freight over, or
 * the shortest route where no rationalised route is set.
 *
 * FOIS is a public government service, so TEMT asks it politely: one request at a time, at least a second apart,
 * a short queue, and a pause after repeated failures. Every answer is kept (in the database when one is configured,
 * and in memory), so each station pair is asked once. Callers fall back to TEMT's own network estimate when FOIS
 * does not answer.
 */
import type { Db } from "./db.js";

export const FOIS_CALCULATOR = "https://www.fois.indianrail.gov.in/RailSAHAY/FrgtCalc";
const USER_AGENT = "TEMT-rail-distance/1.0 (+https://temt-iimb-sample.onrender.com)";
/** FOIS only quotes a distance for a commodity and wagon it allows between the two points. Tried in order. */
const CARGO: readonly (readonly [commodity: string, wagon: string])[] = [
  ["CEMENT", "BCN- BOGE COVERED AIR BRAKES"],
  ["COAL", "BOXNHL- BOGIE OPEN WAGON AIR BRAKES"],
];
export const STATION_CODE = /^[A-Z0-9]{1,7}$/;

export interface RailDistance {
  from: string;
  to: string;
  km: number;
  /** "rationalised" when Indian Railways has fixed a charging route for the pair, else "shortest". */
  route: "rationalised" | "shortest";
  /** The junctions FOIS lists along the route, as station codes. */
  via: string[];
  fetchedAt: string;
}

export type FoisAnswer = { ok: true; distance: RailDistance } | { ok: false; reason: "no_route" | "unavailable" | "busy"; cause?: string };

export interface FoisOptions {
  /** Defaults to the global fetch. Tests pass a stub. */
  fetch?: typeof fetch;
  /** Minimum time between two requests to FOIS. */
  minGapMs?: number;
  timeoutMs?: number;
  /** Requests waiting for FOIS beyond this are answered "busy" so the caller can fall back at once. */
  maxQueue?: number;
  /** Set to false to switch the lookups off (the endpoint then always answers "unavailable"). */
  enabled?: boolean;
}

const decode = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;|&#x[0-9a-f]+;/gi, " ").replace(/\s+/g, " ");

/** Reads the route and distance from a FOIS freight calculator page. */
export function parseFoisPage(html: string): Pick<RailDistance, "km" | "route" | "via"> | undefined {
  const text = decode(html);
  const routes = [...text.matchAll(/Route \((Rationali[sz]ed|Shortest)\)\s*([A-Z0-9 -]*?)\s*-->\s*Distance:\s*([\d,]+)\s*Kms/gi)];
  const best = routes.find((match) => /^rationali/i.test(match[1]!)) ?? routes[0];
  if (!best) return undefined;
  const km = Number(best[3]!.replace(/,/g, ""));
  if (!Number.isFinite(km) || km <= 0 || km > 6000) return undefined;
  return { km, route: /^rationali/i.test(best[1]!) ? "rationalised" : "shortest", via: best[2]!.split("-").map((code) => code.trim()).filter((code) => STATION_CODE.test(code)) };
}

interface Row { km: number; route: string; via: string; fetched_at: string }

export function createFois(getDb: () => Promise<Db>, options: FoisOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const minGapMs = options.minGapMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxQueue = options.maxQueue ?? 40;
  const enabled = options.enabled ?? true;
  const memory = new Map<string, RailDistance | "no_route">();
  const pending = new Map<string, Promise<FoisAnswer>>();
  let chain: Promise<unknown> = Promise.resolve();
  let queued = 0, lastStart = 0, failures = 0, pausedUntil = 0, lastCause = "";

  const remember = (key: string, value: RailDistance | "no_route") => {
    if (memory.size >= 20_000) memory.delete(memory.keys().next().value!);
    memory.set(key, value);
  };

  async function stored(from: string, to: string): Promise<RailDistance | undefined> {
    const db = await getDb().catch(() => undefined);
    if (!db) return undefined;
    const [row] = await db.query<Row>("SELECT km, route, via, fetched_at FROM temt_rail_distances WHERE from_code = $1 AND to_code = $2", [from, to]).catch(() => []);
    return row ? { from, to, km: Number(row.km), route: row.route === "shortest" ? "shortest" : "rationalised", via: row.via ? row.via.split("-") : [], fetchedAt: row.fetched_at } : undefined;
  }

  async function store(distance: RailDistance) {
    const db = await getDb().catch(() => undefined);
    await db?.query(
      `INSERT INTO temt_rail_distances (from_code, to_code, km, route, via, fetched_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (from_code, to_code) DO UPDATE SET km = $3, route = $4, via = $5, fetched_at = $6`,
      [distance.from, distance.to, distance.km, distance.route, distance.via.join("-"), distance.fetchedAt],
    ).catch(() => undefined);
  }

  /** One polite request to FOIS: waits its turn, then asks for each allowed cargo until a distance comes back. */
  function ask(from: string, to: string): Promise<FoisAnswer> {
    if (queued >= maxQueue) return Promise.resolve({ ok: false, reason: "busy" });
    queued += 1;
    const run = chain.then(async (): Promise<FoisAnswer> => {
      for (const [commodity, wagon] of CARGO) {
        if (Date.now() < pausedUntil) return { ok: false, reason: "unavailable", cause: `paused after repeated failures (last: ${lastCause})` };
        const wait = lastStart + minGapMs - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastStart = Date.now();
        let html: string;
        try {
          const response = await doFetch(FOIS_CALCULATOR, {
            method: "POST",
            headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ txtCmdtName: commodity, txtSttnFrom: from, txtSttnTo: to, txtWgonType: wagon, selRKPM: "R", txtWgonNumb: "" }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          html = await response.text();
        } catch (error) {
          failures += 1;
          // Why FOIS did not answer (timeout, refused connection, TLS, HTTP status): no shipment data is involved.
          const inner = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code ?? error.name : "";
          lastCause = error instanceof Error ? `${error.message}${inner && inner !== "Error" ? ` (${inner})` : ""}`.slice(0, 160) : "unknown";
          // After three failures in a row FOIS is probably down: stop asking for five minutes.
          if (failures >= 3) { pausedUntil = Date.now() + 5 * 60_000; failures = 0; }
          return { ok: false, reason: "unavailable", cause: lastCause };
        }
        failures = 0;
        const parsed = parseFoisPage(html);
        if (parsed) return { ok: true, distance: { from, to, ...parsed, fetchedAt: new Date().toISOString() } };
        // A page without the freight form at all is FOIS's own error page, not an answer about this route.
        if (!/frmFrgtC/.test(html)) { lastCause = `FOIS error page: ${(html.match(/<title>([^<]{0,80})/i)?.[1] ?? "no title").trim()}`; return { ok: false, reason: "unavailable", cause: lastCause }; }
      }
      return { ok: false, reason: "no_route" };
    });
    chain = run.catch(() => undefined).finally(() => { queued -= 1; });
    return run;
  }

  return {
    enabled,
    /** The FOIS distance between two FOIS station codes, from what is stored or else from FOIS. */
    async distance(fromCode: string, toCode: string): Promise<FoisAnswer> {
      const from = fromCode.toUpperCase(), to = toCode.toUpperCase();
      const key = `${from}-${to}`;
      const known = memory.get(key);
      if (known === "no_route") return { ok: false, reason: "no_route" };
      if (known) return { ok: true, distance: known };
      if (!enabled) return { ok: false, reason: "unavailable" };
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const lookup = (async (): Promise<FoisAnswer> => {
        const saved = await stored(from, to);
        if (saved) { remember(key, saved); return { ok: true, distance: saved }; }
        const answer = await ask(from, to);
        if (answer.ok) { remember(key, answer.distance); await store(answer.distance); }
        else if (answer.reason === "no_route") remember(key, "no_route");
        return answer;
      })().finally(() => pending.delete(key));
      pending.set(key, lookup);
      return lookup;
    },
  };
}
