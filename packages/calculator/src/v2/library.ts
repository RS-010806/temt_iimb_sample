import type { SourceId } from "./sources.js";

/**
 * TEMT factor library. All intensities are kg CO2e per tonne-kilometre unless a unit says otherwise.
 * WTT = well-to-tank (energy provision), TTW = tank-to-wheel (vehicle operation), WTW = WTT + TTW.
 */
/** `temt` is TEMT's own, ISO 14083-validated factor set and the default; `glec-india` is offered for comparison. */
export type FactorSetId = "temt" | "glec-india";
export type TransportMode = "road" | "rail" | "air" | "sea" | "iww";
export type RoadClassId = "gvw-3.5" | "gvw-3-5" | "gvw-5-12" | "gvw-12-20" | "gvw-20-30" | "gvw-30-50" | "trailer-30-60";
export type RoadFuel = "diesel" | "petrol" | "cng" | "electric";
export type AirService = "unknown" | "freighter" | "belly";
export type AirScope = "domestic" | "international";
export type ContainerType = "dry" | "reefer";
export type HubCondition = "ambient" | "mixed";

export interface Intensity {
  wtt: number;
  ttw: number;
  source: SourceId;
  ref: string;
}

export interface FactorSet {
  id: FactorSetId;
  label: string;
  short: string;
  description: string;
}

export const FACTOR_SETS: Readonly<Record<FactorSetId, FactorSet>> = Object.freeze({
  temt: {
    id: "temt",
    label: "TEMT emission factors",
    short: "TEMT factors",
    description: "TEMT's India-specific emission factors, validated through its ISO 14083 certification. Where TEMT does not publish its own value, such as container trade lanes, inland waterways and most hub operations, the ISO 14083-aligned GLEC Framework v3.2 default is used.",
  },
  "glec-india": {
    id: "glec-india",
    label: "GLEC Framework v3.2 (for comparison)",
    short: "GLEC v3.2",
    description: "Smart Freight Centre's GLEC Framework v3.2 defaults, whose Indian road values come from TCI–IIMB research. Use this set to compare with partners who report on GLEC defaults.",
  },
});

export const ENGINE_V2_VERSION = "temt-engine-2.0.0";
/** Road refrigeration uplift applied by TEMT to temperature-controlled road freight. */
export const REEFER_UPLIFT = 1.21;
/** Air distance is great-circle distance plus 95 km (GLEC / ISO 14083 distance adjustment). */
export const AIR_DISTANCE_ADJUSTMENT_KM = 95;
/** GLEC non-container sea values are quoted without the 15% distance adjustment factor. */
export const SEA_DISTANCE_ADJUSTMENT = 1.15;

const g = (wtt: number, ttw: number, ref: string): Intensity => ({ wtt: wtt / 1000, ttw: ttw / 1000, source: "glec-3.2", ref });
const t = (wtt: number, ttw: number, ref: string): Intensity => ({ wtt, ttw, source: "temt", ref });

// ─── Road ──────────────────────────────────────────────────────────────────

export interface RoadClass {
  id: RoadClassId;
  label: string;
  gvw: string;
  payload: string;
  payloadMaxT: number;
  typical: string;
  /** GLEC Table 13 operating assumptions for the Indian default. */
  loadFactor: number;
  emptyRunning: number;
}

