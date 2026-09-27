import { calculateShipment, seaRoute, type FactorSetId, type HubInput, type LegInput, type RoadClassId, type ShipmentInput, type ShipmentResult } from "@temt/calculator";
import { estimateDistance, hasCoords, nearestAirport, nearestIndianPort, type Place } from "./places";
import { getState } from "./store";
import { todayIso, uid } from "./format";
import type { Direction, LegMeta, PaidBy, RecordKind, RecordSource, ShipmentRecord } from "./records";

/** The smallest standard truck class whose payload fits the cargo. */
export function vehicleForTonnes(tonnes: number): RoadClassId {
  if (tonnes <= 2) return "gvw-3.5";
  if (tonnes <= 3.5) return "gvw-3-5";
  if (tonnes <= 8) return "gvw-5-12";
  if (tonnes <= 12) return "gvw-12-20";
  if (tonnes <= 20) return "gvw-20-30";
  if (tonnes <= 40) return "gvw-30-50";
  return "trailer-30-60";
}

export function nextRef(prefix = "TEMT") {
  const date = todayIso().replace(/-/g, "").slice(2);
  const count = getState().shipments.filter((item) => item.ref.startsWith(`${prefix}-${date}`)).length + 1;
  return `${prefix}-${date}-${String(count).padStart(3, "0")}`;
}

export function buildRecord(opts: {
  ref?: string; date?: string; businessUnit?: string; commodity?: string; origin: Place; destination: Place; direction?: Direction; paidBy?: PaidBy;
  kind: RecordKind; legs: LegInput[]; legMeta: LegMeta[]; hubs?: HubInput[]; source: RecordSource; notes?: string;
}): ShipmentRecord {
  const now = new Date().toISOString();
  const settings = getState().settings;
  return {
    id: uid("s"), ref: opts.ref || nextRef(), date: opts.date || todayIso(), businessUnit: opts.businessUnit || settings.businessUnits[0] || "Operations", commodity: opts.commodity || "General cargo",
    origin: opts.origin, destination: opts.destination, direction: opts.direction ?? "outbound", paidBy: opts.paidBy ?? "company", kind: opts.kind,
    input: { legs: opts.legs, hubs: opts.hubs ?? [] }, legMeta: opts.legMeta, source: opts.source, notes: opts.notes, createdAt: now, updatedAt: now,
  };
}

export interface Alternative {
  id: "road" | "rail" | "air" | "sea";
  label: string;
  summary: string;
  input: ShipmentInput;
  legMeta: LegMeta[];
  result: ShipmentResult;
  practical: boolean;
  notes: string[];
}

const round = (value: number) => Math.max(1, Math.round(value));

