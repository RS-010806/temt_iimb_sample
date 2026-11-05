import { AIR_DISTANCE_ADJUSTMENT_KM, CIRCUITY, PORTS, greatCircleKm, landPathKm, nearestPort, seaRoute, type DistanceMethod, type LatLon, type TransportMode } from "@temt/calculator";
import { loadStations, railRoute, type Station, type StationKind } from "./rail";
import { TERMINALS, waterwayKm, waterwayName } from "./waterways";

export type PlaceKind = "city" | "pin" | "station" | "airport" | "port" | "terminal" | "custom";

/**
 * What each transport mode's places must be: freight leaves and arrives by air at airports, by sea at ports, by rail
 * at stations and by inland waterway at waterway terminals; road and courier go door to door (cities and PIN codes).
 */
export const MODE_PLACE_KINDS: Record<TransportMode | "courier", PlaceKind[]> = {
  road: ["city", "pin"], courier: ["city", "pin"], rail: ["station"], air: ["airport"], sea: ["port"], iww: ["terminal"],
};
/** Kinds where TEMT's list is the full set of valid places, so free text is offered only when nothing matches. */
export const TERMINAL_KINDS: PlaceKind[] = ["station", "airport", "port", "terminal"];

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
  /** PIN code, station code, IATA code, port id or waterway terminal id. */
  code?: string;
  /** The city an airport or port serves, or the National Waterway a terminal is on, for display. */
  city?: string;
  /** For rail: what FOIS lists it as and where it is served from, for display ("Container terminal · served by Dadri (DER)"). */
  detail?: string;
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
const airportPlace = (row: AirportRow): Place => ({ label: `${row.c} · ${row.n}`, kind: "airport", code: row.c, city: row.m || undefined, lat: row.la, lon: row.lo, country: row.k });

/** The city each port serves and the names people use for it (Nhava Sheva for JNPT, Tuticorin for V.O. Chidambaranar). */
const PORT_INFO: Record<string, [city: string, state: string | undefined, aliases: string[]]> = {
  "in-deendayal": ["Gandhidham", "GJ", ["Kandla", "Deendayal"]], "in-mundra": ["Mundra", "GJ", ["Adani Mundra"]], "in-sikka": ["Jamnagar", "GJ", []],
  "in-bedi": ["Jamnagar", "GJ", []], "in-navlakhi": ["Morbi", "GJ", []], "in-porbandar": ["Porbandar", "GJ", []], "in-pipavav": ["Rajula", "GJ", ["APM Pipavav"]],
  "in-jafrabad": ["Jafrabad", "GJ", []], "in-pindhara": ["Devbhumi Dwarka", "GJ", []], "in-dahej": ["Bharuch", "GJ", []], "in-hazira": ["Surat", "GJ", []],
  "in-mumbai": ["Mumbai", "MH", ["Bombay", "Mumbai Port Authority"]], "in-jawaharlal-nehru": ["Navi Mumbai", "MH", ["JNPT", "JNPA", "Nhava Sheva", "Mumbai", "Uran"]],
  "in-mormugao": ["Vasco da Gama", "GA", ["Goa", "Marmagao", "Vasco"]], "in-belekeri": ["Ankola", "KA", []], "in-karwar": ["Karwar", "KA", []],
  "in-new-mangalore": ["Mangaluru", "KA", ["Mangalore", "NMPT", "Panambur"]], "in-kasaragod": ["Kasaragod", "KL", []], "in-azhikkal": ["Kannur", "KL", []],
  "in-kannur": ["Kannur", "KL", ["Cannanore"]], "in-thalassery": ["Thalassery", "KL", ["Tellicherry"]], "in-beypore": ["Kozhikode", "KL", ["Calicut"]],
  "in-ponnani": ["Ponnani", "KL", []], "in-cochin": ["Kochi", "KL", ["Cochin", "Willingdon Island", "Ernakulam", "Vallarpadam"]],
  "in-vizhinjam": ["Thiruvananthapuram", "KL", ["Trivandrum"]], "in-neendakara": ["Kollam", "KL", ["Quilon"]],
  "in-v-o-chidambaranar": ["Thoothukudi", "TN", ["Tuticorin", "VOC"]], "in-chennai": ["Chennai", "TN", ["Madras"]], "in-kamarajar": ["Chennai", "TN", ["Ennore"]],
  "in-krishnapatnam": ["Nellore", "AP", []], "in-kakinada": ["Kakinada", "AP", []], "in-visakhapatnam": ["Visakhapatnam", "AP", ["Vizag"]],
  "in-gangavaram": ["Visakhapatnam", "AP", ["Vizag"]], "in-paradip": ["Paradip", "OD", ["Paradeep"]], "in-dhamra": ["Bhadrak", "OD", []],
  "in-haldia": ["Haldia", "WB", []], "in-syama-prasad-mookerjee": ["Kolkata", "WB", ["Calcutta", "Kolkata Port", "Kidderpore"]],
  "ae-jebel-ali": ["Dubai", undefined, []], "om-salalah": ["Salalah", undefined, []], "sa-jeddah": ["Jeddah", undefined, []], "lk-colombo": ["Colombo", undefined, []],
  "bd-chattogram": ["Chattogram", undefined, ["Chittagong"]], "sg-singapore": ["Singapore", undefined, []], "my-klang": ["Kuala Lumpur", undefined, ["Klang"]],
  "hk-hong-kong": ["Hong Kong", undefined, []], "cn-shenzhen": ["Shenzhen", undefined, ["Yantian"]], "cn-shanghai": ["Shanghai", undefined, ["Yangshan"]],
  "kr-busan": ["Busan", undefined, ["Pusan"]], "jp-tokyo": ["Tokyo", undefined, []], "us-los-angeles-long-beach": ["Los Angeles", undefined, ["Long Beach", "LA"]],
  "us-new-york-new-jersey": ["New York", undefined, ["New Jersey", "Newark"]], "us-savannah": ["Savannah", undefined, []], "nl-rotterdam": ["Rotterdam", undefined, []],
  "be-antwerp-bruges": ["Antwerp", undefined, ["Bruges", "Zeebrugge"]], "de-hamburg": ["Hamburg", undefined, []], "gb-felixstowe": ["Felixstowe", undefined, []],
  "gr-piraeus": ["Athens", undefined, ["Piraeus"]], "it-genoa": ["Genoa", undefined, ["Genova"]], "es-valencia": ["Valencia", undefined, []],
  "ke-mombasa": ["Mombasa", undefined, []], "za-durban": ["Durban", undefined, []], "br-santos": ["São Paulo", undefined, ["Santos", "Sao Paulo"]],
};
export const portPlace = (id: string): Place | undefined => {
  const port = PORTS.find((item) => item.id === id);
  const [city, state] = PORT_INFO[id] ?? [];
  return port && { label: port.name, kind: "port", code: port.id, city, state, lat: port.lat, lon: port.lon, country: port.country };
};
const RAIL_KIND: Record<StationKind, string> = { station: "Railway station", siding: "Freight siding", container: "Container terminal", goods: "Goods shed", port: "Port railhead" };
const ZONES: Record<string, string> = { CR: "Central", ER: "Eastern", EC: "East Central", ECO: "East Coast", KR: "Konkan", NR: "Northern", NC: "North Central", NE: "North Eastern",
  NF: "Northeast Frontier", NW: "North Western", SR: "Southern", SC: "South Central", SE: "South Eastern", SEC: "South East Central", SW: "South Western", WR: "Western", WC: "West Central", DFCR: "Dedicated Freight Corridor" };