export const ROAD_CLASSES: readonly RoadClass[] = Object.freeze([
  { id: "gvw-3.5", label: "Light commercial vehicle", gvw: "up to 3.5 t", payload: "0.5–2 t", payloadMaxT: 2, typical: "Mini-truck or pickup, first and last mile", loadFactor: 0.83, emptyRunning: 0.109 },
  { id: "gvw-3-5", label: "Small commercial vehicle", gvw: "3–5 t", payload: "2–3.5 t", payloadMaxT: 3.5, typical: "Small rigid truck, city distribution", loadFactor: 0.827, emptyRunning: 0.109 },
  { id: "gvw-5-12", label: "Intermediate rigid truck", gvw: "5–12 t", payload: "3.5–8 t", payloadMaxT: 8, typical: "14–17 ft rigid, regional distribution", loadFactor: 0.788, emptyRunning: 0.108 },
  { id: "gvw-12-20", label: "Medium rigid truck", gvw: "12–20 t", payload: "8–12 t", payloadMaxT: 12, typical: "19–22 ft rigid, part-load line haul", loadFactor: 0.768, emptyRunning: 0.124 },
  { id: "gvw-20-30", label: "Heavy rigid truck", gvw: "20–30 t", payload: "12–20 t", payloadMaxT: 20, typical: "24 ft multi-axle rigid", loadFactor: 0.694, emptyRunning: 0.12 },
  { id: "gvw-30-50", label: "Multi-axle heavy truck", gvw: "30–50 t", payload: "20–40 t", payloadMaxT: 40, typical: "32 ft multi-axle, full truckload", loadFactor: 0.683, emptyRunning: 0.144 },
  { id: "trailer-30-60", label: "Tractor-trailer", gvw: "30–60 t", payload: "20–50 t", payloadMaxT: 50, typical: "40 ft trailer, container and bulk", loadFactor: 0.6721, emptyRunning: 0.133 },
]);

type RoadTable = Partial<Record<RoadClassId, Partial<Record<Exclude<RoadFuel, "electric">, Intensity>>>>;

export const ROAD_FACTORS: Readonly<Record<FactorSetId, RoadTable>> = Object.freeze({
  "glec-india": {
    "gvw-3.5": { diesel: g(87.9, 291.6, "Table 13"), petrol: g(99.9, 312.4, "Table 13"), cng: g(133.7, 358.3, "Table 13") },
    "gvw-3-5": { diesel: g(51.4, 170.7, "Table 13") },
    "gvw-5-12": { diesel: g(32.4, 107.5, "Table 13"), cng: g(45.9, 122.9, "Table 13") },
    "gvw-12-20": { diesel: g(20.9, 69.2, "Table 13") },
    "gvw-20-30": { diesel: g(19.1, 63.2, "Table 13") },
    "gvw-30-50": { diesel: g(15.4, 50.9, "Table 13") },
    "trailer-30-60": { diesel: g(12.8, 42.3, "Table 13") },
  },
  "temt": {
    "gvw-3.5": { diesel: t(0.053, 0.179, "Road vehicle table"), petrol: t(0.051, 0.156, "Road vehicle table"), cng: t(0.075, 0.181, "Road vehicle table") },
    "gvw-3-5": { diesel: t(0.041, 0.138, "Road vehicle table") },
    "gvw-5-12": { diesel: t(0.027, 0.089, "Road vehicle table"), cng: t(0.034, 0.083, "Road vehicle table") },
    "gvw-12-20": { diesel: t(0.019, 0.063, "Road vehicle table"), cng: t(0.031, 0.074, "Road vehicle table") },
    "gvw-20-30": { diesel: t(0.023, 0.077, "Road vehicle table") },
    "gvw-30-50": { diesel: t(0.014, 0.048, "Road vehicle table") },
    "trailer-30-60": { diesel: t(0.013, 0.043, "Road vehicle table") },
  },
});

/**
 * Battery-electric truck energy intensity (kWh per tonne-km), average/mixed loading.
 * GLEC v3.2 Table 11 publishes European and South American values; India-specific defaults are not
 * yet published, so these are proxies. Light vehicles have no proxy and need measured energy data.
 */
export const EV_ENERGY_PROXY_KWH_PER_TKM: Readonly<Partial<Record<RoadClassId, number>>> = Object.freeze({
  "gvw-3-5": 0.44, "gvw-5-12": 0.34, "gvw-12-20": 0.22, "gvw-20-30": 0.16, "gvw-30-50": 0.16, "trailer-30-60": 0.16,
});

/** CEA V21.0 all-India weighted average, FY 2024–25. Electricity has no tank-to-wheel emissions. */
export const INDIA_GRID_KG_PER_KWH = 0.71;

// ─── Courier / part-truckload (TEMT three-leg model) ────────────