/** Door-to-door options for one origin–destination pair, each calculated with the active factor set. */
export async function buildAlternatives(from: Place, to: Place, tonnes: number, factorSet: FactorSetId, opts: { vehicleClass?: RoadClassId; refrigerated?: boolean; drayageKm?: number } = {}): Promise<Alternative[]> {
  if (!hasCoords(from) || !hasCoords(to)) throw new Error("Choose origin and destination from the suggestions so TEMT knows where they are.");
  const vehicleClass = opts.vehicleClass ?? vehicleForTonnes(tonnes);
  const drayage = opts.drayageKm ?? 30;
  const truck = (distanceKm: number, cls: RoadClassId = vehicleClass): LegInput => ({ mode: "road", tonnes, distanceKm: round(distanceKm), vehicleClass: cls, fuel: "diesel", refrigerated: opts.refrigerated });
  const collection = (distanceKm: number) => truck(distanceKm, vehicleForTonnes(Math.min(tonnes, 12)));
  const containers = Math.max(1, Math.ceil(tonnes / 20));
  const out: Alternative[] = [];

  const road = estimateDistance("road", from, to)!;
  const roadInput: ShipmentInput = { legs: [truck(road.km)], hubs: [] };
  out.push({ id: "road", label: "Road, direct", summary: `${round(road.km).toLocaleString("en-IN")} km by truck`, input: roadInput, legMeta: [{ from, to, distanceMethod: road.method }], result: calculateShipment(roadInput, factorSet), practical: true, notes: [road.note] });

  const rail = estimateDistance("rail", from, to)!;
  if (rail.km >= 150) {
    const input: ShipmentInput = { legs: [collection(drayage), { mode: "rail", tonnes, distanceKm: round(rail.km) }, collection(drayage)], hubs: [{ type: "container-terminal", containers, label: "Origin rail terminal" }, { type: "container-terminal", containers, label: "Destination rail terminal" }] };
    out.push({ id: "rail", label: "Rail with road drayage", summary: `${drayage} km truck · ${round(rail.km).toLocaleString("en-IN")} km rail · ${drayage} km truck`, input,
      legMeta: [{ from, distanceMethod: "user" }, { distanceMethod: rail.method }, { to, distanceMethod: "user" }], result: calculateShipment(input, factorSet), practical: true,
      notes: [`Assumes rail terminals within ${drayage} km of each end and ${containers} container${containers > 1 ? "s" : ""} handled at each terminal.`, rail.note] });
  }

  const [airA, airB] = await Promise.all([nearestAirport(from), nearestAirport(to)]);
  if (airA.code !== airB.code) {
    const first = estimateDistance("road", from, airA)!, air = estimateDistance("air", airA, airB)!, last = estimateDistance("road", airB, to)!;
    const input: ShipmentInput = { legs: [collection(first.km), { mode: "air", tonnes, distanceKm: round(air.km), airService: "unknown", airScope: "domestic" }, collection(last.km)], hubs: [] };
    out.push({ id: "air", label: "Air via nearest airports", summary: `${airA.code} → ${airB.code}, ${round(air.km).toLocaleString("en-IN")} km flight`, input,
      legMeta: [{ from, to: airA, distanceMethod: first.method }, { from: airA, to: airB, distanceMethod: air.method }, { from: airB, to, distanceMethod: last.method }], result: calculateShipment(input, factorSet), practical: true,
      notes: ["Air suits urgent, high-value or perishable cargo; the airport legs are collected by a smaller truck."] });
  }

  const [portA, portB] = [nearestIndianPort(from), nearestIndianPort(to)];
  const sea = portA.code && portB.code ? seaRoute(portA.code, portB.code) : undefined;
  if (sea) {
    const first = estimateDistance("road", from, portA)!, last = estimateDistance("road", portB, to)!;
    const input: ShipmentInput = { legs: [truck(first.km), { mode: "sea", tonnes, distanceKm: round(sea.km), seaBasis: "lane", tradeLane: "intra-me-india", containerType: opts.refrigerated ? "reefer" : "dry", tonnesPerTeu: 10 }, truck(last.km)], hubs: [{ type: "container-terminal", containers, label: portA.label }, { type: "container-terminal", containers, label: portB.label }] };
    const roadShare = (first.km + last.km) / (first.km + last.km + sea.km);
    // Coastal shipping only makes sense when both port legs are short and the voyage isn't a long detour.
    const practical = roadShare < 0.45 && sea.km < road.km * 2.5 && first.km <= 400 && last.km <= 400;
    out.push({ id: "sea", label: "Coastal shipping", summary: `${portA.label} → ${portB.label}, ${Math.round(sea.nauticalMiles).toLocaleString("en-IN")} nm`, input,
      legMeta: [{ from, to: portA, distanceMethod: first.method }, { from: portA, to: portB, distanceMethod: "sea-route" }, { from: portB, to, distanceMethod: last.method }], result: calculateShipment(input, factorSet),
      practical, notes: [practical ? "Container via coastal ports with truck legs to and from the ports." : "Not practical for this pair: a port leg exceeds 400 km or the sea route is a long detour compared with direct road."] });
  }
  return out.sort((a, b) => Number(b.practical) - Number(a.practical) || a.result.wtwKg - b.result.wtwKg);
}
