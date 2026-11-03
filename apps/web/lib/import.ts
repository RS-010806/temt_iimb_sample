import { calculateShipment, seaRoute, suggestTradeLane, IWW_VESSELS, TRADE_LANES, VESSELS, type DistanceMethod, type FactorSetId, type FuelId, type HubInput, type LegInput, type RoadClassId, type TransportMode } from "@temt/calculator";
import { buildRecord, refSequence, vehicleForTonnes } from "./builders";
import { MODE_PLACE_KINDS, TERMINAL_KINDS, compactLabel, estimateDistance, hasCoords, measureDistance, nearestAirport, nearestIndianPort, nearestTerminal, resolvePlace, type Place, type PlaceKind } from "./places";
import { loadStations, nearestStation } from "./rail";
import type { Direction, LegMeta, PaidBy, RecordSource, ShipmentRecord } from "./records";

/** One template per way of shipping, each with only the columns that mode needs, plus the leg-by-leg multi-stop template. */
export type TemplateId = "road" | "courier" | "rail" | "air" | "sea" | "iww" | "temt";
export type ImportFormat = TemplateId | "legacy-road" | "legacy-rail" | "legacy-air" | "legacy-coastal" | "legacy-water" | "legacy-courier" | "ewaybill";

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  road: "Road template", courier: "Courier / PTL template", rail: "Rail template", air: "Air template", sea: "Sea template", iww: "Inland waterway template", temt: "Multi-stop template",
  "legacy-road": "Earlier TEMT · Point to point", "legacy-rail": "Earlier TEMT · Railway", "legacy-air": "Earlier TEMT · Air",
  "legacy-coastal": "Earlier TEMT · Coastal", "legacy-water": "Earlier TEMT · International water", "legacy-courier": "Earlier TEMT · Courier / PTL", ewaybill: "E-way bill JSON",
};

interface Column { key: string; help: string; required?: boolean; options?: readonly string[] }
export interface ImportTemplate { id: TemplateId; label: string; summary: string; file: string; columns: Column[]; examples: Record<string, string | number>[] }

const reference = (key: string, what: string): Column => ({ key, required: true, help: `Essential. ${what}. A number already saved in TEMT updates that shipment instead of adding a second one. If left blank, TEMT assigns a reference.` });
const DISPATCH: Column = { key: "dispatch_date", required: true, help: "Essential. Dispatch date: YYYY-MM-DD or DD/MM/YYYY." };
const WEIGHT: Column = { key: "cargo_weight", required: true, help: "Weight of this shipment, not the vehicle's capacity." };
const weightUnit = (fallback: "ton" | "kg"): Column => ({ key: "weight_unit", options: ["ton", "kg"], help: `ton or kg. Blank means ${fallback}.` });
const DISTANCE: Column = { key: "distance_km", help: "Optional. The actual distance from your records. Blank: TEMT calculates it from the two places." };
const OPTIONAL: Column[] = [{ key: "business_unit", help: "Optional. Blank uses the default set on the import page." }, { key: "commodity", help: "Optional." }, { key: "notes", help: "Optional." }];