export const TEMT_COURIER = Object.freeze({
  firstMile: t(0.067, 0.224, "Courier first-mile default"),
  midMile: t(0.019, 0.063, "Courier mid-mile default"),
  lastMile: t(0.067, 0.224, "Courier last-mile default"),
  /** kg CO2e per tonne per transshipment; two hub handlings per courier consignment. */
  transshipmentKgPerTonne: 0.6,
});

// ─── Rail ──────────────────────────────────────────────────────────────────

export const RAIL_FACTORS: Readonly<Record<FactorSetId, Intensity>> = Object.freeze({
  "glec-india": g(6.4, 4.1, "Module 2, rail, Region: India (mixed diesel/electric traction)"),
  "temt": t(0.0062, 0.0041, "Rail default"),
});

// ─── Air ───────────────────────────────────────────────────────────────────

export const AIR_SHORT_HAUL_LIMIT_KM = 1500;
export const GLEC_AIR: Readonly<Record<AirService, { short: Intensity; long: Intensity }>> = Object.freeze({
  unknown: { short: g(234, 1129, "Air Table 1"), long: g(135, 653, "Air Table 1") },
  freighter: { short: g(261, 1255, "Air Table 1"), long: g(105, 503, "Air Table 1") },
  belly: { short: g(213, 1026, "Air Table 1"), long: g(161, 775, "Air Table 1") },
});
export const TEMT_AIR: Readonly<Record<AirScope, Intensity>> = Object.freeze({
  domestic: t(0.2444, 1.508, "Air domestic default"),
  international: t(0.171, 0.646, "Air international default"),
});

// ─── Sea ───────────────────────────────────────────────────────────────────

export interface TradeLane {
  id: string;
  label: string;
  /** g CO2e per TEU-km, end-user values (include 70% load factor and +15% distance adjustment). */
  dry: { wtt: number; ttw: number };
  reefer: { wtt: number; ttw: number };
}

export const TRADE_LANES: readonly TradeLane[] = Object.freeze([
  { id: "intra-me-india", label: "Intra Middle East / India (coastal and regional)", dry: { wtt: 20.5, ttw: 94 }, reefer: { wtt: 37.2, ttw: 170.6 } },
  { id: "asia-me-india", label: "Asia ↔ Middle East / India", dry: { wtt: 13.8, ttw: 64.5 }, reefer: { wtt: 26.5, ttw: 124.1 } },
  { id: "europe-me-india", label: "Europe (North & Med) ↔ Middle East / India", dry: { wtt: 13, ttw: 60.4 }, reefer: { wtt: 24.6, ttw: 114.6 } },
  { id: "trans-suez", label: "Trans-Suez (aggregate)", dry: { wtt: 8.9, ttw: 41.7 }, reefer: { wtt: 20.1, ttw: 94.4 } },
  { id: "asia-north-europe", label: "Asia ↔ North Europe", dry: { wtt: 8.2, ttw: 38.7 }, reefer: { wtt: 19.4, ttw: 91.2 } },
  { id: "asia-med", label: "Asia ↔ Mediterranean / Black Sea", dry: { wtt: 9.1, ttw: 43.1 }, reefer: { wtt: 20.4, ttw: 96 } },
  { id: "asia-africa", label: "Asia ↔ Africa", dry: { wtt: 15.4, ttw: 72.8 }, reefer: { wtt: 28.3, ttw: 133 } },
  { id: "asia-na-east", label: "Asia ↔ North America East Coast / Gulf", dry: { wtt: 10.5, ttw: 48.5 }, reefer: { wtt: 21.9, ttw: 100.6 } },
  { id: "asia-na-west", label: "Asia ↔ North America West Coast", dry: { wtt: 12, ttw: 55 }, reefer: { wtt: 24, ttw: 110.4 } },
  { id: "asia-oceania", label: "Asia ↔ Oceania", dry: { wtt: 16.9, ttw: 79 }, reefer: { wtt: 30.2, ttw: 141 } },
  { id: "asia-south-america", label: "Asia ↔ South America", dry: { wtt: 11.8, ttw: 55.9 }, reefer: { wtt: 23.9, ttw: 112.2 } },
  { id: "se-ne-asia", label: "South-East Asia ↔ North-East Asia", dry: { wtt: 19.3, ttw: 89.2 }, reefer: { wtt: 33.6, ttw: 155.2 } },
  { id: "intra-se-asia", label: "Intra South-East Asia", dry: { wtt: 23.5, ttw: 112.1 }, reefer: { wtt: 39.5, ttw: 188 } },
  { id: "industry-average", label: "Industry average (lane unknown)", dry: { wtt: 12.7, ttw: 59 }, reefer: { wtt: 25.3, ttw: 117 } },
]);

