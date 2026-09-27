import { AIR_DISTANCE_ADJUSTMENT_KM, CIRCUITY, PORTS, greatCircleKm, landPathKm, nearestPort, seaRoute, type DistanceMethod, type LatLon, type TransportMode } from "@temt/calculator";

export type PlaceKind = "city" | "pin" | "airport" | "port" | "custom";

export interface Place {
  label: string;
  kind: PlaceKind;
  lat?: number;
  lon?: number;
  /** PIN code, IATA code or port id. */
  code?: string;
  state?: string;
  country?: string;
  /** District-level PIN coordinates are less precise than city coordinates. */
  approximate?: boolean;
}

type CityRow = { n: string; s: string; la: number; lo: number; p: number; a?: string[] };
type AirportRow = { c: string; n: string; m: string; k: string; t?: "L" | "M" | "S"; la: number; lo: number };
type PinRow = [number, number, string, string, "c" | "d"];

const cache: { cities?: Promise<CityRow[]>; airports?: Promise<AirportRow[]>; pins?: Promise<Record<string, PinRow>> } = {};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Location data unavailable (${response.status})`);
  return response.json() as Promise<T>;
}

export const loadCities = () => (cache.cities ??= getJson<CityRow[]>("/data/geo/cities.json").catch((error) => { cache.cities = undefined; throw error; }));
export const loadAirports = () => (cache.airports ??= getJson<AirportRow[]>("/data/geo/airports.json").catch((error) => { cache.airports = undefined; throw error; }));
export const loadPins = () => (cache.pins ??= getJson<Record<string, PinRow>>("/data/geo/pincodes.json").catch((error) => { cache.pins = undefined; throw error; }));

const cityPlace = (row: CityRow): Place => ({ label: row.n, kind: "city", lat: row.la, lon: row.lo, state: row.s, country: "IN" });
const airportPlace = (row: AirportRow): Place => ({ label: `${row.m || row.n} (${row.c})`, kind: "airport", code: row.c, lat: row.la, lon: row.lo, country: row.k });
export const portPlace = (id: string): Place | undefined => {
  const port = PORTS.find((item) => item.id === id);
  return port && { label: port.name, kind: "port", code: port.id, lat: port.lat, lon: port.lon, country: port.country };
};

function score(text: string, query: string) {
  const value = text.toLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.split(/[\s,()-]+/).some((word) => word.startsWith(query))) return 2;
  if (value.includes(query)) return 3;
  return 99;
}

export async function searchPlaces(query: string, kinds: PlaceKind[] = ["city", "pin"], limit = 8): Promise<Place[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { place: Place; rank: number; weight: number }[] = [];
  if (kinds.includes("pin") && /^\d{3,6}$/.test(q)) {
    const pins = await loadPins();
    if (q.length === 6 && pins[q]) {
      const [lat, lon, label, state, precision] = pins[q];
      results.push({ place: { label: `${q} · ${label}`, kind: "pin", code: q, lat, lon, state, country: "IN", approximate: precision === "d" }, rank: 0, weight: 1 });
    } else {
      for (const [pin, [lat, lon, label, state, precision]] of Object.entries(pins)) {
        if (!pin.startsWith(q)) continue;
        results.push({ place: { label: `${pin} · ${label}`, kind: "pin", code: pin, lat, lon, state, country: "IN", approximate: precision === "d" }, rank: 1, weight: 0 });
        if (results.length >= limit) break;
      }
    }
  }
  if (kinds.includes("city")) {
    const cities = await loadCities();
    for (const row of cities) {
      const rank = Math.min(score(row.n, q), ...(row.a ?? []).map((alias) => score(alias, q) + 0.5));
      if (rank < 99) results.push({ place: cityPlace(row), rank, weight: row.p });
    }
  }
  if (kinds.includes("airport")) {
    const airports = await loadAirports();
    for (const row of airports) {
      const rank = Math.min(score(row.c, q) - 0.5, score(row.m, q), score(row.n, q) + 0.5);
      if (rank < 99) results.push({ place: airportPlace(row), rank: rank + (row.k === "IN" ? 0 : 0.25), weight: row.k === "IN" ? 1 : 0 });
    }
  }
  if (kinds.includes("port")) {
    for (const port of PORTS) {
      const rank = score(port.name, q);
      if (rank < 99) results.push({ place: portPlace(port.id)!, rank: rank + (port.country === "IN" ? 0 : 0.25), weight: 0 });
    }
  }
  results.sort((a, b) => a.rank - b.rank || b.weight - a.weight);
  const seen = new Set<string>();
  return results.filter(({ place }) => { const key = `${place.kind}:${place.label}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit).map((item) => item.place);
}

