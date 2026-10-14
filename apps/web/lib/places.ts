import { AIR_DISTANCE_ADJUSTMENT_KM, CIRCUITY, PORTS, greatCircleKm, landPathKm, nearestPort, seaRoute, type DistanceMethod, type LatLon, type TransportMode } from "@temt/calculator";
import { loadStations, railRoute } from "./rail";

export type PlaceKind = "city" | "pin" | "station" | "airport" | "port" | "custom";

/** Full names for the two-letter state and union territory codes used in the location data. */
export const STATE_NAMES: Record<string, string> = {
  AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar", CH: "Chandigarh", CT: "Chhattisgarh",
  DH: "Dadra and Nagar Haveli and Daman and Diu", DL: "Delhi", GA: "Goa", GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana", JH: "Jharkhand",
  JK: "Jammu and Kashmir", KA: "Karnataka", KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur",
  MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland", OD: "Odisha", PB: "Punjab", PY: "Puducherry", RJ: "Rajasthan", SK: "Sikkim", TG: "Telangana",
  TN: "Tamil Nadu", TR: "Tripura", UK: "Uttarakhand", UP: "Uttar Pradesh", WB: "West Bengal",
};
export const stateName = (code?: string) => (code ? STATE_NAMES[code] ?? code : undefined);

/** Earlier and current names people still type interchangeably. */
const SYNONYMS: [string, string][] = [
  ["bangalore", "bengaluru"], ["bombay", "mumbai"], ["madras", "chennai"], ["calcutta", "kolkata"], ["poona", "pune"], ["mysore", "mysuru"],
  ["mangalore", "mangaluru"], ["gurgaon", "gurugram"], ["baroda", "vadodara"], ["trivandrum", "thiruvananthapuram"], ["cochin", "kochi"],
  ["allahabad", "prayagraj"], ["benares", "varanasi"], ["banaras", "varanasi"], ["calicut", "kozhikode"], ["belgaum", "belagavi"], ["hubli", "hubballi"],
  ["gulbarga", "kalaburagi"], ["vizag", "visakhapatnam"], ["pondicherry", "puducherry"], ["simla", "shimla"], ["cawnpore", "kanpur"],
  ["trichy", "tiruchirappalli"], ["tuticorin", "thoothukudi"], ["panjim", "panaji"], ["bhubaneshwar", "bhubaneswar"], ["mughalsarai", "deen dayal"],
];

/** The query plus its earlier or current name, for prefixes of at least three letters. */
function variants(query: string): string[] {
  const out = new Set([query]);
  if (query.length >= 3) for (const [a, b] of SYNONYMS) {
    if (a.startsWith(query) || query.startsWith(a)) out.add(query.length >= a.length ? query.replace(a, b) : b);
    if (b.startsWith(query) || query.startsWith(b)) out.add(query.length >= b.length ? query.replace(b, a) : a);
  }
  return [...out];
}

export interface Place {
  label: string;
  kind: PlaceKind;
  lat?: number;
  lon?: number;
  /** PIN code, station code, IATA code or port id. */
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
export { loadStations };

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
  if (value.split(/[\s,()./-]+/).some((word) => word.startsWith(query)) || ` ${value}`.includes(` ${query}`)) return 2;
  if (value.includes(query)) return 3;
  return 99;
}
const best = (texts: (string | undefined)[], queries: string[]) => Math.min(...texts.flatMap((text) => (text ? queries.map((query) => score(text, query)) : [99])));

export interface PlaceMatch {
  place: Place;
  /** 0 exact, 1 starts with, 2 a word starts with, 3 contains; fractions break ties between kinds. */
  rank: number;
}

