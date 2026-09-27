import { calculateShipment, seaRoute, VESSELS, type FactorSetId, type HubInput, type LegInput, type RoadClassId, type TransportMode } from "@temt/calculator";
import { buildRecord, vehicleForTonnes } from "./builders";
import { estimateDistance, hasCoords, nearestIndianPort, resolvePlace, type Place, type PlaceKind } from "./places";
import type { Direction, LegMeta, PaidBy, RecordSource, ShipmentRecord } from "./records";

export type ImportFormat = "temt" | "legacy-road" | "legacy-rail" | "legacy-air" | "legacy-coastal" | "legacy-water" | "legacy-courier" | "ewaybill";

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  temt: "TEMT template", "legacy-road": "Production TEMT · Point to point", "legacy-rail": "Production TEMT · Railway", "legacy-air": "Production TEMT · Air",
  "legacy-coastal": "Production TEMT · Coastal", "legacy-water": "Production TEMT · International water", "legacy-courier": "Production TEMT · Courier / PTL", ewaybill: "E-way bill JSON",
};

export const TEMT_COLUMNS = ["reference", "leg_no", "date", "business_unit", "commodity", "origin", "destination", "mode", "tonnes", "distance_km", "vehicle_class", "fuel", "refrigerated", "method", "fuel_quantity", "fuel_unit", "energy_kwh", "air_service", "trade_lane", "container_type", "tonnes_per_teu", "vessel_type", "direction", "paid_by", "notes"] as const;

export const TEMPLATE_EXAMPLES: Record<string, string | number>[] = [
  { reference: "LR-2026-0001", leg_no: 1, date: "2026-04-03", business_unit: "Foods", commodity: "Packaged foods", origin: "Silvassa", destination: "Delhi", mode: "road", tonnes: 22, distance_km: "", vehicle_class: "32 ft", fuel: "diesel", refrigerated: "no", direction: "inter-facility", paid_by: "company" },
  { reference: "LR-2026-0002", leg_no: 1, date: "2026-04-05", business_unit: "Home Care", commodity: "Detergents", origin: "421302", destination: "560001", mode: "road", tonnes: 8.5, distance_km: 985, vehicle_class: "gvw-12-20", fuel: "cng", direction: "outbound", paid_by: "customer" },
  { reference: "RR-2026-0007", leg_no: 1, date: "2026-04-09", business_unit: "Foods", origin: "Hosur", destination: "Hosur rail terminal", mode: "road", tonnes: 40, distance_km: 28, vehicle_class: "trailer", direction: "inter-facility", paid_by: "company" },
  { reference: "RR-2026-0007", leg_no: 2, date: "2026-04-09", business_unit: "Foods", origin: "Hosur", destination: "Guwahati", mode: "rail", tonnes: 40, distance_km: "", direction: "inter-facility", paid_by: "company" },
  { reference: "AWB-7781", leg_no: 1, date: "2026-04-12", business_unit: "Personal Care", origin: "DEL", destination: "BLR", mode: "air", tonnes: 0.8, air_service: "belly", direction: "outbound", paid_by: "company" },
  { reference: "BL-5521", leg_no: 1, date: "2026-04-15", business_unit: "Exports", origin: "Jawaharlal Nehru Port", destination: "Rotterdam", mode: "sea", tonnes: 60, trade_lane: "europe-me-india", container_type: "dry", tonnes_per_teu: 10, direction: "outbound", paid_by: "company" },
  { reference: "OWN-TRK-19", leg_no: 1, date: "2026-04-18", business_unit: "Foods", origin: "Pune", destination: "Nashik", mode: "road", tonnes: 12, distance_km: 212, method: "fuel", fuel_quantity: 58, fuel_unit: "l", fuel: "diesel", direction: "inter-facility", paid_by: "own-fleet", notes: "Own truck, fuel card" },
];

export interface ImportRow {
  line: number;
  status: "ok" | "warning" | "error";
  messages: string[];
  record?: ShipmentRecord;
  summary: { ref: string; date: string; route: string; mode: string; tonnes?: number; km?: number; kg?: number };
}

