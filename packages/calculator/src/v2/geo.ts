export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_NAUTICAL_MILE = 1.852;

/** Great-circle (haversine) distance in kilometres. */
export function greatCircleKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Network circuity: ratio of network distance to great-circle distance, calibrated on Indian
 * corridors (for example Delhi–Bengaluru road 2,127 km vs 1,741 km great-circle; Mumbai–Delhi rail
 * 1,384 km vs 1,148 km). Estimates are indicative (±10–15%); users should override with actual distance.
 */
export const CIRCUITY = Object.freeze({ road: 1.22, rail: 1.15, iww: 1.3 });

export type DistanceMethod = "road-estimate" | "rail-estimate" | "iww-estimate" | "great-circle" | "air-gcd-95" | "sea-route" | "user";

/** The Siliguri corridor: land routes between the North-East and the rest of India pass through it. */
export const SILIGURI_CORRIDOR: LatLon = Object.freeze({ lat: 26.72, lon: 88.43 });
const isNorthEast = (p: LatLon) => p.lon >= 89.6 && p.lat >= 21.9 && p.lat <= 29.6;

/** Straight-line path over land, routed through the Siliguri corridor when a trip enters or leaves the North-East. */
export function landPathKm(a: LatLon, b: LatLon): number {
  if (isNorthEast(a) !== isNorthEast(b)) {
    const outside = isNorthEast(a) ? b : a;
    if (outside.lon < 89.6) return greatCircleKm(a, SILIGURI_CORRIDOR) + greatCircleKm(SILIGURI_CORRIDOR, b);
  }
  return greatCircleKm(a, b);
}

export function estimateLandDistanceKm(mode: "road" | "rail" | "iww", a: LatLon, b: LatLon): number {
  return landPathKm(a, b) * CIRCUITY[mode];
}

// ─── Maritime routing ──────────────────────────────────────────────────────

export interface Port extends LatLon {
  id: string;
  name: string;
  country: string;
  /** Sea-lane nodes the port connects to. Chosen to avoid routing across land. */
  attach: readonly string[];
}