export const IMPORT_TEMPLATES: ImportTemplate[] = [
  { id: "road", label: "Road (truckload)", summary: "LR number, cities or PIN codes, truck type, fuel", file: "TEMT-road-template", columns: [
    reference("lr_number", "Lorry receipt (LR) number"), DISPATCH,
    { key: "origin", required: true, help: "City, town or 6-digit PIN code. Earlier names such as Bombay and Bangalore work." },
    { key: "destination", required: true, help: "City, town or 6-digit PIN code." }, WEIGHT, weightUnit("ton"),
    { key: "truck_type", help: "32 ft, 24 ft, 19 ft, 14 ft, LCV, trailer, or a GVW range such as “GVW 12 to 20 MT”. Blank chooses a truck that fits the cargo." },
    { key: "fuel", options: ["diesel", "cng", "petrol", "electric"], help: "diesel, cng, petrol or electric. Blank means diesel." },
    { key: "refrigerated", options: ["no", "yes"], help: "yes for temperature-controlled cargo." }, DISTANCE,
    { key: "fuel_used", help: "Optional primary data: fuel (or kWh for electric trucks) actually used for this trip, for example from a fuel card. Emissions then come from the fuel." },
    { key: "fuel_unit", options: ["litres", "kg", "kWh"], help: "litres or kg for fuel (CNG in kg), kWh for electricity." }, ...OPTIONAL],
    examples: [
      { lr_number: "LR-20481", dispatch_date: "2026-04-03", origin: "Silvassa", destination: "Delhi", cargo_weight: 22, weight_unit: "ton", truck_type: "32 ft", fuel: "diesel", refrigerated: "no", business_unit: "Foods", commodity: "Packaged foods" },
      { lr_number: "LR-20482", dispatch_date: "06/04/2026", origin: "421302", destination: "Bangalore", cargo_weight: 8500, weight_unit: "kg", truck_type: "19 ft", fuel: "cng", refrigerated: "no", distance_km: 985, business_unit: "Home Care" },
      { lr_number: "LR-20483", dispatch_date: "2026-04-08", origin: "Pune", destination: "Nashik", cargo_weight: 12, weight_unit: "ton", truck_type: "GVW 12 to 20 MT", fuel: "diesel", refrigerated: "no", distance_km: 212, fuel_used: 58, fuel_unit: "litres", notes: "Own truck, fuel card" },
    ] },
  { id: "courier", label: "Courier / PTL", summary: "AWB or docket, hubs, first- and last-mile distances", file: "TEMT-courier-template", columns: [
    reference("awb_or_docket_number", "Air waybill or docket number"), DISPATCH,
    { key: "origin", required: true, help: "Pickup city or PIN code." }, { key: "destination", required: true, help: "Delivery city or PIN code." }, WEIGHT, weightUnit("kg"),
    { key: "origin_hub", help: "Optional. City of the carrier's origin hub. Blank: the pickup city." },
    { key: "destination_hub", help: "Optional. City of the destination hub. Blank: the delivery city." },
    { key: "first_mile_km", help: "Pickup to origin hub. Blank means 25 km." },
    { key: "line_haul_km", help: "Optional. Hub to hub. Blank: calculated between the hubs." },
    { key: "last_mile_km", help: "Destination hub to delivery. Blank means 25 km." }, ...OPTIONAL],
    examples: [
      { awb_or_docket_number: "7845 1203 9921", dispatch_date: "2026-04-10", origin: "Gurugram", destination: "Lucknow", cargo_weight: 350, weight_unit: "kg", origin_hub: "Delhi", first_mile_km: 20, last_mile_km: 15 },
      { awb_or_docket_number: "7845 1203 9922", dispatch_date: "2026-04-11", origin: "560001", destination: "600001", cargo_weight: 42, weight_unit: "kg" },
    ] },
  { id: "rail", label: "Rail", summary: "RR number, stations by name or code", file: "TEMT-rail-template", columns: [
    reference("rr_number", "Railway receipt (RR) number"), DISPATCH,
    { key: "from_station", required: true, help: "Railway station name or code, for example NDLS, Howrah or KSR Bengaluru." },
    { key: "to_station", required: true, help: "Railway station name or code." }, WEIGHT, weightUnit("ton"),
    { key: "distance_km", help: "Optional. Blank: the shortest route on the Indian Railways network between the stations." },
    { key: "fuel", options: ["diesel", "electricity"], help: "Only with fuel_used: diesel locomotive or electric traction." },
    { key: "fuel_used", help: "Optional primary data from the operator: diesel or electricity used for this cargo." },
    { key: "fuel_unit", options: ["litres", "kg", "kWh"], help: "litres or kg for diesel, kWh for electricity." }, ...OPTIONAL],
    examples: [
      { rr_number: "RR-112093", dispatch_date: "2026-04-09", from_station: "Hosur", to_station: "Guwahati", cargo_weight: 40, weight_unit: "ton", business_unit: "Foods" },
      { rr_number: "RR-112094", dispatch_date: "2026-04-12", from_station: "NDLS", to_station: "MAS", cargo_weight: 180, weight_unit: "ton" },
    ] },
  { id: "air", label: "Air", summary: "AWB number, airports by code or name, aircraft", file: "TEMT-air-template", columns: [
    reference("awb_number", "Air waybill (AWB) number"), DISPATCH,
    { key: "from_airport", required: true, help: "Airport code (BOM), airport name or the city it serves." },
    { key: "to_airport", required: true, help: "Airport code, airport name or city." }, WEIGHT, weightUnit("kg"),
    { key: "aircraft", options: ["unknown", "belly", "freighter"], help: "belly (passenger aircraft hold), freighter, or unknown for the average mix." },
    { key: "distance_km", help: "Optional. Blank: great-circle distance between the airports plus GLEC's 95 km routing allowance." },
    { key: "fuel_used", help: "Optional primary data: jet fuel attributable to this shipment." },
    { key: "fuel_unit", options: ["litres", "kg", "tonnes"], help: "litres, kg or tonnes of jet fuel." }, ...OPTIONAL],
    examples: [
      { awb_number: "098-12345675", dispatch_date: "2026-04-12", from_airport: "DEL", to_airport: "BLR", cargo_weight: 800, weight_unit: "kg", aircraft: "belly", business_unit: "Personal Care" },
      { awb_number: "176-55667788", dispatch_date: "2026-04-14", from_airport: "Mumbai", to_airport: "DXB", cargo_weight: 1.2, weight_unit: "ton", aircraft: "freighter" },
    ] },
  { id: "sea", label: "Sea", summary: "B/L number, ports, container or vessel type", file: "TEMT-sea-template", columns: [
    reference("bl_number", "Bill of lading (B/L) number"), DISPATCH,
    { key: "from_port", required: true, help: "Port name or the city it serves, for example Nhava Sheva, Chennai or Rotterdam." },
    { key: "to_port", required: true, help: "Port name or city." }, WEIGHT, weightUnit("ton"),
    { key: "shipped_as", options: ["container", "vessel"], help: "container (by trade lane) or vessel (bulk, tanker, general cargo, Ro-Ro…). Blank means container." },
    { key: "container_type", options: ["dry", "reefer"], help: "Containers only. Blank means dry." },
    { key: "cargo_per_teu", help: "Containers only: tonnes of cargo per TEU. Blank means 10 (average cargo)." },
    { key: "trade_lane", options: TRADE_LANES.map((lane) => lane.id), help: "Containers only. Blank: suggested from the two ports." },
    { key: "vessel_type", options: [...new Set(VESSELS.map((vessel) => vessel.type))], help: "Vessels only, for example Bulk carrier, Oil tanker or General cargo." },
    { key: "vessel_size", help: "Vessels only, as in the factor library, for example “35,000–59,999 dwt”." },
    { key: "distance_nm", help: "Optional. Nautical miles actually sailed. Blank: shortest sea-lane route between the ports." },
    { key: "fuel", options: ["vlsfo", "mgo", "lng"], help: "Only with fuel_used: fuel oil (VLSFO), marine gas oil or LNG." },
    { key: "fuel_used", help: "Optional primary data from the carrier: fuel attributable to this cargo." },
    { key: "fuel_unit", options: ["tonnes", "kg"], help: "tonnes or kg." }, ...OPTIONAL],
    examples: [
      { bl_number: "BL-5521", dispatch_date: "2026-04-15", from_port: "Nhava Sheva", to_port: "Rotterdam", cargo_weight: 60, weight_unit: "ton", shipped_as: "container", container_type: "dry", cargo_per_teu: 10, business_unit: "Exports" },
      { bl_number: "BL-5522", dispatch_date: "2026-04-18", from_port: "Paradip", to_port: "Visakhapatnam", cargo_weight: 5000, weight_unit: "ton", shipped_as: "vessel", vessel_type: "Bulk carrier", vessel_size: "35,000–59,999 dwt" },
    ] },
  { id: "iww", label: "Inland waterway", summary: "Waterway terminals on NW-1, NW-2, NW-3 and more, vessel type", file: "TEMT-inland-waterway-template", columns: [
    reference("consignment_number", "Consignment note or barge bill number"), DISPATCH,
    { key: "from_terminal", required: true, help: "National Waterway terminal, for example Haldia, Kolkata, Patna, Varanasi, Pandu (Guwahati) or Kochi." },
    { key: "to_terminal", required: true, help: "National Waterway terminal." }, WEIGHT, weightUnit("ton"),
    { key: "vessel", options: IWW_VESSELS.map((vessel) => vessel.id), help: `Vessel type: ${IWW_VESSELS.map((vessel) => `${vessel.id} = ${vessel.label}`).join("; ")}. Blank means mv-85-110.` },
    { key: "distance_km", help: "Optional. Blank: distance along the National Waterway between the terminals." }, ...OPTIONAL],
    examples: [
      { consignment_number: "IWT-0091", dispatch_date: "2026-04-20", from_terminal: "Haldia", to_terminal: "Patna", cargo_weight: 1200, weight_unit: "ton", vessel: "push-4" },
      { consignment_number: "IWT-0092", dispatch_date: "2026-04-22", from_terminal: "Pandu", to_terminal: "Dhubri", cargo_weight: 600, weight_unit: "ton", vessel: "mv-50-80" },
    ] },
  { id: "temt", label: "Multi-stop or mixed modes", summary: "One row per leg; rows with the same reference form one shipment", file: "TEMT-multi-stop-template", columns: [
    { key: "reference", required: true, help: "Essential. LR, RR, AWB or B/L number. Rows with the same reference and a leg_no form one multi-stop shipment; a reference already saved in TEMT is updated." },
    { key: "leg_no", help: "1, 2, 3… in travel order. Leave 1 for single-leg rows." }, { key: "date", required: true, help: "Essential. Dispatch date, YYYY-MM-DD or DD/MM/YYYY." },
    { key: "origin", required: true, help: "Start of this leg: a city or PIN code for road; a station for rail; an airport for air; a port for sea; a waterway terminal for inland waterway." },
    { key: "destination", required: true, help: "End of this leg, by the same rule." },
    { key: "mode", required: true, options: ["road", "rail", "air", "sea", "iww"], help: "road, rail, air, sea or iww (inland waterway)." },
    { key: "tonnes", required: true, help: "Cargo weight in tonnes." }, { key: "distance_km", help: "Optional. Blank: calculated from the places." },
    { key: "vehicle_class", help: "Road only: 32 ft, 24 ft, 19 ft, 14 ft, LCV, trailer or a GVW range." },
    { key: "fuel", options: ["diesel", "cng", "petrol", "electric"], help: "Road only." }, { key: "refrigerated", options: ["no", "yes"], help: "Road only." },
    { key: "air_service", options: ["unknown", "belly", "freighter"], help: "Air only." },
    { key: "trade_lane", options: TRADE_LANES.map((lane) => lane.id), help: "Sea containers only. Blank: suggested from the ports." },
    { key: "container_type", options: ["dry", "reefer"], help: "Sea containers only." }, { key: "tonnes_per_teu", help: "Sea containers only. Blank means 10." },
    { key: "vessel_type", help: "Sea vessels only, as “Bulk carrier, 35000-59999 dwt”." },
    { key: "direction", options: ["inbound", "outbound", "inter-facility"], help: "Optional." }, { key: "business_unit", help: "Optional." }, { key: "commodity", help: "Optional." }, { key: "notes", help: "Optional." }],
    examples: [
      { reference: "RR-2026-0007", leg_no: 1, date: "2026-04-09", origin: "Hosur", destination: "Hosur station", mode: "road", tonnes: 40, distance_km: 6, vehicle_class: "trailer", business_unit: "Foods" },
      { reference: "RR-2026-0007", leg_no: 2, date: "2026-04-09", origin: "Hosur station", destination: "Guwahati station", mode: "rail", tonnes: 40, business_unit: "Foods" },
      { reference: "RR-2026-0007", leg_no: 3, date: "2026-04-09", origin: "Guwahati station", destination: "Guwahati", mode: "road", tonnes: 40, distance_km: 8, vehicle_class: "trailer", business_unit: "Foods" },
      { reference: "BL-5530", leg_no: 1, date: "2026-04-15", origin: "Pune", destination: "Nhava Sheva", mode: "road", tonnes: 18, vehicle_class: "trailer" },
      { reference: "BL-5530", leg_no: 2, date: "2026-04-15", origin: "Nhava Sheva", destination: "Jebel Ali", mode: "sea", tonnes: 18, container_type: "dry" },
    ] },
];