export interface ImportOptions {
  businessUnit: string;
  paidBy: PaidBy;
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

/** Map truck descriptions, class ids or production TEMT labels to a class. */
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

/** Production TEMT used "Crude tanker" for the bulk-carrier size bands; map categories to the GLEC names. */
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

function distanceFor(mode: TransportMode, from: Place, to: Place, given: number | undefined, messages: string[]) {
  if (given !== undefined && !Number.isNaN(given) && given > 0) return { km: given, method: "user" as const };
  const estimate = estimateDistance(mode, from, to);
  if (estimate) { messages.push(`Distance estimated: ${Math.round(estimate.km).toLocaleString("en-IN")} km.`); return { km: Math.round(estimate.km), method: estimate.method }; }
  return undefined;
}

interface Draft { line: number; ref: string; date?: string; businessUnit: string; commodity: string; origin: Place; destination: Place; direction: Direction; paidBy: PaidBy; notes?: string; legs: LegInput[]; legMeta: LegMeta[]; hubs: HubInput[]; kind: ShipmentRecord["kind"]; source: RecordSource; messages: string[]; errors: string[] }

function finish(draft: Draft, options: ImportOptions): ImportRow {
  const route = `${draft.origin.label} → ${draft.destination.label}`;
  const summary = { ref: draft.ref, date: draft.date ?? "", route, mode: [...new Set(draft.legs.map((leg) => leg.mode))].join(" + "), tonnes: draft.legs[0]?.tonnes, km: draft.legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0) };
  if (!draft.date) draft.errors.push("Date is missing or not recognised. Use YYYY-MM-DD or DD/MM/YYYY.");
  if (draft.errors.length) return { line: draft.line, status: "error", messages: [...draft.errors, ...draft.messages], summary };
  try {
    const result = calculateShipment({ legs: draft.legs, hubs: draft.hubs }, options.factorSet);
    const record = buildRecord({ ref: draft.ref, date: draft.date, businessUnit: draft.businessUnit, commodity: draft.commodity, origin: draft.origin, destination: draft.destination, direction: draft.direction, paidBy: draft.paidBy, kind: draft.kind, legs: draft.legs, legMeta: draft.legMeta, hubs: draft.hubs, source: draft.source, notes: draft.notes });
    const warnings = draft.messages.filter((message) => !message.startsWith("Distance estimated"));
    return { line: draft.line, status: warnings.length ? "warning" : "ok", messages: draft.messages, record, summary: { ...summary, kg: result.wtwKg } };
  } catch (error) {
    return { line: draft.line, status: "error", messages: [error instanceof Error ? error.message : "Could not calculate.", ...draft.messages], summary };
  }
}

async function temtRows(rows: Raw[], options: ImportOptions): Promise<ImportRow[]> {
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
      const kinds: PlaceKind[] = mode === "air" ? ["airport", "city", "pin"] : mode === "sea" ? ["port", "city", "pin"] : ["city", "pin"];
      const from = await resolve(str(row.origin), kinds, errors, `Line ${line}: origin`);
      const to = await resolve(str(row.destination), kinds, errors, `Line ${line}: destination`);
      origin ??= from; destination = to;
      let dist = distanceFor(mode, from, to, num(row.distance_km), messages);
      if (mode === "sea" && !num(row.distance_km)) {
        const a = from.kind === "port" ? from : hasCoords(from) ? nearestIndianPort(from) : undefined, b = to.kind === "port" ? to : hasCoords(to) ? nearestIndianPort(to) : undefined;
        const route = a?.code && b?.code ? seaRoute(a.code, b.code) : undefined;
        if (route) dist = { km: Math.round(route.km), method: "sea-route" };
      }
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
        if (!leg.vesselId) Object.assign(leg, { seaBasis: "lane", tradeLane: str(row.trade_lane) || (to.country && to.country !== "IN" ? "industry-average" : "intra-me-india"), containerType: str(row.container_type).toLowerCase() === "reefer" ? "reefer" : "dry", tonnesPerTeu: num(row.tonnes_per_teu) || 10 });
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
      paidBy: (paid.startsWith("cust") ? "customer" : paid.startsWith("own") ? "own-fleet" : paid ? "company" : options.paidBy) as PaidBy,
      notes: str(first.notes) || undefined, legs, legMeta, hubs: [], kind: legs.length > 1 ? "chain" : "single", source: "import", messages, errors,
    }, options));
  }
  return out;
}