/** Offshore waypoints approximating the Indian coastal lane and major international sea lanes. */
const NODES: Readonly<Record<string, LatLon>> = {
  KUTCH_IN: { lat: 22.62, lon: 69.75 }, KUTCH_MOUTH: { lat: 22.45, lon: 68.75 }, PORBANDAR: { lat: 21.35, lon: 69.25 },
  VERAVAL: { lat: 20.55, lon: 70.55 }, PIPAVAV: { lat: 20.65, lon: 71.6 }, KHAMBHAT_MOUTH: { lat: 20.55, lon: 72.35 },
  KHAMBHAT_IN: { lat: 21.35, lon: 72.45 }, MUMBAI: { lat: 18.95, lon: 72.65 }, RATNAGIRI: { lat: 17.0, lon: 73.05 },
  GOA: { lat: 15.4, lon: 73.55 }, KARWAR: { lat: 14.7, lon: 74.0 }, MANGALORE: { lat: 12.9, lon: 74.6 },
  CALICUT: { lat: 11.2, lon: 75.6 }, KOCHI: { lat: 9.95, lon: 76.05 }, KOLLAM: { lat: 8.8, lon: 76.4 },
  KANYAKUMARI: { lat: 7.6, lon: 77.3 }, MANNAR: { lat: 7.4, lon: 78.6 }, COLOMBO_OFF: { lat: 6.6, lon: 79.65 },
  DONDRA: { lat: 5.75, lon: 80.6 }, BATTICALOA: { lat: 7.5, lon: 82.1 }, NAGAPATTINAM: { lat: 10.8, lon: 80.4 },
  CHENNAI: { lat: 13.1, lon: 80.5 }, KRISHNAPATNAM: { lat: 14.25, lon: 80.35 }, MACHILIPATNAM: { lat: 15.9, lon: 81.45 },
  KAKINADA: { lat: 16.9, lon: 82.45 }, VIZAG: { lat: 17.6, lon: 83.45 }, GOPALPUR: { lat: 19.2, lon: 85.2 },
  PARADIP: { lat: 20.2, lon: 86.85 }, DHAMRA: { lat: 20.8, lon: 87.2 }, SANDHEADS: { lat: 21.2, lon: 88.1 },
  HOOGHLY: { lat: 21.95, lon: 88.1 }, BAY_BENGAL: { lat: 12.5, lon: 88.5 }, CHITTAGONG_OFF: { lat: 21.8, lon: 91.5 },
  ARABIAN_SEA: { lat: 15.5, lon: 65.0 }, RAS_AL_HADD: { lat: 22.6, lon: 60.2 }, HORMUZ: { lat: 26.4, lon: 56.6 },
  GULF_ADEN: { lat: 12.6, lon: 47.5 }, BAB_EL_MANDEB: { lat: 12.6, lon: 43.35 }, RED_SEA_MID: { lat: 20.5, lon: 38.6 },
  SUEZ: { lat: 29.9, lon: 32.55 }, PORT_SAID: { lat: 31.35, lon: 32.35 }, CRETE_SOUTH: { lat: 33.8, lon: 25.0 },
  SICILY_CHANNEL: { lat: 37.3, lon: 11.8 }, ALBORAN: { lat: 36.3, lon: -2.5 }, GIBRALTAR: { lat: 35.95, lon: -5.6 },
  TYRRHENIAN: { lat: 40.0, lon: 11.0 }, BALEARIC: { lat: 38.5, lon: 2.0 }, FINISTERRE: { lat: 43.2, lon: -9.9 },
  USHANT: { lat: 48.5, lon: -5.6 }, DOVER: { lat: 51.0, lon: 1.5 }, ELBE_MOUTH: { lat: 54.0, lon: 8.3 },
  ATLANTIC_NW: { lat: 40.2, lon: -69.5 }, ATLANTIC_SE: { lat: 31.6, lon: -79.8 }, GREAT_CHANNEL: { lat: 6.2, lon: 94.8 },
  MALACCA_N: { lat: 4.4, lon: 98.6 }, MALACCA_S: { lat: 2.4, lon: 101.6 }, SINGAPORE_STRAIT: { lat: 1.2, lon: 104.0 },
  SCS_SOUTH: { lat: 5.5, lon: 106.5 }, SCS_NORTH: { lat: 16.0, lon: 113.0 }, TAIWAN_STRAIT: { lat: 24.5, lon: 119.5 },
  EAST_CHINA_SEA: { lat: 31.5, lon: 125.5 }, JAPAN_SOUTH: { lat: 33.3, lon: 135.5 }, MOZAMBIQUE: { lat: -15.0, lon: 42.5 },
  AGULHAS: { lat: -35.2, lon: 20.0 }, SOUTH_ATLANTIC: { lat: -28.0, lon: -20.0 }, INDIAN_OCEAN_W: { lat: -3.0, lon: 55.0 },
  PACIFIC_N: { lat: 45.0, lon: 180.0 },
};