export interface ImportRow {
  line: number;
  status: "ok" | "warning" | "error";
  messages: string[];
  record?: ShipmentRecord;
  /** refInFile: the reference came from the file (LR, RR, AWB, e-way bill), rather than being assigned by TEMT. */
  summary: { ref: string; refInFile: boolean; date: string; route: string; mode: string; tonnes?: number; km?: number; kg?: number };
}

export interface ImportOptions {
  businessUnit: string;
  /** Who operates or pays; imports default to purchased transport. */
  paidBy?: PaidBy;
  direction: Direction;
  defaultTonnes?: number;
  factorSet: FactorSetId;
}

type Raw = Record<string, unknown>;
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const str = (value: unknown) => (value === undefined || value === null ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "object" && value && "text" in value ? String((value as { text: unknown }).text) : typeof value === "object" && value && "result" in value ? String((value as { result: unknown }).result) : String(value)).trim();
const num = (value: unknown) => { const text = str(value).replace(/,/g, ""); if (!text) return undefined; const n = Number(text); return Number.isFinite(n) ? n : NaN; };

export function detectFormat(headers: string[]): ImportFormat | undefined {
  const h = new Set(headers.map(norm));
  if (h.has("from terminal")) return "iww";
  if (h.has("from port")) return "sea";
  if (h.has("from airport")) return "air";
  if (h.has("from station")) return "rail";
  if (h.has("first mile km") || h.has("awb or docket number")) return "courier";
  if (h.has("truck type") || h.has("lr number")) return "road";
  if (h.has("first mile vehicle")) return "legacy-courier";
  if (h.has("distance in nautical miles")) return "legacy-water";
  if (h.has("vessel category")) return "legacy-coastal";
  if (h.has("origin station")) return "legacy-rail";
  if (h.has("shipment start date")) return "legacy-air";
  if (h.has("vehicle category")) return "legacy-road";
  if (h.has("origin") && h.has("destination") && (h.has("tonnes") || h.has("mode"))) return "temt";
  return undefined;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = str(value);
  if (!text) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!; return `${y}-${pad(+m[2]!)}-${pad(+m[1]!)}`; }
  m = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-](\d{2,4})$/);
  if (m && MONTHS[m[2]!.toLowerCase()]) { const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!; return `${y}-${pad(MONTHS[m[2]!.toLowerCase()]!)}-${pad(+m[1]!)}`; }
  if (/^\d{5}$/.test(text)) { const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000); return date.toISOString().slice(0, 10); }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

const MODE_ALIASES: Record<string, TransportMode> = { road: "road", truck: "road", lorry: "road", ftl: "road", ptl: "road", rail: "rail", train: "rail", railway: "rail", air: "air", flight: "air", sea: "sea", ship: "sea", ocean: "sea", coastal: "sea", vessel: "sea", iww: "iww", waterway: "iww", barge: "iww", "inland waterway": "iww" };

/** Map truck descriptions, class ids or earlier TEMT labels to a class. */
export function parseVehicle(value: string, tonnes: number): { id: RoadClassId; guessed: boolean } {
  const text = value.toLowerCase();
  const ids: RoadClassId[] = ["gvw-3.5", "gvw-3-5", "gvw-5-12", "gvw-12-20", "gvw-20-30", "gvw-30-50", "trailer-30-60"];
  const exact = ids.find((id) => text === id);
  if (exact) return { id: exact, guessed: false };
  if (/trailer|40 ?ft/.test(text)) return { id: "trailer-30-60", guessed: false };
  const gvw = text.match(/gvw\s*(?:<|less than)?\s*(\d+(?:\.\d+)?)\s*(?:to|-)?\s*(\d+(?:\.\d+)?)?/);
  if (gvw) {
    const low = Number(gvw[1]), high = gvw[2] ? Number(gvw[2]) : undefined;
    if (!high || high <= 3.5) return { id: "gvw-3.5", guessed: false };
    if (high <= 5) return { id: "gvw-3-5", guessed: false };
    if (high <= 12) return { id: "gvw-5-12", guessed: false };
    if (high <= 20) return { id: "gvw-12-20", guessed: false };
    if (high <= 30) return { id: "gvw-20-30", guessed: false };
    if (high <= 50 && low >= 30) return { id: "gvw-30-50", guessed: false };
    return { id: "trailer-30-60", guessed: false };
  }
  if (/32 ?ft|mxl|sxl|multi ?axle|12 ?wheel|14 ?wheel/.test(text)) return { id: "gvw-30-50", guessed: false };
  if (/24 ?ft|10 ?wheel|hcv/.test(text)) return { id: "gvw-20-30", guessed: false };
  if (/19 ?ft|20 ?ft|22 ?ft|mcv|6 ?wheel/.test(text)) return { id: "gvw-12-20", guessed: false };
  if (/14 ?ft|17 ?ft|icv/.test(text)) return { id: "gvw-5-12", guessed: false };
  if (/scv|10 ?ft/.test(text)) return { id: "gvw-3-5", guessed: false };
  if (/lcv|pickup|pick-up|mini|ace|van/.test(text)) return { id: "gvw-3.5", guessed: false };
  return { id: vehicleForTonnes(tonnes), guessed: true };
}

/** Earlier TEMT versions used "Crude tanker" for the bulk-carrier size bands; map categories to vessel names. */
const LEGACY_VESSEL: Record<string, string> = { "crude tanker": "Bulk carrier", general: "General cargo", "lpg tanker": "Liquefied gas tanker", refrigerated: "Refrigerated bulk", vehicle: "Vehicle carrier", "container ship": "Container ship", "ferry ro pax": "Ferry Ro-Pax", "other liquid tankers": "Other liquid tanker", "chemical tanker": "Chemical tanker", "oil tanker": "Oil tanker", "ro ro": "Ro-Ro", "bulk carrier": "Bulk carrier" };
export function parseVessel(category: string, size: string) {
  const type = LEGACY_VESSEL[norm(category)] ?? category;
  const first = Number((size.match(/\d[\d,]*/)?.[0] ?? "0").replace(/,/g, ""));
  const candidates = VESSELS.filter((vessel) => vessel.type.toLowerCase() === type.toLowerCase());
  const match = candidates.find((vessel) => Number((vessel.size.match(/\d[\d,]*/)?.[0] ?? "-1").replace(/,/g, "")) === first) ?? candidates[0];
  return { vessel: match, remapped: norm(category) === "crude tanker" };
}

