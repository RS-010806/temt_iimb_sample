import { calculateShipment, CalculationError, MODE_LABELS, ROAD_CLASSES, type DistanceMethod, type FactorSetId, type ShipmentInput, type ShipmentResult, type TransportMode } from "@temt/calculator";
import type { Place } from "./places";

export type Direction = "inbound" | "outbound" | "inter-facility";
/** Who operates or pays for the transport decides the GHG Protocol scope. */
export type PaidBy = "company" | "customer" | "own-fleet";
export type RecordKind = "single" | "courier" | "chain";
export type RecordSource = "manual" | "import" | "chain" | "compare" | "copilot" | "sample" | "ewaybill" | "legacy-temt";

export interface LegMeta {
  from?: Place;
  to?: Place;
  distanceMethod: DistanceMethod;
  carrier?: string;
}

/** ISO 14083 asks reports to state the distance type used: shortest feasible (SFD) or great-circle (GCD). */
export function distanceType(method: DistanceMethod | undefined, mode: TransportMode): string {
  if (method === "user") return "Actual (supplied)";
  if (method === "great-circle" || method === "air-gcd-95" || (!method && mode === "air")) return "GCD";
  return "SFD (estimated)";
}

export interface ShipmentRecord {
  id: string;
  ref: string;
  date: string;
  businessUnit: string;
  commodity: string;
  origin: Place;
  destination: Place;
  direction: Direction;
  paidBy: PaidBy;
  kind: RecordKind;
  input: ShipmentInput;
  legMeta: LegMeta[];
  source: RecordSource;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComputedShipment extends ShipmentRecord {
  result: ShipmentResult | null;
  error?: string;
}

export function compute(record: ShipmentRecord, factorSet: FactorSetId): ComputedShipment {
  try {
    return { ...record, result: calculateShipment(record.input, factorSet) };
  } catch (error) {
    return { ...record, result: null, error: error instanceof CalculationError || error instanceof Error ? error.message : "Calculation failed." };
  }
}

export type ScopeKey = "scope1" | "scope2" | "cat4" | "cat9";
export const SCOPE_LABELS: Record<ScopeKey, { short: string; long: string; description: string }> = {
  scope1: { short: "Scope 1", long: "Scope 1 · Mobile combustion", description: "Fuel burned in vehicles your company owns or controls." },
  scope2: { short: "Scope 2", long: "Scope 2 · Purchased electricity", description: "Electricity bought to charge vehicles your company owns or controls." },
  cat4: { short: "Scope 3 · Cat 4", long: "Scope 3 · Category 4 · Upstream transportation and distribution", description: "Transport services your company buys: inbound, outbound and between your own sites." },
  cat9: { short: "Scope 3 · Cat 9", long: "Scope 3 · Category 9 · Downstream transportation and distribution", description: "Transport of sold products that your customer pays for." },
};

/** GHG Protocol classification for one leg of a record. */
export function scopeOf(record: Pick<ShipmentRecord, "paidBy">, legMethod?: string): ScopeKey {
  if (record.paidBy === "own-fleet") return legMethod === "energy" ? "scope2" : "scope1";
  return record.paidBy === "customer" ? "cat9" : "cat4";
}

export const MODE_COLORS: Record<TransportMode | "hub", string> = {
  road: "var(--mode-road)", rail: "var(--mode-rail)", air: "var(--mode-air)", sea: "var(--mode-sea)", iww: "var(--mode-iww)", hub: "var(--stage-hub)",
};
/** Hex copies of the mode colours for canvas, PDF and spreadsheet output. */
export const MODE_HEX: Record<TransportMode | "hub", string> = { road: "#b12322", rail: "#2a72c4", air: "#bb7a08", sea: "#0e9a88", iww: "#7048b0", hub: "#5b6770" };
export const MODE_ORDER: TransportMode[] = ["road", "rail", "air", "sea", "iww"];
export { MODE_LABELS };

export const DIRECTION_LABELS: Record<Direction, string> = { inbound: "Inbound (from suppliers)", outbound: "Outbound (to customers)", "inter-facility": "Between own sites" };
export const PAID_BY_LABELS: Record<PaidBy, string> = { company: "Our company buys the transport", customer: "Customer pays for transport", "own-fleet": "Our own fleet" };

export function describeLeg(record: ShipmentRecord, index: number) {
  const leg = record.input.legs[index]!;
  const meta = record.legMeta[index];
  const vehicle = leg.mode === "road" ? ROAD_CLASSES.find((item) => item.id === (leg.vehicleClass ?? "gvw-12-20")) : undefined;
  return {
    route: `${meta?.from?.label ?? (index === 0 ? record.origin.label : "Transfer point")} → ${meta?.to?.label ?? (index === record.input.legs.length - 1 ? record.destination.label : "Transfer point")}`,
    mode: MODE_LABELS[leg.mode],
    detail: leg.mode === "road" ? `${vehicle?.label ?? "Truck"} · ${leg.fuel === "cng" ? "CNG" : leg.fuel ?? "diesel"}${leg.refrigerated ? " · refrigerated" : ""}` : leg.mode === "air" ? `${leg.airService ?? "unknown"} aircraft` : leg.mode === "sea" ? (leg.seaBasis === "vessel" ? "Vessel" : `Container, ${leg.containerType ?? "dry"}`) : "",
  };
}

export function laneKey(record: ShipmentRecord) {
  const clean = (place: Place) => place.label.replace(/^\d{6} · /, "").replace(/ \([A-Z]{3}\)$/, "");
  return `${clean(record.origin)} → ${clean(record.destination)}`;
}