const EDGES: readonly (readonly [string, string])[] = [
  ["KUTCH_IN", "KUTCH_MOUTH"], ["KUTCH_MOUTH", "PORBANDAR"], ["PORBANDAR", "VERAVAL"], ["VERAVAL", "PIPAVAV"],
  ["PIPAVAV", "KHAMBHAT_MOUTH"], ["KHAMBHAT_MOUTH", "KHAMBHAT_IN"], ["KHAMBHAT_MOUTH", "MUMBAI"], ["MUMBAI", "RATNAGIRI"],
  ["RATNAGIRI", "GOA"], ["GOA", "KARWAR"], ["KARWAR", "MANGALORE"], ["MANGALORE", "CALICUT"], ["CALICUT", "KOCHI"],
  ["KOCHI", "KOLLAM"], ["KOLLAM", "KANYAKUMARI"], ["KANYAKUMARI", "MANNAR"], ["MANNAR", "COLOMBO_OFF"],
  ["KANYAKUMARI", "COLOMBO_OFF"], ["COLOMBO_OFF", "DONDRA"], ["DONDRA", "BATTICALOA"], ["BATTICALOA", "NAGAPATTINAM"],
  ["NAGAPATTINAM", "CHENNAI"], ["CHENNAI", "KRISHNAPATNAM"], ["KRISHNAPATNAM", "MACHILIPATNAM"], ["MACHILIPATNAM", "KAKINADA"],
  ["KAKINADA", "VIZAG"], ["VIZAG", "GOPALPUR"], ["GOPALPUR", "PARADIP"], ["PARADIP", "DHAMRA"], ["DHAMRA", "SANDHEADS"],
  ["SANDHEADS", "HOOGHLY"], ["SANDHEADS", "CHITTAGONG_OFF"], ["BAY_BENGAL", "CHENNAI"], ["BAY_BENGAL", "VIZAG"],
  ["BAY_BENGAL", "SANDHEADS"], ["BAY_BENGAL", "DONDRA"], ["BAY_BENGAL", "GREAT_CHANNEL"], ["DONDRA", "GREAT_CHANNEL"],
  ["SANDHEADS", "GREAT_CHANNEL"], ["CHENNAI", "GREAT_CHANNEL"],
  // West coast to the Gulf, Red Sea and Africa
  ["MUMBAI", "ARABIAN_SEA"], ["KUTCH_MOUTH", "ARABIAN_SEA"], ["KUTCH_MOUTH", "GULF_ADEN"], ["KUTCH_MOUTH", "RAS_AL_HADD"], ["MUMBAI", "RAS_AL_HADD"], ["ARABIAN_SEA", "RAS_AL_HADD"],
  ["RAS_AL_HADD", "HORMUZ"], ["ARABIAN_SEA", "GULF_ADEN"], ["MUMBAI", "GULF_ADEN"], ["KOCHI", "GULF_ADEN"],
  ["COLOMBO_OFF", "GULF_ADEN"], ["GULF_ADEN", "BAB_EL_MANDEB"], ["BAB_EL_MANDEB", "RED_SEA_MID"], ["RED_SEA_MID", "SUEZ"],
  ["SUEZ", "PORT_SAID"], ["ARABIAN_SEA", "INDIAN_OCEAN_W"], ["KOCHI", "INDIAN_OCEAN_W"], ["INDIAN_OCEAN_W", "MOZAMBIQUE"],
  ["MOZAMBIQUE", "AGULHAS"], ["AGULHAS", "SOUTH_ATLANTIC"],
  // Mediterranean and North Europe
  ["PORT_SAID", "CRETE_SOUTH"], ["CRETE_SOUTH", "SICILY_CHANNEL"], ["SICILY_CHANNEL", "TYRRHENIAN"], ["SICILY_CHANNEL", "BALEARIC"],
  ["BALEARIC", "ALBORAN"], ["ALBORAN", "GIBRALTAR"], ["GIBRALTAR", "FINISTERRE"], ["FINISTERRE", "USHANT"], ["USHANT", "DOVER"],
  ["DOVER", "ELBE_MOUTH"], ["GIBRALTAR", "ATLANTIC_NW"], ["ATLANTIC_NW", "ATLANTIC_SE"], ["SOUTH_ATLANTIC", "ATLANTIC_SE"],
  ["AGULHAS", "FINISTERRE"],
  // East Asia and the Pacific
  ["GREAT_CHANNEL", "MALACCA_N"], ["MALACCA_N", "MALACCA_S"], ["MALACCA_S", "SINGAPORE_STRAIT"], ["SINGAPORE_STRAIT", "SCS_SOUTH"],
  ["SCS_SOUTH", "SCS_NORTH"], ["SCS_NORTH", "TAIWAN_STRAIT"], ["TAIWAN_STRAIT", "EAST_CHINA_SEA"], ["EAST_CHINA_SEA", "JAPAN_SOUTH"],
  ["JAPAN_SOUTH", "PACIFIC_N"],
];