const placeCache = new Map<string, Promise<Place | undefined>>();
function place(text: string, kinds: PlaceKind[]) {
  const key = `${kinds.join()}|${text.toLowerCase()}`;
  if (!placeCache.has(key)) placeCache.set(key, resolvePlace(text, kinds).catch(() => undefined));
  return placeCache.get(key)!;
}

async function resolve(text: string, kinds: PlaceKind[], messages: string[], label: string): Promise<Place> {
  if (!text) { messages.push(`${label} is missing.`); return { label: label, kind: "custom" }; }
  const found = await place(text, kinds);
  if (found) return found;
  // Fall back to trailing words ("Hosur rail terminal" → "Hosur").
  const words = text.split(/[\s,]+/);
  for (let size = Math.min(2, words.length - 1); size >= 1; size -= 1) { const fallback = await place(words.slice(0, size).join(" "), kinds); if (fallback) return { ...fallback, label: text }; }
  return { label: text, kind: "custom" };
}

/** A port by name, or the nearest Indian port to a named city ("Cochin Port" must not become Kochi city). */
async function resolvePort(text: string, messages: string[], label: string): Promise<Place> {
  if (!text) { messages.push(`${label} is missing.`); return { label, kind: "custom" }; }
  const port = await place(text, ["port"]);
  if (port) return port;
  const city = await place(text, ["city"]);
  if (city && hasCoords(city)) { const near = nearestIndianPort(city); messages.push(`“${text}” is not a port; used the nearest one, ${near.label}.`); return near; }
  messages.push(`${label} “${text}” is not a recognised port.`);
  return { label: text, kind: "custom" };
}

const PLACE_WORD: Partial<Record<PlaceKind, string>> = { station: "railway station", airport: "airport", port: "port", terminal: "waterway terminal" };

/** The nearest airport, port, station or waterway terminal to a city. */
async function nearestFor(kind: PlaceKind, city: Place & { lat: number; lon: number }): Promise<Place | undefined> {
  if (kind === "airport") return nearestAirport(city, (city.country ?? "IN") === "IN");
  if (kind === "port") return nearestIndianPort(city);
  if (kind === "terminal") return nearestTerminal(city);
  if (kind === "station") {
    const station = nearestStation(await loadStations(), city);
    return { label: `${station.name} (${station.code})`, kind: "station", code: station.code, lat: station.lat, lon: station.lon, state: station.state, country: "IN" };
  }
  return undefined;
}

/**
 * The place in a column. Airports, ports, stations and terminals must come from TEMT's lists: a city written in such a
 * column moves to its nearest one with a warning, and anything else is an error unless the row gives its own distance.
 */
async function resolveFor(text: string, kinds: PlaceKind[], column: string, errors: string[], messages: string[], ownDistance: boolean): Promise<Place> {
  if (!text) { errors.push(`${column} is missing.`); return { label: column, kind: "custom" }; }
  const found = await resolve(text, kinds, errors, column);
  if (found.kind !== "custom" || !kinds.every((kind) => TERMINAL_KINDS.includes(kind))) return found;
  const word = PLACE_WORD[kinds[0]!]!;
  const city = await place(text, ["city", "pin"]);
  const near = city && hasCoords(city) ? await nearestFor(kinds[0]!, city) : undefined;
  if (near) { messages.push(`“${text}” is not a ${word}; used the nearest one, ${near.label}.`); return near; }
  if (ownDistance) { messages.push(`“${text}” is not in TEMT's list of ${word}s; used the distance given.`); return found; }
  errors.push(`“${text}” is not a recognised ${word}. Use its name or code, or give the distance.`);
  return found;
}

/** Road legs in the multi-stop template may start or end at a station, port, airport or terminal named as such. */
function roadKinds(text: string): PlaceKind[] {
  const all: PlaceKind[] = ["city", "pin", "station", "port", "airport", "terminal"];
  const first: PlaceKind | undefined = /\b(station|rly|jn|junction)\b/i.test(text) ? "station" : /\bairport\b/i.test(text) ? "airport" : /\b(port|dock|nhava|jnpt)\b/i.test(text) ? "port" : /\b(terminal|ghat)\b/i.test(text) ? "terminal" : undefined;
  return first ? [first, ...all.filter((kind) => kind !== first)] : all;
}

/** The distance given in the file, else one calculated from the places (rail over the Indian Railways network). */
async function distanceFor(mode: TransportMode, from: Place, to: Place, given: number | undefined, messages: string[]): Promise<{ km: number; method: DistanceMethod } | undefined> {
  if (given !== undefined && !Number.isNaN(given) && given > 0) return { km: given, method: "user" };
  const estimate = mode === "rail" ? await measureDistance(mode, from, to) : estimateDistance(mode, from, to);
  if (estimate) { messages.push(`Distance calculated: ${Math.round(estimate.km).toLocaleString("en-IN")} km${estimate.method === "rail-network" ? " on the rail network" : estimate.method === "iww-network" ? " along the waterway" : estimate.method === "sea-route" ? " over sea lanes" : ""}.`); return { km: Math.round(estimate.km), method: estimate.method }; }
  return undefined;
}

interface Draft { line: number; ref: string; date?: string; businessUnit: string; commodity: string; origin: Place; destination: Place; direction: Direction; paidBy: PaidBy; notes?: string; legs: LegInput[]; legMeta: LegMeta[]; hubs: HubInput[]; kind: ShipmentRecord["kind"]; source: RecordSource; messages: string[]; errors: string[] }

/** Rows without a reference get today's next TEMT reference, so they never match or overwrite a saved shipment. */
function finish(draft: Draft, options: ImportOptions, newRef: () => string): ImportRow {
  const route = `${compactLabel(draft.origin) || draft.origin.label} → ${compactLabel(draft.destination) || draft.destination.label}`;
  const summary = { ref: draft.ref, refInFile: !!draft.ref, date: draft.date ?? "", route, mode: [...new Set(draft.legs.map((leg) => leg.mode))].join(" + "), tonnes: draft.legs[0]?.tonnes, km: draft.legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0) };
  if (!draft.date) draft.errors.push("Date is missing or not recognised. Use YYYY-MM-DD or DD/MM/YYYY.");
  if (draft.errors.length) return { line: draft.line, status: "error", messages: [...draft.errors, ...draft.messages], summary };
  try {
    const result = calculateShipment({ legs: draft.legs, hubs: draft.hubs }, options.factorSet);
    const ref = draft.ref || newRef();
    const record = buildRecord({ ref, date: draft.date, businessUnit: draft.businessUnit, commodity: draft.commodity, origin: draft.origin, destination: draft.destination, direction: draft.direction, paidBy: draft.paidBy, kind: draft.kind, legs: draft.legs, legMeta: draft.legMeta, hubs: draft.hubs, source: draft.source, notes: draft.notes });
    const warnings = draft.messages.filter((message) => !message.startsWith("Distance calculated"));
    return { line: draft.line, status: warnings.length ? "warning" : "ok", messages: draft.messages, record, summary: { ...summary, ref, kg: result.wtwKg } };
  } catch (error) {
    return { line: draft.line, status: "error", messages: [error instanceof Error ? error.message : "Could not calculate.", ...draft.messages], summary };
  }
}