/** A station or FOIS freight point as a place, described the way FOIS lists it. */
export function stationPlace(station: Station, byCode?: Map<string, Station>): Place {
  const host = station.servedBy ? byCode?.get(station.servedBy) : undefined;
  const zone = station.zone && ZONES[station.zone] ? `${ZONES[station.zone]}${station.zone === "DFCR" ? "" : " Railway"}` : undefined;
  const detail = [RAIL_KIND[station.kind], host ? `served by ${host.name} (${host.code})` : undefined, zone].filter(Boolean).join(" · ");
  return { label: `${station.name} (${station.code})`, kind: "station", code: station.code, detail, lat: station.lat, lon: station.lon, state: station.state, country: "IN" };
}
const terminalPlace = (terminal: (typeof TERMINALS)[number]): Place => ({ label: `${terminal.name} terminal`, kind: "terminal", code: terminal.id, city: waterwayName(terminal.waterway), lat: terminal.lat, lon: terminal.lon, state: terminal.state, country: "IN" });

/** A short label for diagrams and lists: airports by city and code, terminals without the word "terminal". */
export function compactLabel(place?: Place) {
  if (!place) return "";
  if (place.kind === "airport" && place.city && place.code) return `${place.city} (${place.code})`;
  if (place.kind === "terminal") return place.label.replace(/ terminal$/, "");
  return place.label.replace(/^\d{6} · /, "");
}