const P = (id: string, name: string, country: string, lat: number, lon: number, attach: string[]): Port => ({ id, name, country, lat, lon, attach });

export const PORTS: readonly Port[] = Object.freeze([
  // India, west coast
  P("in-deendayal", "Deendayal Port (Kandla)", "IN", 23.017, 70.212, ["KUTCH_IN"]),
  P("in-mundra", "Mundra Port", "IN", 22.74, 69.705, ["KUTCH_IN"]),
  P("in-sikka", "Sikka Port", "IN", 22.428, 69.842, ["KUTCH_IN"]),
  P("in-bedi", "Bedi Port", "IN", 22.558, 70.037, ["KUTCH_IN"]),
  P("in-navlakhi", "Navlakhi Port", "IN", 22.957, 70.453, ["KUTCH_IN"]),
  P("in-porbandar", "Porbandar Port", "IN", 21.63, 69.6, ["PORBANDAR"]),
  P("in-pipavav", "Pipavav Port", "IN", 20.915, 71.51, ["PIPAVAV"]),
  P("in-jafrabad", "Jafrabad Port", "IN", 20.868, 71.365, ["PIPAVAV"]),
  P("in-pindhara", "Pindhara Port", "IN", 20.755, 70.918, ["VERAVAL", "PIPAVAV"]),
  P("in-dahej", "Dahej Port", "IN", 21.713, 72.584, ["KHAMBHAT_IN"]),
  P("in-hazira", "Hazira Port", "IN", 21.103, 72.641, ["KHAMBHAT_IN", "KHAMBHAT_MOUTH"]),
  P("in-mumbai", "Mumbai Port", "IN", 18.94, 72.845, ["MUMBAI"]),
  P("in-jawaharlal-nehru", "Jawaharlal Nehru Port (Nhava Sheva)", "IN", 18.95, 72.951, ["MUMBAI"]),
  P("in-mormugao", "Mormugao Port", "IN", 15.42, 73.795, ["GOA"]),
  P("in-belekeri", "Belekeri Port", "IN", 14.707, 74.266, ["KARWAR"]),
  P("in-karwar", "Karwar Port", "IN", 14.8, 74.117, ["KARWAR"]),
  P("in-new-mangalore", "New Mangalore Port", "IN", 12.928, 74.822, ["MANGALORE"]),
  P("in-kasaragod", "Kasaragod Port", "IN", 12.5, 74.987, ["MANGALORE"]),
  P("in-azhikkal", "Azhikkal Port", "IN", 11.942, 75.305, ["CALICUT", "MANGALORE"]),
  P("in-kannur", "Kannur Port", "IN", 11.874, 75.37, ["CALICUT"]),
  P("in-thalassery", "Thalassery Port", "IN", 11.745, 75.491, ["CALICUT"]),
  P("in-beypore", "Beypore Port", "IN", 11.167, 75.808, ["CALICUT"]),
  P("in-ponnani", "Ponnani Port", "IN", 10.768, 75.926, ["CALICUT", "KOCHI"]),
  P("in-cochin", "Cochin Port", "IN", 9.967, 76.259, ["KOCHI"]),
  P("in-vizhinjam", "Vizhinjam Port", "IN", 8.374, 76.991, ["KOLLAM", "KANYAKUMARI"]),
  P("in-neendakara", "Neendakara Port", "IN", 8.937, 76.537, ["KOLLAM"]),
  // India, east coast
  P("in-v-o-chidambaranar", "V.O. Chidambaranar Port (Tuticorin)", "IN", 8.756, 78.179, ["MANNAR"]),
  P("in-chennai", "Chennai Port", "IN", 13.086, 80.292, ["CHENNAI"]),
  P("in-kamarajar", "Kamarajar Port (Ennore)", "IN", 13.25, 80.33, ["CHENNAI"]),
  P("in-krishnapatnam", "Krishnapatnam Port", "IN", 14.25, 80.13, ["KRISHNAPATNAM"]),
  P("in-kakinada", "Kakinada Port", "IN", 16.946, 82.261, ["KAKINADA"]),
  P("in-visakhapatnam", "Visakhapatnam Port", "IN", 17.687, 83.285, ["VIZAG"]),
  P("in-gangavaram", "Gangavaram Port", "IN", 17.621, 83.23, ["VIZAG"]),
  P("in-paradip", "Paradip Port", "IN", 20.267, 86.703, ["PARADIP"]),
  P("in-dhamra", "Dhamra Port", "IN", 20.83, 86.97, ["DHAMRA"]),
  P("in-haldia", "Haldia Dock Complex", "IN", 22.045, 88.089, ["HOOGHLY"]),
  P("in-syama-prasad-mookerjee", "Syama Prasad Mookerjee Port (Kolkata)", "IN", 22.545, 88.31, ["HOOGHLY"]),
  // International
  P("ae-jebel-ali", "Jebel Ali", "AE", 25.011, 55.061, ["HORMUZ"]),
  P("om-salalah", "Salalah", "OM", 16.945, 54.005, ["GULF_ADEN", "ARABIAN_SEA"]),
  P("sa-jeddah", "Jeddah", "SA", 21.465, 39.145, ["RED_SEA_MID"]),
  P("lk-colombo", "Colombo", "LK", 6.95, 79.845, ["COLOMBO_OFF"]),
  P("bd-chattogram", "Chattogram", "BD", 22.29, 91.8, ["CHITTAGONG_OFF"]),
  P("sg-singapore", "Singapore", "SG", 1.264, 103.84, ["SINGAPORE_STRAIT"]),
  P("my-klang", "Port Klang", "MY", 3.0, 101.39, ["MALACCA_S"]),
  P("hk-hong-kong", "Hong Kong", "HK", 22.3, 114.12, ["SCS_NORTH"]),
  P("cn-shenzhen", "Shenzhen (Yantian)", "CN", 22.57, 114.27, ["SCS_NORTH"]),
  P("cn-shanghai", "Shanghai (Yangshan)", "CN", 30.63, 122.07, ["EAST_CHINA_SEA"]),
  P("kr-busan", "Busan", "KR", 35.08, 128.83, ["EAST_CHINA_SEA", "JAPAN_SOUTH"]),
  P("jp-tokyo", "Tokyo", "JP", 35.62, 139.79, ["JAPAN_SOUTH"]),
  P("us-los-angeles-long-beach", "Los Angeles / Long Beach", "US", 33.73, -118.26, ["PACIFIC_N"]),
  P("us-new-york-new-jersey", "New York / New Jersey", "US", 40.67, -74.05, ["ATLANTIC_NW"]),
  P("us-savannah", "Savannah", "US", 32.08, -81.09, ["ATLANTIC_SE"]),
  P("nl-rotterdam", "Rotterdam", "NL", 51.95, 4.05, ["DOVER"]),
  P("be-antwerp-bruges", "Antwerp-Bruges", "BE", 51.28, 4.3, ["DOVER"]),
  P("de-hamburg", "Hamburg", "DE", 53.54, 9.97, ["ELBE_MOUTH"]),
  P("gb-felixstowe", "Felixstowe", "GB", 51.95, 1.32, ["DOVER"]),
  P("gr-piraeus", "Piraeus", "GR", 37.94, 23.62, ["CRETE_SOUTH"]),
  P("it-genoa", "Genoa", "IT", 44.4, 8.92, ["TYRRHENIAN"]),
  P("es-valencia", "Valencia", "ES", 39.44, -0.32, ["BALEARIC"]),
  P("ke-mombasa", "Mombasa", "KE", -4.07, 39.66, ["INDIAN_OCEAN_W", "MOZAMBIQUE"]),
  P("za-durban", "Durban", "ZA", -29.87, 31.03, ["MOZAMBIQUE", "AGULHAS"]),
  P("br-santos", "Santos", "BR", -23.97, -46.3, ["SOUTH_ATLANTIC"]),
]);