/** Resolve free text (city, alias, PIN code, IATA code or port name) to a place. */
export async function resolvePlace(text: string, kinds: PlaceKind[] = ["city", "pin"]): Promise<Place | undefined> {
  const value = text.trim();
  if (!value) return undefined;
  const pin = value.match(/\b(\d{6})\b/);
  if (pin && kinds.includes("pin")) {
    const pins = await loadPins();
    const row = pins[pin[1]!];
    if (row) return { label: `${pin[1]} · ${row[2]}`, kind: "pin", code: pin[1], lat: row[0], lon: row[1], state: row[3], country: "IN", approximate: row[4] === "d" };
  }
  if (kinds.includes("airport")) {
    const iata = value.match(/^([A-Za-z]{3})\b/);
    if (iata) {
      const airports = await loadAirports();
      const hit = airports.find((row) => row.c === iata[1]!.toUpperCase());
      if (hit && (value.length === 3 || value.includes(" - ") || value.includes("("))) return airportPlace(hit);
    }
  }
  const base = value.replace(/\s*\(.*?\)\s*/g, " ").split(",")[0]!.replace(/\b(port|dock complex)\b/gi, "").trim();
  const [first] = await searchPlaces(base, kinds, 1);
  if (first && first.label.toLowerCase().includes(base.toLowerCase().split(/\s+/)[0]!)) return first;
  return undefined;
}

export const hasCoords = (place?: Place): place is Place & LatLon => typeof place?.lat === "number" && typeof place?.lon === "number";

export interface DistanceEstimate {
  km: number;
  method: DistanceMethod;
  note: string;
  via?: string[];
}

/** Estimate the network distance for a leg. Returns undefined when coordinates are missing. */
export function estimateDistance(mode: TransportMode, from?: Place, to?: Place): DistanceEstimate | undefined {
  if (!hasCoords(from) || !hasCoords(to)) return undefined;
  const gcd = greatCircleKm(from, to);
  if (mode === "air") return { km: gcd, method: "great-circle", note: `Great-circle distance between airports. A ${AIR_DISTANCE_ADJUSTMENT_KM} km routing allowance is handled by the factor set.` };
  if (mode === "sea") {
    const a = from.kind === "port" && from.code ? from.code : nearestPort(from).id;
    const b = to.kind === "port" && to.code ? to.code : nearestPort(to).id;
    const route = seaRoute(a, b);
    if (route) return { km: route.km, method: "sea-route", note: `Shortest sea-lane route, ${Math.round(route.nauticalMiles).toLocaleString("en-IN")} nautical miles.`, via: route.via };
    return { km: gcd * 1.2, method: "great-circle", note: "Approximate sea distance." };
  }
  const circuity = mode === "rail" ? CIRCUITY.rail : mode === "iww" ? CIRCUITY.iww : CIRCUITY.road;
  const method: DistanceMethod = mode === "rail" ? "rail-estimate" : mode === "iww" ? "iww-estimate" : "road-estimate";
  const approx = from.approximate || to.approximate ? " One location is a district-level PIN estimate." : "";
  const path = landPathKm(from, to);
  const corridor = path > gcd + 1 ? " via the Siliguri corridor" : "";
  return { km: Math.max(1, path * circuity), method, note: `Estimated ${mode === "road" ? "road" : mode === "rail" ? "rail" : "waterway"} distance: ${Math.round(path).toLocaleString("en-IN")} km straight line${corridor} × ${circuity} network factor.${approx} Replace with the actual distance when you have it.` };
}

/** Nearest airport for freight: a major (large or medium) airport is preferred when it is within 60 km of the closest one. */
export async function nearestAirport(place: LatLon, indiaOnly = true): Promise<Place> {
  const airports = (await loadAirports()).filter((row) => !indiaOnly || row.k === "IN");
  const ranked = airports.map((row) => ({ row, km: greatCircleKm(place, { lat: row.la, lon: row.lo }) })).sort((a, b) => a.km - b.km);
  const nearest = ranked[0]!;
  const rank = { L: 0, M: 1, S: 2 };
  const major = ranked.filter((item) => item.km <= nearest.km + 60).sort((a, b) => rank[a.row.t ?? "S"] - rank[b.row.t ?? "S"] || a.km - b.km)[0]!;
  return airportPlace(major.row);
}

export function nearestIndianPort(place: LatLon): Place {
  return portPlace(nearestPort(place, "IN").id)!;
}

export const INDIAN_PORTS = PORTS.filter((port) => port.country === "IN");
export const WORLD_PORTS = PORTS.filter((port) => port.country !== "IN");
