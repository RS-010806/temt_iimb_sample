import { greatCircleKm, type LatLon } from "@temt/calculator";

/**
 * Indian Railways stations, freight terminals and network, built by scripts/build-rail-data.py. Codes, names and
 * zones follow the FOIS station master (Indian Railways' Freight Operations Information System); coordinates and
 * the track graph come from the datameet railways dataset (CC0). Sidings, goods sheds and container depots without
 * coordinates of their own sit at the station that serves them, as FOIS charges their traffic.
 *
 * Rail distances come from FOIS itself where it answers (Indian Railways' freight route, read by TEMT's server, see
 * apps/api/src/fois.ts), and otherwise from shortest paths over the network, on average within about 3% of FOIS.
 */
export type StationKind = "station" | "siding" | "container" | "goods" | "port";
type StationRow = [code: string, name: string, state: string, lat: number, lon: number, trains: number, aliases?: string[], kind?: StationKind | "", zone?: string, servedBy?: string];

export interface Station extends LatLon {
  code: string;
  name: string;
  state: string;
  /** Number of scheduled passenger trains that stop here: a measure of how well connected the station is. */
  trains: number;
  aliases: string[];
  /** What FOIS lists it as: a station, or a freight siding, container terminal, goods shed or port railhead. */
  kind: StationKind;
  /** Indian Railways zone, as FOIS gives it (NR, CR, SE…). */
  zone?: string;
  /** For a siding or terminal placed at its serving station: that station's code. */
  servedBy?: string;
}

interface Network {
  stations: Station[];
  index: Map<string, number>;
  /** Compressed adjacency: neighbours of station i are targets[offsets[i] … offsets[i + 1]). */
  offsets: Int32Array;
  targets: Int32Array;
  km: Float32Array;
}