/** Ranked matches across the requested kinds of place, best first (like a map search). */
export async function rankPlaces(query: string, kinds: PlaceKind[] = ["city", "pin"], limit = 5): Promise<PlaceMatch[]> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const queries = variants(q);
  const results: (PlaceMatch & { weight: number })[] = [];
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
  if (kinds.includes("station")) {
    for (const station of await loadStations()) {
      const code = station.code.toLowerCase();
      const codeRank = code === q || station.aliases.some((alias) => alias.toLowerCase() === q) ? -0.5 : 99;
      const rank = Math.min(codeRank, best([station.name, ...station.aliases], queries));
      if (rank < 99) results.push({ place: { label: `${station.name} (${station.code})`, kind: "station", code: station.code, lat: station.lat, lon: station.lon, state: station.state, country: "IN" }, rank: rank + 0.1, weight: station.trains });
    }
  }
  if (kinds.includes("city")) {
    for (const row of await loadCities()) {
      const rank = Math.min(best([row.n], queries), best(row.a ?? [], queries) + 0.05);
      if (rank < 99) results.push({ place: cityPlace(row), rank, weight: row.p });
    }
  }
  if (kinds.includes("airport")) {
    for (const row of await loadAirports()) {
      const rank = Math.min(score(row.c, q) - 0.5, best([row.m], queries), best([row.n], queries) + 0.5);
      if (rank < 99) results.push({ place: airportPlace(row), rank: rank + (row.k === "IN" ? 0 : 0.25), weight: row.k === "IN" ? 1 : 0 });
    }
  }
  if (kinds.includes("port")) {
    for (const port of PORTS) {
      const rank = best([port.name], queries);
      if (rank < 99) results.push({ place: portPlace(port.id)!, rank: rank + (port.country === "IN" ? 0 : 0.25), weight: 0 });
    }
  }
  // Names that equal or start with the query come first, then names with a word starting with it, then the rest.
  // Within each group, the kind listed first wins (stations for rail, airports for air), then exact names, then
  // bigger cities and busier stations.
  const group = (rank: number) => (rank < 2 ? 0 : rank < 3 ? 1 : 2);
  const priority = (place: Place) => kinds.indexOf(place.kind);
  results.sort((a, b) => group(a.rank) - group(b.rank) || priority(a.place) - priority(b.place) || Number(a.rank >= 0.5) - Number(b.rank >= 0.5) || b.weight - a.weight || a.rank - b.rank);
  const seen = new Set<string>();
  return results.filter(({ place }) => { const key = `${place.kind}:${place.label}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit).map(({ place, rank }) => ({ place, rank }));
}

export async function searchPlaces(query: string, kinds: PlaceKind[] = ["city", "pin"], limit = 5): Promise<Place[]> {
  return (await rankPlaces(query, kinds, limit)).map((match) => match.place);
}

/** Resolve free text (city, earlier city name, PIN code, station code, IATA code or port name) to a place. */
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
  const base = value.replace(/\s*\(.*?\)\s*/g, " ").split(",")[0]!.replace(/\b(port|dock complex|railway station|rly stn|station)\b/gi, "").trim();
  const [first] = await rankPlaces(base, kinds, 1);
  // Accept an exact or leading match on the name or a known earlier name ("Bangalore" finds Bengaluru), not a loose one.
  return first && first.rank < 2 ? first.place : undefined;
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
  if (mode === "air") return { km: gcd, method: "great-circle", note: `The standard ${AIR_DISTANCE_ADJUSTMENT_KM} km allowance for routing and holding is added in the calculation, as GLEC specifies.` };
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
  const basis = mode === "road" ? "Calculated from the two locations with TEMT's model of Indian road distances, usually within 10–15% of the distance driven."
    : mode === "rail" ? "Calculated from the two locations; the rail network was not available for this route."
    : "Calculated from the two locations with TEMT's model of Indian waterway distances.";
  return { km: Math.max(1, path * circuity), method, note: `${basis}${approx}` };
}

/**
 * Distance for a leg, using the Indian Railways network for rail (station to station) and the estimates above
 * for other modes. Falls back to the estimate when the network cannot be loaded or has no route.
 */
export async function measureDistance(mode: TransportMode, from?: Place, to?: Place): Promise<DistanceEstimate | undefined> {
  const estimate = estimateDistance(mode, from, to);
  if (mode !== "rail" || !hasCoords(from) || !hasCoords(to)) return estimate;
  const route = await railRoute(from, to).catch(() => undefined);
  if (!route) return estimate;
  const via = (station: { name: string; code: string; distanceKm: number }, place: Place) => (station.distanceKm > 0.5 ? `${station.name} (${station.code}), ${Math.round(station.distanceKm)} km from ${place.label}` : `${station.name} (${station.code})`);
  const snapped = route.from.distanceKm > 0.5 || route.to.distanceKm > 0.5;
  return {
    km: Math.max(1, route.km), method: "rail-network",
    note: `From ${via(route.from, from)} to ${via(route.to, to)}, along the track that scheduled trains run on. On average within about 3% of Indian Railways' published route distances.${snapped ? " Road transport to and from the stations is not included; use a transport chain to add it." : ""}`,
    via: [route.from.code, route.to.code],
  };
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