async function legacyRows(format: ImportFormat, rows: Raw[], options: ImportOptions): Promise<ImportRow[]> {
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
      const dist = distanceFor("road", origin, destination, undefined, messages);
      const vehicle = parseVehicle(str(row["vehicle category"]), t);
      if (!dist) errors.push("Could not place origin or destination to estimate the distance.");
      legs.push({ mode: "road", tonnes: t, distanceKm: dist?.km, vehicleClass: vehicle.id, fuel: (str(row["fuel"]).toLowerCase() || "diesel") as LegInput["fuel"] });
      legMeta.push({ from: origin, to: destination, distanceMethod: dist?.method ?? "user" });
    } else if (format === "legacy-rail") {
      origin = await resolve(str(row["origin station"]), ["city", "pin"], errors, "Origin station");
      destination = await resolve(str(row["destination station"]), ["city", "pin"], errors, "Destination station");
      const dist = distanceFor("rail", origin, destination, undefined, messages);
      if (!dist) errors.push("Could not place the stations to estimate the distance.");
      legs.push({ mode: "rail", tonnes: t, distanceKm: dist?.km });
      legMeta.push({ from: origin, to: destination, distanceMethod: dist?.method ?? "user" });
    } else if (format === "legacy-air") {
      origin = await resolve(str(row["origin"]), ["airport", "city"], errors, "Origin airport");
      destination = await resolve(str(row["destination"]), ["airport", "city"], errors, "Destination airport");
      const dist = distanceFor("air", origin, destination, undefined, messages);
      if (!dist) errors.push("Could not identify the airports.");
      legs.push({ mode: "air", tonnes: t, distanceKm: dist ? Math.round(dist.km) : undefined, airService: "unknown", airScope: origin.country && destination.country && (origin.country !== "IN" || destination.country !== "IN") ? "international" : "domestic" });
      legMeta.push({ from: origin, to: destination, distanceMethod: "great-circle" });
    } else if (format === "legacy-coastal" || format === "legacy-water") {
      origin = await resolve(str(row["origin port"]), ["port", "city"], errors, "Origin port");
      destination = await resolve(str(row["destination port"]), ["port", "city"], errors, "Destination port");
      const { vessel, remapped } = parseVessel(str(row["vessel category"]), str(row["vessel size"]));
      if (!vessel) errors.push(`Vessel “${str(row["vessel category"])} ${str(row["vessel size"])}” is not recognised.`);
      if (remapped) messages.push("Production TEMT's “Crude tanker” size bands correspond to bulk carriers; mapped to Bulk carrier.");
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
        const dist = distanceFor("road", a, b, undefined, messages);
        if (!dist) errors.push(`Could not estimate the ${role}-mile distance.`);
        legs.push({ mode: "road", tonnes: t, distanceKm: dist?.km, vehicleClass: parseVehicle(str(row[vehicleKey]), t).id, fuel: (str(row[fuelKey]).toLowerCase() || "diesel") as LegInput["fuel"], courierLeg: role });
        legMeta.push({ from: a, to: b, distanceMethod: dist?.method ?? "user" });
      }
      hubs.push({ type: "transshipment", tonnes: t, label: `${hubA.label} hub` }, { type: "transshipment", tonnes: t, label: `${hubB.label} hub` });
    }
    out.push(finish({ line, ref: `TEMT-IMPORT-${line}`, date, businessUnit: options.businessUnit, commodity: "General cargo", origin, destination, direction: options.direction, paidBy: options.paidBy, legs, legMeta, hubs, kind, source: "legacy-temt", messages, errors }, options));
  }
  return out;
}

const UQC_TONNES: Record<string, number> = { KGS: 0.001, KG: 0.001, MTS: 1, TON: 1, TONNES: 1, QTL: 0.1, GMS: 0.000001, GRAMS: 0.000001 };
const EWB_MODE: Record<string, TransportMode> = { "1": "road", "2": "rail", "3": "air", "4": "sea" };