async function temtRows(rows: Raw[], options: ImportOptions): Promise<ImportRow[]> {
  const newRef = refSequence();
  const lower = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [norm(key).replace(/ /g, "_"), value])));
  // Rows sharing a reference and carrying leg numbers form one multimodal shipment.
  const groups = new Map<string, { line: number; row: Raw }[]>();
  lower.forEach((row, index) => {
    const ref = str(row.reference) || `ROW-${index + 2}`;
    const key = str(row.leg_no) ? ref : `${ref}#${index}`;
    groups.set(key, [...(groups.get(key) ?? []), { line: index + 2, row }]);
  });
  const out: ImportRow[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (num(a.row.leg_no) ?? 0) - (num(b.row.leg_no) ?? 0));
    const first = group[0]!.row;
    const messages: string[] = [], errors: string[] = [];
    const legs: LegInput[] = [], legMeta: LegMeta[] = [];
    let origin: Place | undefined, destination: Place | undefined;
    for (const { line, row } of group) {
      const mode = MODE_ALIASES[str(row.mode).toLowerCase() || "road"];
      if (!mode) { errors.push(`Line ${line}: mode “${str(row.mode)}” is not recognised.`); continue; }
      const tonnes = num(row.tonnes) ?? options.defaultTonnes;
      if (!tonnes || Number.isNaN(tonnes) || tonnes <= 0) { errors.push(`Line ${line}: tonnes must be a positive number.`); continue; }
      const own = (num(row.distance_km) ?? 0) > 0 || ["fuel", "energy"].includes(str(row.method).toLowerCase());
      const from = await resolveFor(str(row.origin), mode === "road" ? roadKinds(str(row.origin)) : MODE_PLACE_KINDS[mode], `Line ${line}: origin`, errors, messages, own);
      const to = await resolveFor(str(row.destination), mode === "road" ? roadKinds(str(row.destination)) : MODE_PLACE_KINDS[mode], `Line ${line}: destination`, errors, messages, own);
      origin ??= from; destination = to;
      let dist = await distanceFor(mode, from, to, num(row.distance_km), messages);
      const method = str(row.method).toLowerCase();
      if (!dist && !["fuel", "energy"].includes(method)) { errors.push(`Line ${line}: no distance. Add distance_km or use recognisable places.`); continue; }
      const leg: LegInput = { mode, tonnes, distanceKm: dist?.km };
      if (mode === "road") {
        const vehicle = parseVehicle(str(row.vehicle_class), tonnes);
        if (vehicle.guessed && str(row.vehicle_class)) messages.push(`Line ${line}: truck “${str(row.vehicle_class)}” not recognised; used a class that fits ${tonnes} t.`);
        const fuel = (str(row.fuel).toLowerCase() || "diesel") as LegInput["fuel"];
        Object.assign(leg, { vehicleClass: vehicle.id, fuel: ["diesel", "cng", "petrol", "electric"].includes(fuel!) ? fuel : "diesel", refrigerated: /^(y|yes|true|1)$/i.test(str(row.refrigerated)) });
        if (method === "fuel") Object.assign(leg, { method: "fuel", fuelId: fuel === "cng" ? "cng" : fuel === "petrol" ? "petrol" : "diesel", fuelQuantity: num(row.fuel_quantity), fuelUnit: str(row.fuel_unit).toLowerCase() === "kg" || fuel === "cng" ? "kg" : "l" });
        if (method === "energy" || fuel === "electric") Object.assign(leg, { method: "energy", fuel: "electric", energyKwh: num(row.energy_kwh) });
      }
      if (mode === "air") Object.assign(leg, { airService: ["belly", "freighter"].includes(str(row.air_service).toLowerCase()) ? str(row.air_service).toLowerCase() : "unknown", airScope: from.country && to.country && (from.country !== "IN" || to.country !== "IN") ? "international" : "domestic" });
      if (mode === "sea") {
        const vesselText = str(row.vessel_type);
        if (vesselText) { const [category, size = ""] = vesselText.split(/[,|]/); const { vessel } = parseVessel(category!.trim(), size.trim()); if (vessel) Object.assign(leg, { seaBasis: "vessel", vesselId: vessel.id }); else messages.push(`Line ${line}: vessel “${vesselText}” not recognised; used a container trade lane.`); }
        if (!leg.vesselId) Object.assign(leg, { seaBasis: "lane", tradeLane: TRADE_LANES.find((lane) => lane.id === str(row.trade_lane))?.id ?? suggestTradeLane(from.country, to.country), containerType: str(row.container_type).toLowerCase() === "reefer" ? "reefer" : "dry", tonnesPerTeu: num(row.tonnes_per_teu) || 10 });
      }
      legs.push(leg);
      legMeta.push({ from, to, distanceMethod: dist?.method ?? "user" });
    }
    const paid = str(first.paid_by).toLowerCase();
    const direction = str(first.direction).toLowerCase();
    out.push(finish({
      line: group[0]!.line, ref: str(first.reference), date: parseDate(first.date), businessUnit: str(first.business_unit) || options.businessUnit, commodity: str(first.commodity) || "General cargo",
      origin: origin ?? { label: "Origin", kind: "custom" }, destination: destination ?? { label: "Destination", kind: "custom" },
      direction: (["inbound", "outbound", "inter-facility"].includes(direction) ? direction : options.direction) as Direction,
      paidBy: (paid.startsWith("cust") ? "customer" : paid.startsWith("own") ? "own-fleet" : paid ? "company" : options.paidBy ?? "company") as PaidBy,
      notes: str(first.notes) || undefined, legs, legMeta, hubs: [], kind: legs.length > 1 ? "chain" : "single", source: "import", messages, errors,
    }, options, newRef));
  }
  return out;
}

