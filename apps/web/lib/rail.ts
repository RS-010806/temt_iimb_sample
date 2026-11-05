import { greatCircleKm, type LatLon } from "@temt/calculator";

/**
 * Indian Railways stations, freight terminals and network, built by scripts/build-rail-data.py. Codes, names and
 * zones follow the FOIS station master (Indian Railways' Freight Operations Information System); coordinates and
 * the track graph come from the datameet railways dataset (CC0), with FOIS's own coordinates for points opened since
 * (scripts/data/fois-stations.json). Sidings, goods sheds and container depots without
 * coordinates of their own sit at the station that serves them, as FOIS charges their traffic. Rail distances are
 * shortest paths over the network, on average within about 3% of published and FOIS freight-calculator distances.
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

export interface RailRoute {
  km: number;
  from: Station & { distanceKm: number };
  to: Station & { distanceKm: number };
}

/** Rail distance between two places: station codes are used directly, other places use their nearest station. */
export async function railRoute(from: LatLon & { code?: string; kind?: string }, to: LatLon & { code?: string; kind?: string }): Promise<RailRoute | undefined> {
  const network = await loadRailNetwork();
  const resolve = (place: LatLon & { code?: string; kind?: string }) => {
    const exact = place.kind === "station" && place.code ? network.index.get(place.code) : undefined;
    return exact !== undefined ? { ...network.stations[exact]!, distanceKm: 0 } : nearestStation(network.stations, place);
  };
  const a = resolve(from), b = resolve(to);
  const km = shortestKm(network, network.index.get(a.code)!, network.index.get(b.code)!);
  return km === undefined ? undefined : { km, from: a, to: b };
}
