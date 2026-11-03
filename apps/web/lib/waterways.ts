import { greatCircleKm } from "@temt/calculator";

/**
 * Cargo terminals on India's main National Waterways. Each waterway is an ordered line of points along the river
 * or canal (terminals plus river waypoints); distances along it are scaled so the whole waterway equals the length
 * the Inland Waterways Authority of India (IWAI) publishes for it. A distance between two terminals on the same
 * waterway is the difference of their positions (chainage) along it.
 */
export interface Waterway { id: string; name: string; officialKm: number }
export interface WaterwayTerminal {
  id: string;
  name: string;
  waterway: string;
  lat: number;
  lon: number;
  state: string;
  aliases: string[];
  /** Kilometres from the start of the waterway, scaled to its official length. */
  chainageKm: number;
}

type Point = [name: string, lat: number, lon: number, terminal?: { state: string; aliases?: string[] }];

const WATERWAYS: (Waterway & { points: Point[] })[] = [
  { id: "NW-1", name: "Ganga–Bhagirathi–Hooghly", officialKm: 1620, points: [
    ["Haldia", 22.03, 88.06, { state: "WB" }],
    ["Kolkata (Garden Reach)", 22.545, 88.3, { state: "WB", aliases: ["Kolkata", "Calcutta", "Garden Reach", "GR Jetty"] }],
    ["Bandel", 22.92, 88.39], ["Kalna", 23.22, 88.37], ["Nabadwip", 23.41, 88.37], ["Katwa", 23.65, 88.13], ["Berhampore", 24.1, 88.26], ["Jangipur", 24.47, 88.08],
    ["Farakka", 24.81, 87.92, { state: "WB" }],
    ["Sahibganj", 25.24, 87.64, { state: "JH" }],
    ["Bhagalpur", 25.26, 87.0, { state: "BR" }],
    ["Munger", 25.38, 86.47], ["Barh", 25.48, 85.71],
    ["Patna (Gaighat)", 25.61, 85.2, { state: "BR", aliases: ["Patna", "Gaighat"] }],
    ["Buxar", 25.57, 83.98],
    ["Ghazipur", 25.58, 83.58, { state: "UP" }],
    ["Varanasi (Ramnagar)", 25.28, 83.03, { state: "UP", aliases: ["Varanasi", "Ramnagar", "Benares", "Banaras"] }],
    ["Mirzapur", 25.15, 82.57],
    ["Prayagraj", 25.43, 81.88, { state: "UP", aliases: ["Allahabad"] }],
  ] },
  { id: "NW-2", name: "Brahmaputra", officialKm: 891, points: [
    ["Dhubri", 26.02, 89.98, { state: "AS" }],
    ["Jogighopa", 26.23, 90.58, { state: "AS" }],
    ["Goalpara", 26.17, 90.63],
    ["Pandu (Guwahati)", 26.17, 91.68, { state: "AS", aliases: ["Guwahati", "Pandu", "Gauhati"] }],
    ["Tezpur", 26.62, 92.79, { state: "AS" }],
    ["Silghat", 26.61, 92.94, { state: "AS" }],
    ["Neamati (Jorhat)", 26.84, 94.25, { state: "AS", aliases: ["Neamati", "Jorhat"] }],
    ["Bogibeel", 27.4, 94.77, { state: "AS" }],
    ["Dibrugarh", 27.49, 94.91, { state: "AS" }],
    ["Sadiya", 27.83, 95.67, { state: "AS" }],
  ] },
  { id: "NW-3", name: "West Coast Canal", officialKm: 168, points: [
    ["Kottapuram", 10.2, 76.2, { state: "KL" }],
    ["Kochi (Maradu)", 9.95, 76.27, { state: "KL", aliases: ["Kochi", "Cochin", "Ernakulam", "Maradu"] }],
    ["Alappuzha", 9.49, 76.33, { state: "KL", aliases: ["Alleppey"] }],
    ["Thrikkunnapuzha", 9.25, 76.42],
    ["Kayamkulam", 9.17, 76.5],
    ["Kollam", 8.89, 76.59, { state: "KL", aliases: ["Quilon"] }],
  ] },
  { id: "NW-16", name: "Barak", officialKm: 121, points: [
    ["Bhanga", 24.86, 92.18, { state: "AS" }],
    ["Karimganj", 24.87, 92.36, { state: "AS" }],
    ["Badarpur", 24.87, 92.6, { state: "AS" }],
    ["Silchar", 24.82, 92.8, { state: "AS" }],
    ["Lakhipur", 24.8, 93.02, { state: "AS" }],
  ] },
  { id: "NW-68", name: "Mandovi (Goa)", officialKm: 41, points: [
    ["Panaji (Reis Magos)", 15.49, 73.81, { state: "GA", aliases: ["Panaji", "Panjim", "Reis Magos"] }],
    ["Amona", 15.53, 73.98, { state: "GA" }],
    ["Usgaon", 15.43, 74.07, { state: "GA" }],
  ] },
  { id: "NW-111", name: "Zuari (Goa)", officialKm: 50, points: [
    ["Mormugao", 15.41, 73.8, { state: "GA", aliases: ["Vasco", "Vasco da Gama", "Marmagao"] }],
    ["Cortalim", 15.4, 73.9],
    ["Sanvordem", 15.27, 74.12, { state: "GA" }],
  ] },
];

export const WATERWAY_LIST: Waterway[] = WATERWAYS.map(({ id, name, officialKm }) => ({ id, name, officialKm }));
export const waterwayName = (id?: string) => { const found = WATERWAYS.find((item) => item.id === id); return found ? `${found.id} ${found.name}` : undefined; };

export const TERMINALS: WaterwayTerminal[] = WATERWAYS.flatMap((waterway) => {
  let along = 0;
  const raw = waterway.points.map((point, i) => {
    if (i > 0) along += greatCircleKm({ lat: waterway.points[i - 1]![1], lon: waterway.points[i - 1]![2] }, { lat: point[1], lon: point[2] });
    return { point, along };
  });
  const scale = waterway.officialKm / along;
  return raw.flatMap(({ point: [name, lat, lon, terminal], along: km }) => terminal
    ? [{ id: `${waterway.id}:${name}`, name, waterway: waterway.id, lat, lon, state: terminal.state, aliases: terminal.aliases ?? [], chainageKm: Math.round(km * scale) }]
    : []);
});

/** Distance along the waterway when both terminals are on the same one; undefined otherwise. */
export function waterwayKm(fromId?: string, toId?: string): { km: number; waterway: string } | undefined {
  const a = TERMINALS.find((item) => item.id === fromId), b = TERMINALS.find((item) => item.id === toId);
  if (!a || !b || a.waterway !== b.waterway || a.id === b.id) return undefined;
  return { km: Math.abs(a.chainageKm - b.chainageKm), waterway: a.waterway };
}