const cache: { stations?: Promise<Station[]>; network?: Promise<Network> } = {};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Railway data unavailable (${response.status})`);
  return response.json() as Promise<T>;
}

export const loadStations = () => (cache.stations ??= getJson<StationRow[]>("/data/geo/stations.json")
  .then((rows) => rows.map(([code, name, state, lat, lon, trains, aliases, kind, zone, servedBy]) => ({ code, name, state, lat, lon, trains, aliases: aliases ?? [], kind: kind || "station", zone: zone || undefined, servedBy: servedBy || undefined })))
  .catch((error) => { cache.stations = undefined; throw error; }));

export const loadRailNetwork = () => (cache.network ??= Promise.all([loadStations(), getJson<{ edges: number[] }>("/data/geo/rail-graph.json")])
  .then(([stations, graph]) => {
    const count = stations.length;
    const degree = new Int32Array(count + 1);
    for (let i = 0; i < graph.edges.length; i += 3) { degree[graph.edges[i]! + 1]! += 1; degree[graph.edges[i + 1]! + 1]! += 1; }
    const offsets = new Int32Array(count + 1);
    for (let i = 1; i <= count; i += 1) offsets[i] = offsets[i - 1]! + degree[i]!;
    const fill = offsets.slice(0, count);
    const targets = new Int32Array(offsets[count]!);
    const km = new Float32Array(offsets[count]!);
    for (let i = 0; i < graph.edges.length; i += 3) {
      const a = graph.edges[i]!, b = graph.edges[i + 1]!, length = graph.edges[i + 2]! / 10;
      targets[fill[a]!] = b; km[fill[a]!] = length; fill[a]! += 1;
      targets[fill[b]!] = a; km[fill[b]!] = length; fill[b]! += 1;
    }
    // Earlier codes (CSTM for CSMT, BCT for MMCT…) still find their station, so saved shipments keep their route.
    const index = new Map(stations.map((station, i) => [station.code, i]));
    stations.forEach((station, i) => station.aliases.forEach((alias) => { if (/^[A-Z]{2,5}$/.test(alias) && !index.has(alias)) index.set(alias, i); }));
    return { stations, index, offsets, targets, km };
  })
  .catch((error) => { cache.network = undefined; throw error; }));

/** Shortest distance on the rail network between two stations (Dijkstra with a binary heap). */
function shortestKm(network: Network, from: number, to: number): number | undefined {
  if (from === to) return 0;
  const best = new Float64Array(network.stations.length).fill(Infinity);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]![0] <= heap[i]![0]) break; [heap[parent], heap[i]] = [heap[i]!, heap[parent]!]; i = parent; }
  };
  const pop = () => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1, right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left]![0] < heap[smallest]![0]) smallest = left;
        if (right < heap.length && heap[right]![0] < heap[smallest]![0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
        i = smallest;
      }
    }
    return top;
  };
  best[from] = 0;
  push([0, from]);
  while (heap.length) {
    const [distance, node] = pop();
    if (node === to) return distance;
    if (distance > best[node]!) continue;
    for (let e = network.offsets[node]!; e < network.offsets[node + 1]!; e += 1) {
      const next = network.targets[e]!, total = distance + network.km[e]!;
      if (total < best[next]!) { best[next] = total; push([total, next]); }
    }
  }
  return undefined;
}

/**
 * The station a shipment from this place would most likely use: the best-connected station within 25 km, else the
 * nearest station served by at least five trains.
 */
export function nearestStation(stations: Station[], place: LatLon): Station & { distanceKm: number } {
  // Passenger-served stations only: a place's railhead is a station, not a private siding.
  const ranked = stations.filter((station) => station.kind === "station").map((station) => ({ station, km: greatCircleKm(place, station) })).sort((a, b) => a.km - b.km);
  const nearby = ranked.filter((item) => item.km <= 25).sort((a, b) => b.station.trains - a.station.trains)[0];
  const chosen = nearby ?? ranked.find((item) => item.station.trains >= 5) ?? ranked[0]!;
  return { ...chosen.station, distanceKm: chosen.km };
}

/** How far a container terminal may be from a place and still be its railhead. */
export const RAILHEAD_KM = 40;

/**
 * Where rail freight from a place is most likely loaded: the nearest container terminal (ICD or CONCOR terminal)
 * within 40 km, as intermodal freight is, and FOIS quotes freight distances between these; else the station above.
 */
export function nearestRailhead(stations: Station[], place: LatLon): Station & { distanceKm: number } {
  const terminal = stations.filter((station) => station.kind === "container").map((station) => ({ station, km: greatCircleKm(place, station) }))
    .filter((item) => item.km <= RAILHEAD_KM).sort((a, b) => a.km - b.km)[0];
  return terminal ? { ...terminal.station, distanceKm: terminal.km } : nearestStation(stations, place);
}

export interface RailRoute {
  km: number;
  from: Station & { distanceKm: number };
  to: Station & { distanceKm: number };
}

/** The stations a rail leg between two places runs between: station codes are used directly, other places use their railhead. */
export async function railEnds(from: LatLon & { code?: string; kind?: string }, to: LatLon & { code?: string; kind?: string }) {
  const network = await loadRailNetwork();
  const resolve = (place: LatLon & { code?: string; kind?: string }) => {
    const exact = place.kind === "station" && place.code ? network.index.get(place.code) : undefined;
    return exact !== undefined ? { ...network.stations[exact]!, distanceKm: 0 } : nearestRailhead(network.stations, place);
  };
  return { network, from: resolve(from), to: resolve(to) };
}

/** Rail distance between two places over TEMT's network. */
export async function railRoute(from: LatLon & { code?: string; kind?: string }, to: LatLon & { code?: string; kind?: string }): Promise<RailRoute | undefined> {
  const { network, from: a, to: b } = await railEnds(from, to);
  const km = shortestKm(network, network.index.get(a.code)!, network.index.get(b.code)!);
  return km === undefined ? undefined : { km, from: a, to: b };
}

/** Indian Railways' own freight distance between two FOIS station codes. */
export interface FoisDistance {
  from: string;
  to: string;
  km: number;
  /** "rationalised": the route Indian Railways charges freight over; "shortest" where none is fixed. */
  route: "rationalised" | "shortest";
  /** Junctions along the route, as FOIS lists them. */
  via: string[];
}

// Only `next dev` reaches the API on another port; the deployed site serves it at /api on the same origin.
const API = process.env.NODE_ENV === "development" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "") : "";
const STORE = "temt.fois-distances.v1";
const fois: { seed?: Promise<Record<string, FoisDistance>>; asked: Map<string, { at: number; answer: Promise<FoisDistance | "no_route" | undefined> }> } = { asked: new Map() };

const pairKey = (from: string, to: string) => `${from}-${to}`;
const lookupBoth = (table: Record<string, FoisDistance>, from: string, to: string) => {
  const direct = table[pairKey(from, to)];
  if (direct) return direct;
  // Indian Railways charges the same route in both directions.
  const back = table[pairKey(to, from)];
  return back ? { ...back, from, to, via: [...back.via].reverse() } : undefined;
};
const loadSeed = () => getJson<{ distances: FoisDistance[] }>("/data/geo/fois-distances.json")
  .then((file) => Object.fromEntries(file.distances.map((item) => [pairKey(item.from, item.to), item])))
  .catch(() => ({} as Record<string, FoisDistance>));
function saved(): Record<string, FoisDistance> {
  try { return JSON.parse(globalThis.localStorage?.getItem(STORE) ?? "{}") as Record<string, FoisDistance>; } catch { return {}; }
}
function keep(distance: FoisDistance) {
  try {
    const all = saved();
    all[pairKey(distance.from, distance.to)] = distance;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 500))) delete all[key];
    globalThis.localStorage?.setItem(STORE, JSON.stringify(all));
  } catch { /* storage full or blocked: the distance is still used for this visit */ }
}

/**
 * FOIS's distance between two station codes: from distances shipped with TEMT, then this browser's earlier answers,
 * then TEMT's server, which asks FOIS. "no_route" when FOIS quotes no freight route between the two (for example a
 * passenger terminal that does not handle goods); undefined when FOIS does not answer in time.
 */
export async function foisDistance(fromCode: string, toCode: string, options: { live?: boolean; timeoutMs?: number } = {}): Promise<FoisDistance | "no_route" | undefined> {
  if (!fromCode || !toCode || fromCode === toCode) return undefined;
  const { live = true, timeoutMs = 40_000 } = options;
  const key = pairKey(fromCode, toCode);
  if (!live) {
    // Only what is already known: shipped with TEMT, kept in this browser, or answered earlier in this visit.
    const seed = await (fois.seed ??= loadSeed());
    return lookupBoth(seed, fromCode, toCode) ?? lookupBoth(saved(), fromCode, toCode) ?? (await fois.asked.get(key)?.answer);
  }
  const earlier = fois.asked.get(key);
  // A failed lookup is retried after two minutes; an answer is kept for the visit.
  if (earlier && (Date.now() - earlier.at < 120_000 || (await earlier.answer))) return earlier.answer;
  const answer = (async () => {
    const seed = await (fois.seed ??= loadSeed());
    const known = lookupBoth(seed, fromCode, toCode) ?? lookupBoth(saved(), fromCode, toCode);
    if (known) return known;
    try {
      const response = await fetch(`${API}/api/rail/distance?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 404) return "no_route" as const;
      if (!response.ok) return undefined;
      const body = (await response.json()) as Partial<FoisDistance>;
      if (typeof body.km !== "number" || !(body.km > 0)) return undefined;
      const distance: FoisDistance = { from: fromCode, to: toCode, km: body.km, route: body.route === "shortest" ? "shortest" : "rationalised", via: Array.isArray(body.via) ? body.via.filter((code) => typeof code === "string") : [] };
      keep(distance);
      return distance;
    } catch {
      return undefined;
    }
  })();
  fois.asked.set(key, { at: Date.now(), answer });
  return answer;
}