/** The town a place is in, for lanes and for re-using a route with another mode (BOM → Mumbai, Pune Jn (PUNE) → Pune). */
export function townOf(place: Place) {
  if ((place.kind === "airport" || place.kind === "port") && place.city) return place.city;
  if (place.kind === "terminal") return place.label.replace(/ terminal$/, "").replace(/\s*\(.*\)$/, "");
  if (place.kind === "station") return place.label.replace(/\s*\(.*\)$/, "").replace(/\s+(jn|junction|cantt|terminus|central|city)$/i, "");
  return place.label.replace(/^\d{6} · /, "").replace(/ \([A-Z]{3}\)$/, "");
}

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
    const stations = await loadStations();
    const byCode = new Map(stations.map((station) => [station.code, station]));
    for (const station of stations) {
      const code = station.code.toLowerCase();
      const codeRank = code === q || station.aliases.some((alias) => alias.toLowerCase() === q) ? -0.5 : 99;
      const rank = Math.min(codeRank, best([station.name, ...station.aliases], queries));
      if (rank < 99) results.push({ place: stationPlace(station, byCode), rank: rank + 0.1, weight: station.trains + (station.kind === "station" ? 0 : 0.5) });
    }
  }
  if (kinds.includes("city")) {
    for (const row of await loadCities()) {
      const rank = Math.min(best([row.n], queries), best(row.a ?? [], queries) + 0.05);
      if (rank < 99) results.push({ place: cityPlace(row), rank, weight: row.p });
    }
  }
  if (kinds.includes("airport")) {
    // By IATA code, the city it serves or its name; larger Indian airports first.
    const size = { L: 3, M: 2, S: 1 };
    for (const row of await loadAirports()) {
      const rank = Math.min(score(row.c.toLowerCase(), q) - 0.5, best([row.m], queries), best([row.n], queries) + 0.25);
      if (rank < 99) results.push({ place: airportPlace(row), rank: rank + (row.k === "IN" ? 0 : 0.25), weight: (row.k === "IN" ? 10 : 0) + size[row.t ?? "S"] });
    }
  }
  if (kinds.includes("port")) {
    for (const port of PORTS) {
      const [city, , aliases] = PORT_INFO[port.id] ?? ["", undefined, []];
      const rank = Math.min(best([port.name], queries), best([city, ...aliases], queries) + 0.05);
      if (rank < 99) results.push({ place: portPlace(port.id)!, rank: rank + (port.country === "IN" ? 0 : 0.25), weight: port.country === "IN" ? 1 : 0 });
    }
  }
  if (kinds.includes("terminal")) {
    for (const terminal of TERMINALS) {
      const rank = Math.min(best([terminal.name], queries), best(terminal.aliases, queries) + 0.05, score(terminal.waterway.toLowerCase(), q) + 0.5);
      if (rank < 99) results.push({ place: terminalPlace(terminal), rank, weight: 0 });
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
  const base = value.replace(/\s*\(.*?\)\s*/g, " ").split(",")[0]!.replace(/\b(port|dock complex|railway station|rly stn|station|international airport|airport|terminal)\b/gi, "").trim();
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
  if (mode === "iww") {
    const along = from.kind === "terminal" && to.kind === "terminal" ? waterwayKm(from.code, to.code) : undefined;
    if (along) return { km: Math.max(1, along.km), method: "iww-network", note: `Along ${waterwayName(along.waterway)}, scaled to the waterway's official length published by IWAI.` };
  }
  const circuity = mode === "rail" ? CIRCUITY.rail : mode === "iww" ? CIRCUITY.iww : CIRCUITY.road;
  const method: DistanceMethod = mode === "rail" ? "rail-estimate" : mode === "iww" ? "iww-estimate" : "road-estimate";
  const approx = from.approximate || to.approximate ? " One location is a district-level PIN estimate." : "";
  const path = landPathKm(from, to);
  const basis = mode === "road" ? "Calculated from the two locations with TEMT's model of Indian road distances, usually within 10–15% of the distance driven."
    : mode === "rail" ? "Calculated from the two locations; the rail network was not available for this route."
    : from.kind === "terminal" && to.kind === "terminal" ? "These terminals are on different waterways, so the distance is approximate: enter the actual distance if you have it."
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

/** The nearest inland waterway terminal on TEMT's National Waterways list. */
export function nearestTerminal(place: LatLon): Place {
  return terminalPlace(TERMINALS.reduce((best, item) => (greatCircleKm(place, item) < greatCircleKm(place, best) ? item : best)));
}

/** Whether a place can start or end a leg by this mode: air needs an airport, sea a port, rail a station, waterway a terminal. */
export function placeFitsMode(place: Place | undefined, mode: TransportMode) {
  if (!place) return true;
  const kinds = MODE_PLACE_KINDS[mode];
  return mode === "road" || place.kind === "custom" || kinds.includes(place.kind);
}

export function nearestIndianPort(place: LatLon): Place {
  return portPlace(nearestPort(place, "IN").id)!;
}

export const INDIAN_PORTS = PORTS.filter((port) => port.country === "IN");
export const WORLD_PORTS = PORTS.filter((port) => port.country !== "IN");