async function ewayRows(data: unknown, options: ImportOptions): Promise<ImportRow[]> {
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
    const dist = distanceFor(mode, from, to, declared && !Number.isNaN(declared) && declared > 0 ? declared : undefined, messages);
    if (!dist) errors.push("No transport distance declared and the PIN codes could not be placed.");
    const t = tonnes || 1;
    const leg: LegInput = { mode, tonnes: t, distanceKm: dist?.km };
    if (mode === "road") Object.assign(leg, { vehicleClass: vehicleForTonnes(t), fuel: "diesel" });
    if (mode === "sea") Object.assign(leg, { seaBasis: "lane", tradeLane: "intra-me-india", containerType: "dry", tonnesPerTeu: 10 });
    out.push(finish({ line: index + 1, ref: str(bill.ewbNo) || str(bill.docNo) || `EWB-${index + 1}`, date: parseDate(bill.docDate), businessUnit: options.businessUnit, commodity: str(items[0]?.productName) || "General cargo", origin: from, destination: to,
      direction: options.direction, paidBy: options.paidBy, legs: [leg], legMeta: [{ from, to, distanceMethod: declared ? "user" : dist?.method ?? "user" }], hubs: [], kind: "single", source: "ewaybill", messages: declared ? [`Distance from e-way bill: ${declared} km.`, ...messages] : messages, errors }, options));
  }
  return out;
}

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
  if (!format) throw new Error("Columns not recognised. Use the TEMT template or a production TEMT bulk template.");
  return { format, rows: format === "temt" ? await temtRows(table, options) : await legacyRows(format, table, options) };
}

export async function templateCsv() {
  const Papa = (await import("papaparse")).default;
  return "﻿" + Papa.unparse({ fields: [...TEMT_COLUMNS], data: TEMPLATE_EXAMPLES.map((row) => TEMT_COLUMNS.map((column) => row[column] ?? "")) });
}

export async function templateXlsx() {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shipments");
  sheet.columns = TEMT_COLUMNS.map((column) => ({ header: column, key: column, width: Math.max(14, column.length + 4) }));
  TEMPLATE_EXAMPLES.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB12322" } }; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const list = (values: string[]) => ({ type: "list" as const, allowBlank: true, formulae: [`"${values.join(",")}"`] });
  for (let row = 2; row <= 1000; row += 1) {
    sheet.getCell(row, 8).dataValidation = list(["road", "rail", "air", "sea", "iww"]);
    sheet.getCell(row, 12).dataValidation = list(["diesel", "cng", "petrol", "electric"]);
    sheet.getCell(row, 14).dataValidation = list(["distance", "fuel", "energy"]);
    sheet.getCell(row, 23).dataValidation = list(["inbound", "outbound", "inter-facility"]);
    sheet.getCell(row, 24).dataValidation = list(["company", "customer", "own-fleet"]);
  }
  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ width: 22 }, { width: 110 }];
  [["Column", "How to fill it"], ["reference", "Your LR, invoice, AWB, B/L or e-way bill number. Rows with the same reference and a leg_no form one multimodal shipment."], ["leg_no", "1, 2, 3… for multimodal shipments; leave 1 for single-leg rows."], ["date", "Dispatch date, YYYY-MM-DD or DD/MM/YYYY."], ["origin / destination", "City (Bombay and Bangalore work), 6-digit PIN code, airport code (DEL) or port name."], ["mode", "road, rail, air, sea or iww."], ["tonnes", "Cargo weight in tonnes."], ["distance_km", "Optional. Leave blank and TEMT estimates it from the places."], ["vehicle_class", "Optional for road: 32 ft, 24 ft, 19 ft, 14 ft, LCV, trailer, or a GVW range. Blank chooses a truck that fits the cargo."], ["fuel", "diesel, cng, petrol or electric."], ["method", "distance (default), fuel (fill fuel_quantity and fuel_unit) or energy (fill energy_kwh)."], ["air_service", "unknown, belly or freighter."], ["trade_lane / container_type / tonnes_per_teu", "Sea container options; or give vessel_type as “Bulk carrier, 35000-59999 dwt”."], ["paid_by", "company (Scope 3 Cat 4), customer (Scope 3 Cat 9) or own-fleet (Scope 1/2)."]]
    .forEach((row, index) => { const r = help.addRow(row); if (index === 0) r.font = { bold: true }; r.alignment = { wrapText: true, vertical: "top" }; });
  return workbook.xlsx.writeBuffer();
}