const PORT_BY_ID = new Map(PORTS.map((port) => [port.id, port]));
export const getPort = (id: string) => PORT_BY_ID.get(id);

const NEIGHBOUR_PORT_KM = 80;
const NEIGHBOUR_DETOUR = 1.3;

type Graph = Map<string, { to: string; km: number }[]>;
let graph: Graph | undefined;

function point(id: string): LatLon {
  const port = PORT_BY_ID.get(id);
  if (port) return port;
  const node = NODES[id];
  if (!node) throw new Error(`Unknown sea node ${id}`);
  return node;
}

function buildGraph(): Graph {
  const result: Graph = new Map();
  const link = (a: string, b: string) => {
    const km = greatCircleKm(point(a), point(b));
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const list = result.get(from) ?? [];
      list.push({ to, km });
      result.set(from, list);
    }
  };
  for (const [a, b] of EDGES) link(a, b);
  for (const port of PORTS) for (const node of port.attach) link(port.id, node);
  return result;
}

export interface SeaRoute {
  km: number;
  nauticalMiles: number;
  via: string[];
}

/** Shortest path through the sea-lane network (Dijkstra). Returns undefined for unknown or identical ports. */
export function seaRoute(fromPortId: string, toPortId: string): SeaRoute | undefined {
  if (fromPortId === toPortId || !PORT_BY_ID.has(fromPortId) || !PORT_BY_ID.has(toPortId)) return undefined;
  const direct = greatCircleKm(PORT_BY_ID.get(fromPortId)!, PORT_BY_ID.get(toPortId)!);
  if (direct <= NEIGHBOUR_PORT_KM) {
    // Neighbouring ports in the same harbour or gulf: a short inshore passage, not an offshore lane.
    const km = direct * NEIGHBOUR_DETOUR;
    return { km, nauticalMiles: km / KM_PER_NAUTICAL_MILE, via: [] };
  }
  graph ??= buildGraph();
  const distance = new Map<string, number>([[fromPortId, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  while (true) {
    let current: string | undefined;
    let best = Infinity;
    for (const [node, km] of distance) if (!visited.has(node) && km < best) { best = km; current = node; }
    if (current === undefined) return undefined;
    if (current === toPortId) break;
    visited.add(current);
    for (const edge of graph.get(current) ?? []) {
      // Ports are endpoints only, so routes never pass through an intermediate port.
      if (edge.to !== toPortId && PORT_BY_ID.has(edge.to)) continue;
      const next = best + edge.km;
      if (next < (distance.get(edge.to) ?? Infinity)) { distance.set(edge.to, next); previous.set(edge.to, current); }
    }
  }
  const via: string[] = [];
  for (let node = previous.get(toPortId); node && node !== fromPortId; node = previous.get(node)) via.unshift(node);
  const km = distance.get(toPortId)!;
  return { km, nauticalMiles: km / KM_PER_NAUTICAL_MILE, via };
}

/** The nearest port to a location, by great-circle distance. */
export function nearestPort(location: LatLon, country?: string): Port {
  let best = PORTS[0]!;
  let bestKm = Infinity;
  for (const port of PORTS) {
    if (country && port.country !== country) continue;
    const km = greatCircleKm(location, port);
    if (km < bestKm) { bestKm = km; best = port; }
  }
  return best;
}