/** Average cargo mass per TEU used to convert TEU-km intensities (TEMT options). */
export const TEU_LOADS = Object.freeze([
  { id: "light", label: "Lightweight cargo", tonnes: 6 },
  { id: "average", label: "Average cargo", tonnes: 10 },
  { id: "heavy", label: "Heavyweight cargo", tonnes: 14.5 },
  { id: "empty", label: "Empty container", tonnes: 2 },
]);

export interface Vessel {
  id: string;
  type: string;
  size: string;
  /** GLEC Tables 14–17, VLSFO, g CO2e per t-km, before the 15% distance adjustment. */
  glec?: { wtt: number; ttw: number };
  /** TEMT TTW factor, kg CO2e per t-km; WTT is taken as one fifth of TTW. */
  temtTtw?: number;
}

const v = (type: string, size: string, glec?: [number, number], temtTtw?: number): Vessel => ({
  id: `${type}-${size}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
  type, size, ...(glec ? { glec: { wtt: glec[0], ttw: glec[1] } } : {}), ...(temtTtw !== undefined ? { temtTtw } : {}),
});

export const VESSELS: readonly Vessel[] = Object.freeze([
  v("Bulk carrier", "0–9,999 dwt", [5.6, 26.5], 0.02424),
  v("Bulk carrier", "10,000–34,999 dwt", [1.5, 7.3], 0.00691),
  v("Bulk carrier", "35,000–59,999 dwt", [1.1, 5.3], 0.00513),
  v("Bulk carrier", "60,000–99,999 dwt", [0.9, 4.4], 0.00421),
  v("Bulk carrier", "100,000–199,999 dwt", [0.6, 3.0], 0.00286),
  v("Bulk carrier", "200,000+ dwt", [0.6, 2.7], 0.00259),
  v("General cargo", "0–4,999 dwt", [4.8, 22.4], 0.021),
  v("General cargo", "5,000–9,999 dwt", [3.9, 18.1], 0.01717),
  v("General cargo", "10,000–19,999 dwt", [3.4, 16.1], 0.01533),
  v("General cargo", "20,000+ dwt", [1.8, 8.3], 0.00788),
  v("Chemical tanker", "0–4,999 dwt", [10.9, 51.2], 0.04465),
  v("Chemical tanker", "5,000–9,999 dwt", [4.8, 22.7], 0.02154),
  v("Chemical tanker", "10,000–19,999 dwt", [3.3, 15.4], 0.01469),
  v("Chemical tanker", "20,000–39,999 dwt", [2.0, 9.4], 0.00907),
  v("Chemical tanker", "40,000+ dwt", [1.5, 7.2], 0.00697),
  v("Oil tanker", "0–4,999 dwt", [15.6, 73.0], 0.06188),
  v("Oil tanker", "5,000–9,999 dwt", [8.5, 40.1], 0.03488),
  v("Oil tanker", "10,000–19,999 dwt", [6.7, 31.4], 0.02819),
  v("Oil tanker", "20,000–59,999 dwt", [3.3, 15.3], 0.01436),
  v("Oil tanker", "60,000–79,999 dwt", [1.9, 8.8], 0.00832),
  v("Oil tanker", "80,000–119,999 dwt", [1.5, 6.9], 0.00648),
  v("Oil tanker", "120,000–199,999 dwt", [1.1, 5.1], 0.00481),
  v("Oil tanker", "200,000+ dwt", [0.7, 3.1], 0.00302),
  v("Liquefied gas tanker", "0–49,999 cbm", [8.6, 40.2], 0.03623),
  v("Liquefied gas tanker", "50,000–99,999 cbm", [2.5, 11.7], 0.01123),
  v("Liquefied gas tanker", "100,000–199,999 cbm", [2.0, 9.2], 0.00886),
  v("Liquefied gas tanker", "200,000+ cbm", [2.1, 9.7], 0.00913),
  v("Other liquid tanker", "0–999 dwt", [221.4, 1038.3], 1.00032),
  v("Other liquid tanker", "1,000+ dwt", [5.9, 27.8], 0.02176),
  v("Refrigerated bulk", "0–1,999 dwt", [28.7, 134.4], 0.11776),
  v("Refrigerated bulk", "2,000–5,999 dwt", [13.9, 65.1], 0.0615),
  v("Refrigerated bulk", "6,000–9,999 dwt", [10.4, 48.8], 0.04638),
  v("Refrigerated bulk", "10,000+ dwt", [7.7, 35.9], 0.03413),
  v("Ro-Ro", "0–4,999 dwt", [36.7, 172.2], 0.14525),
  v("Ro-Ro", "5,000–9,999 dwt", [8.0, 37.7], 0.03575),
  v("Ro-Ro", "10,000–14,999 dwt", [6.7, 31.3], 0.02986),
  v("Ro-Ro", "15,000+ dwt", [3.5, 16.5], 0.01506),
  v("Vehicle carrier", "0–29,999 GT", [17.9, 83.7], 0.07921),
  v("Vehicle carrier", "30,000–49,999 GT", [8.5, 39.9], 0.03861),
  v("Vehicle carrier", "50,000+ GT", [6.9, 32.5], 0.03121),
  v("Ferry Ro-Pax", "0–1,999 GT", [96.6, 453.0]),
  v("Ferry Ro-Pax", "2,000–4,999 GT", [46.7, 218.8], 0.19206),
  v("Ferry Ro-Pax", "5,000–9,999 GT", [36.1, 169.5], 0.14795),
  v("Ferry Ro-Pax", "10,000–19,999 GT", [23.1, 108.3], 0.09784),
  v("Ferry Ro-Pax", "20,000+ GT", [17.5, 81.8], 0.07592),
  v("Container ship", "0–999 TEU", undefined, 0.01982),
  v("Container ship", "1,000–1,999 TEU", undefined, 0.01479),
  v("Container ship", "2,000–2,999 TEU", undefined, 0.01053),
  v("Container ship", "3,000–4,999 TEU", undefined, 0.00923),
  v("Container ship", "5,000–7,999 TEU", undefined, 0.0088),
  v("Container ship", "8,000–11,999 TEU", undefined, 0.00734),
  v("Container ship", "12,000–14,499 TEU", undefined, 0.00578),
  v("Container ship", "14,500–19,999 TEU", undefined, 0.00459),
  v("Container ship", "20,000+ TEU", undefined, 0.00432),
]);

// ─── Inland waterways (GLEC v3.2 Module 2, Table 2; primarily European operating data) ───

export const IWW_VESSELS = Object.freeze([
  { id: "mv-lt-50", label: "Motor vessel < 50 m (< 650 t)", f: g(17.8, 59.2, "IWW Table 2") },
  { id: "mv-50-80", label: "Motor vessel 50–80 m (650–1,000 t)", f: g(7.9, 26.1, "IWW Table 2") },
  { id: "mv-85-110", label: "Motor vessel 85–110 m (1,000–2,000 t)", f: g(4.9, 16.4, "IWW Table 2") },
  { id: "mv-135", label: "Motor vessel 135 m (2,000–3,000 t)", f: g(5.0, 16.7, "IWW Table 2") },
  { id: "coupled-convoy", label: "Coupled convoy (163–185 m)", f: g(4.6, 15.1, "IWW Table 2") },
  { id: "push-2", label: "Pushed convoy, push boat + 2 barges", f: g(4.7, 15.5, "IWW Table 2") },
  { id: "push-4", label: "Pushed convoy, push boat + 4/5 barges", f: g(2.6, 8.7, "IWW Table 2") },
  { id: "tanker", label: "Tanker vessel", f: g(5.7, 19.0, "IWW Table 2") },
  { id: "container-110", label: "Container vessel 110 m", f: g(6.8, 22.5, "IWW Table 2") },
  { id: "container-135", label: "Container vessel 135 m", f: g(5.2, 17.4, "IWW Table 2") },
] as const);

// ─── Logistics hubs (GLEC v3.2 Module 2, Table 3; WTW, split not published) ───

export type HubTypeId = "transshipment" | "storage-transshipment" | "warehouse" | "liquid-bulk" | "container-terminal";
export const HUB_TYPES: Readonly<Record<HubTypeId, { label: string; unit: "tonne" | "container"; ambient: number; mixed: number; description: string }>> = Object.freeze({
  transshipment: { label: "Transshipment hub", unit: "tonne", ambient: 1.2, mixed: 2.6, description: "Cross-dock or sorting hub where goods are transferred between vehicles." },
  "storage-transshipment": { label: "Storage and transshipment", unit: "tonne", ambient: 2.7, mixed: 2.9, description: "Hub that both stores and transfers goods." },
  warehouse: { label: "Warehouse", unit: "tonne", ambient: 40.1, mixed: 50, description: "Storage is the main service. The mixed value is a Fraunhofer IML lower-bound estimate." },
  "liquid-bulk": { label: "Liquid bulk terminal", unit: "tonne", ambient: 3.4, mixed: 10.2, description: "Tank terminal for liquids." },
  "container-terminal": { label: "Intermodal container terminal", unit: "container", ambient: 11.4, mixed: 13.4, description: "Sea or inland container terminal, per container handled. The second value is temperature-controlled." },
});

// ─── Fuels for the fuel-based method ───────────────────────────────────────

export type FuelId = "diesel" | "petrol" | "cng" | "jet" | "vlsfo" | "mgo" | "lng-marine" | "electricity";
export interface Fuel {
  id: FuelId;
  label: string;
  /** kg CO2e per base unit. */
  ttw: number;
  wtw: number;
  unit: "kg" | "kWh";
  /** kg per litre, where the fuel is commonly measured by volume. */
  density?: number;
  source: SourceId;
  ref: string;
}

export const FUELS: Readonly<Record<FuelId, Fuel>> = Object.freeze({
  diesel: { id: "diesel", label: "Diesel (HSD)", ttw: 3.24, wtw: 4.21, unit: "kg", density: 0.83, source: "glec-3.2", ref: "Module 1, Indian sources" },
  petrol: { id: "petrol", label: "Petrol", ttw: 3.15, wtw: 4.16, unit: "kg", density: 0.71, source: "glec-3.2", ref: "Module 1, Indian sources" },
  cng: { id: "cng", label: "Compressed natural gas", ttw: 2.86, wtw: 3.2, unit: "kg", source: "glec-3.2", ref: "Module 1, Indian sources" },
  jet: { id: "jet", label: "Jet kerosene (Jet A-1)", ttw: 3.18, wtw: 3.84, unit: "kg", density: 0.802, source: "glec-3.2", ref: "Module 1, air fuel" },
  vlsfo: { id: "vlsfo", label: "Heavy fuel oil (VLSFO)", ttw: 3.16, wtw: 3.84, unit: "kg", source: "glec-3.2", ref: "Module 1, marine fuel" },
  mgo: { id: "mgo", label: "Marine diesel / gas oil", ttw: 3.26, wtw: 4.01, unit: "kg", source: "glec-3.2", ref: "Module 1, marine fuel" },
  "lng-marine": { id: "lng-marine", label: "LNG (marine, default engine)", ttw: 3.73, wtw: 4.61, unit: "kg", source: "glec-3.2", ref: "Module 1, marine fuel" },
  electricity: { id: "electricity", label: "Grid electricity (India)", ttw: 0, wtw: INDIA_GRID_KG_PER_KWH, unit: "kWh", source: "cea-21", ref: "Weighted average, FY 2024–25" },
});

export const MODE_LABELS: Readonly<Record<TransportMode, string>> = Object.freeze({ road: "Road", rail: "Rail", air: "Air", sea: "Sea", iww: "Inland waterway" });