async function legacyRows(format: ImportFormat, rows: Raw[], options: ImportOptions): Promise<ImportRow[]> {
  const newRef = refSequence();
  const out: ImportRow[] = [];
  for (const [index, raw] of rows.entries()) {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [norm(key), value]));
    const line = index + 2;
    const messages: string[] = [], errors: string[] = [];
    const tonnes = num(row["load in mt"] ?? row["load"]);
    if (!tonnes || Number.isNaN(tonnes) || tonnes <= 0) errors.push("Load must be a positive number of tonnes.");
    const t = tonnes && tonnes > 0 ? tonnes : 1;
    const date = parseDate(row["start date"] ?? row["shipment start date"]);
    const legs: LegInput[] = [], legMeta: LegMeta[] = [], hubs: HubInput[] = [];
    let origin: Place, destination: Place, kind: ShipmentRecord["kind"] = "single";
    if (format === "legacy-road") {
      origin = await resolve(str(row["origin"]), ["city", "pin"], errors, "Origin");
      destination = await resolve(str(row["destination"]), ["city", "pin"], errors, "Destination");
      const dist = await distanceFor("road", origin, destination, undefined, messages);
      const vehicle = parseVehicle(str(row["vehicle category"]), t);
      if (!dist) errors.push("Could not place origin or destination to estimate the distance.");
      legs.push({ mode: "road", tonnes: t, distanceKm: dist?.km, vehicleClass: vehicle.id, fuel: (str(row["fuel"]).toLowerCase() || "diesel") as LegInput["fuel"] });
      legMeta.push({ from: origin, to: destination, distanceMethod: dist?.method ?? "user" });
    } else if (format === "legacy-rail") {
      origin = await resolveFor(str(row["origin station"]), MODE_PLACE_KINDS.rail, "Origin station", errors, messages, false);
      destination = await resolveFor(str(row["destination station"]), MODE_PLACE_KINDS.rail, "Destination station", errors, messages, false);
      const dist = await distanceFor("rail", origin, destination, undefined, messages);
      if (!dist) errors.push("Could not place the stations to estimate the distance.");
      legs.push({ mode: "rail", tonnes: t, distanceKm: dist?.km });
      legMeta.push({ from: origin, to: destination, distanceMethod: dist?.method ?? "user" });
    } else if (format === "legacy-air") {
      origin = await resolveFor(str(row["origin"]), MODE_PLACE_KINDS.air, "Origin airport", errors, messages, false);
      destination = await resolveFor(str(row["destination"]), MODE_PLACE_KINDS.air, "Destination airport", errors, messages, false);
      const dist = await distanceFor("air", origin, destination, undefined, messages);
      if (!dist) errors.push("Could not identify the airports.");
      legs.push({ mode: "air", tonnes: t, distanceKm: dist ? Math.round(dist.km) : undefined, airService: "unknown", airScope: origin.country && destination.country && (origin.country !== "IN" || destination.country !== "IN") ? "international" : "domestic" });
      legMeta.push({ from: origin, to: destination, distanceMethod: "great-circle" });
    } else if (format === "legacy-coastal" || format === "legacy-water") {
      origin = await resolvePort(str(row["origin port"]), errors, "Origin port");
      destination = await resolvePort(str(row["destination port"]), errors, "Destination port");
      const { vessel, remapped } = parseVessel(str(row["vessel category"]), str(row["vessel size"]));
      if (!vessel) errors.push(`Vessel “${str(row["vessel category"])} ${str(row["vessel size"])}” is not recognised.`);
      if (remapped) messages.push("Earlier TEMT versions labelled bulk-carrier size bands “Crude tanker”; mapped to Bulk carrier.");
      let km: number | undefined;
      const nm = num(row["distance in nautical miles"]);
      if (nm && !Number.isNaN(nm)) km = nm * 1.852;
      else if (origin.code && destination.code) km = seaRoute(origin.code, destination.code)?.km;
      if (!km) errors.push("Could not find the sea distance between these ports.");
      legs.push({ mode: "sea", tonnes: t, distanceKm: km ? Math.round(km) : undefined, seaBasis: "vessel", vesselId: vessel?.id, distanceBasis: nm ? "actual" : "shortest" });
      legMeta.push({ from: origin, to: destination, distanceMethod: nm ? "user" : "sea-route" });
    } else {
      kind = "courier";
      origin = await resolve(str(row["origin"]), ["city", "pin"], errors, "Origin");
      const hubA = await resolve(str(row["origin hub"]), ["city", "pin"], errors, "Origin hub");
      const hubB = await resolve(str(row["destination hub"]), ["city", "pin"], errors, "Destination hub");
      destination = await resolve(str(row["destination"]), ["city", "pin"], errors, "Destination");
      const parts: [Place, Place, string, string, "first" | "mid" | "last"][] = [[origin, hubA, "first mile vehicle", "first mile fuel", "first"], [hubA, hubB, "mid mile vehicle", "mid mile fuel", "mid"], [hubB, destination, "last mile vehicle", "last mile fuel", "last"]];
      for (const [a, b, vehicleKey, fuelKey, role] of parts) {
        const dist = await distanceFor("road", a, b, undefined, messages);
        if (!dist) errors.push(`Could not estimate the ${role}-mile distance.`);
        legs.push({ mode: "road", tonnes: t, distanceKm: dist?.km, vehicleClass: parseVehicle(str(row[vehicleKey]), t).id, fuel: (str(row[fuelKey]).toLowerCase() || "diesel") as LegInput["fuel"], courierLeg: role });
        legMeta.push({ from: a, to: b, distanceMethod: dist?.method ?? "user" });
      }
      hubs.push({ type: "transshipment", tonnes: t, label: `${hubA.label} hub` }, { type: "transshipment", tonnes: t, label: `${hubB.label} hub` });
    }
    out.push(finish({ line, ref: "", date, businessUnit: options.businessUnit, commodity: "General cargo", origin, destination, direction: options.direction, paidBy: options.paidBy ?? "company", legs, legMeta, hubs, kind, source: "legacy-temt", messages, errors }, options, newRef));
  }
  return out;
}

const UQC_TONNES: Record<string, number> = { KGS: 0.001, KG: 0.001, MTS: 1, TON: 1, TONNES: 1, QTL: 0.1, GMS: 0.000001, GRAMS: 0.000001 };
const EWB_MODE: Record<string, TransportMode> = { "1": "road", "2": "rail", "3": "air", "4": "sea" };

async function ewayRows(data: unknown, options: ImportOptions): Promise<ImportRow[]> {
  const newRef = refSequence();
  const list = Array.isArray(data) ? data : ((data as Raw)?.billLists ?? (data as Raw)?.ewayBills ?? (data as Raw)?.data) as unknown;
  if (!Array.isArray(list)) throw new Error("This JSON does not look like an e-way bill export (expected billLists).");
  const out: ImportRow[] = [];
  for (const [index, bill] of (list as Raw[]).entries()) {
    const messages: string[] = [], errors: string[] = [];
    const mode = EWB_MODE[str(bill.transMode)] ?? "road";
    const items = Array.isArray(bill.itemList) ? (bill.itemList as Raw[]) : [];
    let tonnes = 0, unknown = false;
    for (const item of items) { const factor = UQC_TONNES[str(item.qtyUnit).toUpperCase()]; const quantity = num(item.quantity); if (factor && quantity && !Number.isNaN(quantity)) tonnes += quantity * factor; else unknown = true; }
    if (!tonnes || unknown) {
      if (options.defaultTonnes) { if (!tonnes) tonnes = options.defaultTonnes; messages.push(`Weight ${tonnes === options.defaultTonnes ? "not declared; used" : "partly declared; kept"} ${tonnes} t.`); }
      else if (!tonnes) errors.push("Item quantities are not in mass units (KGS, QTL, MTS or TON). Set a default weight and re-read the file.");
    }
    const from = await resolve(str(bill.fromPincode) || str(bill.fromPlace), ["pin", "city"], errors, "From PIN");
    const to = await resolve(str(bill.toPincode) || str(bill.toPlace), ["pin", "city"], errors, "To PIN");
    const declared = num(bill.transDistance);
    const dist = await distanceFor(mode, from, to, declared && !Number.isNaN(declared) && declared > 0 ? declared : undefined, messages);
    if (!dist) errors.push("No transport distance declared and the PIN codes could not be placed.");
    const t = tonnes || 1;
    const leg: LegInput = { mode, tonnes: t, distanceKm: dist?.km };
    if (mode === "road") Object.assign(leg, { vehicleClass: vehicleForTonnes(t), fuel: "diesel" });
    if (mode === "sea") Object.assign(leg, { seaBasis: "lane", tradeLane: "intra-me-india", containerType: "dry", tonnesPerTeu: 10 });
    out.push(finish({ line: index + 1, ref: str(bill.ewbNo) || str(bill.docNo), date: parseDate(bill.docDate), businessUnit: options.businessUnit, commodity: str(items[0]?.productName) || "General cargo", origin: from, destination: to,
      direction: options.direction, paidBy: options.paidBy ?? "company", legs: [leg], legMeta: [{ from, to, distanceMethod: declared ? "user" : dist?.method ?? "user" }], hubs: [], kind: "single", source: "ewaybill", messages: declared ? [`Distance from e-way bill: ${declared} km.`, ...messages] : messages, errors }, options, newRef));
  }
  return out;
}

type ModeTemplate = Exclude<TemplateId, "temt">;
const REF_COLUMN: Record<ModeTemplate, string> = { road: "lr_number", courier: "awb_or_docket_number", rail: "rr_number", air: "awb_number", sea: "bl_number", iww: "consignment_number" };
const PLACE_COLUMNS: Record<ModeTemplate, [string, string]> = { road: ["origin", "destination"], courier: ["origin", "destination"], rail: ["from_station", "to_station"], air: ["from_airport", "to_airport"], sea: ["from_port", "to_port"], iww: ["from_terminal", "to_terminal"] };
const DEFAULT_UNIT: Record<ModeTemplate, "ton" | "kg"> = { road: "ton", courier: "kg", rail: "ton", air: "kg", sea: "ton", iww: "ton" };
const yes = (value: unknown) => /^(y|yes|true|1)$/i.test(str(value));
const unitOf = (value: string) => { const text = value.toLowerCase().replace(/[^a-z]/g, ""); return /^(l|ltr|ltrs|litre|litres|liter|liters)$/.test(text) ? "l" : /^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(text) ? "kg" : /^(t|ton|tons|tonne|tonnes|mt|mts)$/.test(text) ? "t" : /^kwh$/.test(text) ? "kWh" : text ? "?" : ""; };

/** Fuel-based leg fields from fuel_used, fuel and fuel_unit; undefined keeps the distance-based method. */
function fuelFields(mode: TransportMode, row: Raw, errors: string[]): Partial<LegInput> | undefined {
  const quantity = num(row.fuel_used);
  if (quantity === undefined) return undefined;
  if (Number.isNaN(quantity) || quantity <= 0) { errors.push("fuel_used must be a positive number."); return undefined; }
  const fuel = str(row.fuel).toLowerCase(), unit = unitOf(str(row.fuel_unit));
  if (unit === "?") { errors.push(`fuel_unit “${str(row.fuel_unit)}” is not recognised.`); return undefined; }
  if ((mode === "road" || mode === "rail") && (unit === "kWh" || fuel.startsWith("electric"))) return { method: "energy", energyKwh: quantity, ...(mode === "road" ? { fuel: "electric" as const } : {}) };
  const fuelId: FuelId | undefined = mode === "road" ? (fuel === "cng" ? "cng" : fuel === "petrol" ? "petrol" : "diesel") : mode === "rail" ? "diesel" : mode === "air" ? "jet" : mode === "sea" ? (fuel === "mgo" ? "mgo" : fuel === "lng" ? "lng-marine" : "vlsfo") : undefined;
  if (!fuelId) return undefined;
  const fallback = fuelId === "cng" ? "kg" : mode === "sea" ? "t" : "l";
  const used = unit || fallback;
  if (fuelId === "cng" && used === "l") { errors.push("CNG is measured in kg: set fuel_unit to kg."); return undefined; }
  if (used === "kWh") { errors.push("kWh applies to electricity only."); return undefined; }
  return { method: "fuel", fuelId, fuelQuantity: used === "t" ? quantity * 1000 : quantity, fuelUnit: used === "l" ? "l" : "kg" };
}

/** Rows of a per-mode template: one shipment per row (three legs and two hubs for courier). */
async function modeRows(id: ModeTemplate, rows: Raw[], options: ImportOptions): Promise<ImportRow[]> {
  const newRef = refSequence();
  const out: ImportRow[] = [];
  for (const [index, raw] of rows.entries()) {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [norm(key).replace(/ /g, "_"), value]));
    const line = index + 2;
    const messages: string[] = [], errors: string[] = [];
    // Weight in the row's unit (ton or kg).
    const weight = num(row.cargo_weight);
    const unit = unitOf(str(row.weight_unit)) || (DEFAULT_UNIT[id] === "kg" ? "kg" : "t");
    if (unit !== "kg" && unit !== "t") errors.push(`weight_unit “${str(row.weight_unit)}” should be ton or kg.`);
    let tonnes = weight === undefined ? options.defaultTonnes : unit === "kg" ? weight / 1000 : weight;
    if (!tonnes || Number.isNaN(tonnes) || tonnes <= 0) { errors.push("cargo_weight must be a positive number."); tonnes = 1; }
    const mode: TransportMode = id === "courier" ? "road" : id;
    const [fromColumn, toColumn] = PLACE_COLUMNS[id];
    const given = id === "sea" ? (num(row.distance_nm) ? num(row.distance_nm)! * 1.852 : undefined) : num(row.distance_km);
    const fuel = id === "courier" || id === "iww" ? undefined : fuelFields(mode, row, errors);
    const kinds = MODE_PLACE_KINDS[id];
    const origin = await resolveFor(str(row[fromColumn]), kinds, fromColumn, errors, messages, !!(given && given > 0) || !!fuel);
    const destination = await resolveFor(str(row[toColumn]), kinds, toColumn, errors, messages, !!(given && given > 0) || !!fuel);
    const legs: LegInput[] = [], legMeta: LegMeta[] = [], hubs: HubInput[] = [];
    let kind: ShipmentRecord["kind"] = "single";

    if (id === "courier") {
      kind = "courier";
      const hubA = str(row.origin_hub) ? await resolveFor(str(row.origin_hub), kinds, "origin_hub", errors, messages, false) : origin;
      const hubB = str(row.destination_hub) ? await resolveFor(str(row.destination_hub), kinds, "destination_hub", errors, messages, false) : destination;
      const haul = await distanceFor("road", hubA, hubB, num(row.line_haul_km), messages);
      if (!haul) errors.push("No line-haul distance: give line_haul_km, or places TEMT recognises.");
      const first = num(row.first_mile_km) || 25, last = num(row.last_mile_km) || 25;
      legs.push(
        { mode: "road", tonnes, distanceKm: first, vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "first" },
        { mode: "road", tonnes, distanceKm: haul?.km, vehicleClass: "gvw-20-30", fuel: "diesel", courierLeg: "mid" },
        { mode: "road", tonnes, distanceKm: last, vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "last" });
      legMeta.push({ from: origin, to: hubA, distanceMethod: "user" }, { from: hubA, to: hubB, distanceMethod: haul?.method ?? "user" }, { from: hubB, to: destination, distanceMethod: "user" });
      hubs.push({ type: "transshipment", tonnes, label: `${hubA.label} hub` }, { type: "transshipment", tonnes, label: `${hubB.label} hub` });
    } else {
      const dist = await distanceFor(mode, origin, destination, given, messages);
      if (!dist && !fuel) errors.push(`No distance: give ${id === "sea" ? "distance_nm" : "distance_km"}, or ${id === "road" ? "places" : `${PLACE_WORD[kinds[0]!]}s`} TEMT recognises.`);
      const leg: LegInput = { mode, tonnes, distanceKm: dist?.km ?? (fuel ? 0 : undefined), ...fuel };
      if (id === "road") {
        const vehicle = parseVehicle(str(row.truck_type), tonnes);
        if (vehicle.guessed && str(row.truck_type)) messages.push(`Truck “${str(row.truck_type)}” not recognised; used a class that fits ${fmtTonnes(tonnes)}.`);
        const fuelText = str(row.fuel).toLowerCase() || "diesel";
        if (!["diesel", "cng", "petrol", "electric", "electricity"].includes(fuelText)) messages.push(`Fuel “${str(row.fuel)}” not recognised; used diesel.`);
        Object.assign(leg, { vehicleClass: vehicle.id, refrigerated: yes(row.refrigerated) });
        if (!fuel) Object.assign(leg, fuelText.startsWith("electric") ? { fuel: "electric", method: "energy" } : { fuel: ["cng", "petrol"].includes(fuelText) ? fuelText : "diesel" });
        else if (!leg.fuel) leg.fuel = fuel.fuelId === "cng" ? "cng" : fuel.fuelId === "petrol" ? "petrol" : "diesel";
      }
      if (id === "air") {
        const aircraft = str(row.aircraft).toLowerCase();
        if (aircraft && !["unknown", "belly", "freighter"].includes(aircraft)) messages.push(`Aircraft “${str(row.aircraft)}” not recognised; used the average mix.`);
        Object.assign(leg, { airService: ["belly", "freighter"].includes(aircraft) ? aircraft : "unknown", airScope: origin.country && destination.country && (origin.country !== "IN" || destination.country !== "IN") ? "international" : "domestic" });
      }
      if (id === "sea") {
        Object.assign(leg, { distanceBasis: num(row.distance_nm) ? "actual" : "shortest" });
        if (str(row.shipped_as).toLowerCase().startsWith("v")) {
          const { vessel } = parseVessel(str(row.vessel_type), str(row.vessel_size));
          if (!vessel) errors.push(`Vessel “${[str(row.vessel_type), str(row.vessel_size)].filter(Boolean).join(", ")}” is not recognised. Use a type and size from the factor library.`);
          Object.assign(leg, { seaBasis: "vessel", vesselId: vessel?.id });
        } else {
          const laneText = str(row.trade_lane);
          const lane = TRADE_LANES.find((item) => item.id === laneText || item.label.toLowerCase() === laneText.toLowerCase());
          if (laneText && !lane) messages.push(`Trade lane “${laneText}” not recognised; used the lane suggested from the ports.`);
          Object.assign(leg, { seaBasis: "lane", tradeLane: lane?.id ?? suggestTradeLane(origin.country, destination.country), containerType: str(row.container_type).toLowerCase() === "reefer" ? "reefer" : "dry", tonnesPerTeu: num(row.cargo_per_teu) || 10 });
        }
      }
      if (id === "iww") {
        const text = str(row.vessel);
        const vessel = IWW_VESSELS.find((item) => item.id === text || item.label.toLowerCase().startsWith(text.toLowerCase()));
        if (text && !vessel) messages.push(`Vessel “${text}” not recognised; used ${IWW_VESSELS.find((item) => item.id === "mv-85-110")!.label}.`);
        leg.iwwVesselId = text && vessel ? vessel.id : "mv-85-110";
      }
      legs.push(leg);
      legMeta.push({ from: origin, to: destination, distanceMethod: dist?.method ?? "user" });
    }
    out.push(finish({ line, ref: str(row[REF_COLUMN[id]]), date: parseDate(row.dispatch_date), businessUnit: str(row.business_unit) || options.businessUnit, commodity: str(row.commodity) || "General cargo",
      origin, destination, direction: options.direction, paidBy: options.paidBy ?? "company", notes: str(row.notes) || undefined, legs, legMeta, hubs, kind, source: "import", messages, errors }, options, newRef));
  }
  return out;
}
const fmtTonnes = (tonnes: number) => `${Number(tonnes.toFixed(2))} t`;

async function readTable(file: File): Promise<Raw[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets.find((ws) => detectFormat((ws.getRow(1).values as unknown[]).slice(1).map(str))) ?? workbook.worksheets[0];
    if (!sheet) return [];
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(str);
    const rows: Raw[] = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const values = (row.values as unknown[]).slice(1);
      if (values.every((value) => !str(value))) return;
      rows.push(Object.fromEntries(headers.map((header, i) => [header, values[i]])));
    });
    return rows;
  }
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const parsed = Papa.parse<Raw>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  return parsed.data;
}

export const MAX_IMPORT_ROWS = 5000;

export async function parseImport(file: File, options: ImportOptions): Promise<{ format: ImportFormat; rows: ImportRow[] }> {
  if (/\.json$/i.test(file.name)) return { format: "ewaybill", rows: await ewayRows(JSON.parse(await file.text()), options) };
  if (/\.xls$/i.test(file.name)) throw new Error("Save the file as .xlsx or .csv; the older .xls format is not supported.");
  const table = await readTable(file);
  if (!table.length) throw new Error("The file has no data rows.");
  if (table.length > MAX_IMPORT_ROWS) throw new Error(`The file has ${table.length.toLocaleString("en-IN")} rows. Split it into files of up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows.`);
  const format = detectFormat(Object.keys(table[0]!));
  if (!format) throw new Error("Columns not recognised. Download the template for your transport mode, or use a bulk file from an earlier TEMT version.");
  const rows = format === "temt" ? await temtRows(table, options) : format.startsWith("legacy") ? await legacyRows(format, table, options) : await modeRows(format as ModeTemplate, table, options);
  return { format, rows };
}

const templateOf = (id: TemplateId) => IMPORT_TEMPLATES.find((item) => item.id === id)!;

export async function templateCsv(id: TemplateId = "temt") {
  const Papa = (await import("papaparse")).default;
  const template = templateOf(id);
  const keys = template.columns.map((column) => column.key);
  return "\ufeff" + Papa.unparse({ fields: keys, data: template.examples.map((row) => keys.map((key) => row[key] ?? "")) });
}

/** An Excel template: the sheet to fill (essential columns highlighted, drop-down lists where values are fixed) and instructions. */
export async function templateXlsx(id: TemplateId = "temt") {
  const ExcelJS = (await import("exceljs")).default;
  const template = templateOf(id);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shipments");
  sheet.columns = template.columns.map((column) => ({ header: column.key, key: column.key, width: Math.max(14, column.key.length + 4) }));
  template.examples.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).eachCell((cell, at) => {
    const column = template.columns[at - 1]!;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.required ? "FFB12322" : "FF57534E" } };
    cell.note = column.help;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // Fixed values come from a hidden sheet, so long lists such as trade lanes still work as drop-downs.
  const lists = workbook.addWorksheet("Lists", { state: "veryHidden" });
  let listColumn = 0;
  template.columns.forEach((column, at) => {
    if (!column.options) return;
    listColumn += 1;
    lists.getCell(1, listColumn).value = `${column.key}_options`;
    column.options.forEach((option, i) => { lists.getCell(i + 2, listColumn).value = option; });
    const letter = lists.getColumn(listColumn).letter;
    for (let row = 2; row <= 1000; row += 1) sheet.getCell(row, at + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$${letter}$2:$${letter}$${column.options.length + 1}`] };
  });
  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ width: 24 }, { width: 12 }, { width: 110 }];
  help.addRow([`${template.label}: one row per ${id === "temt" ? "leg" : "shipment"}. Red columns are essential; distances are optional because TEMT calculates them.`]).font = { bold: true };
  help.addRow([]);
  const header = help.addRow(["Column", "Essential", "How to fill it"]);
  header.font = { bold: true };
  for (const column of template.columns) {
    const row = help.addRow([column.key, column.required ? "Yes" : "", column.options && column.options.length <= 12 ? `${column.help} Values: ${column.options.join(", ")}.` : column.help]);
    row.alignment = { wrapText: true, vertical: "top" };
  }
  return workbook.xlsx.writeBuffer();
}
