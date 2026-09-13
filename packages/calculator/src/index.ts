import { z } from "zod";
import { FACTORS } from "./factors.js";
import { MODES, PROFILES } from "./types.js";
import type { Aggregate, AnalysisResult, CalculatedLeg, FreightMixComparison, RowError, ShipmentLeg } from "./types.js";

export { FACTORS, FACTOR_VERSION } from "./factors.js";
export { MODES, PROFILES } from "./types.js";
export type * from "./types.js";

export const ENGINE_VERSION = "temt-demo-1.0.0";
export const MAX_LEGS = 1000;

export class AnalysisInputError extends Error {
  constructor(public readonly code: "invalid_input" | "row_limit_exceeded", message: string) {
    super(message);
    this.name = "AnalysisInputError";
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const positiveFinite = z.number().finite().positive();
const legSchema = z.object({
  shipmentId: z.string().trim().min(1).max(128),
  legIndex: z.number().int().positive().max(MAX_LEGS),
  date: z.string().refine(isCalendarDate, "Use a valid calendar date in YYYY-MM-DD format."),
  subsidiary: z.string().trim().min(1).max(160),
  mode: z.enum(MODES),
  profile: z.enum(PROFILES),
  tonnes: positiveFinite,
  kilometres: positiveFinite,
}).superRefine((leg, context) => {
  if (FACTORS[leg.profile].mode !== leg.mode) {
    context.addIssue({ code: "custom", path: ["profile"], message: "The factor profile does not match the transport mode." });
  }
  if ((leg.profile === "air-short" && leg.kilometres > 1500) || (leg.profile === "air-long" && leg.kilometres <= 1500)) {
    context.addIssue({ code: "custom", path: ["profile"], message: "Use air-short up to 1,500 km and air-long above 1,500 km." });
  }
  const activity = leg.tonnes * leg.kilometres;
  if (!Number.isFinite(activity) || activity <= 0 || activity > Number.MAX_SAFE_INTEGER) {
    context.addIssue({ code: "custom", path: ["tonnes"], message: "Shipment activity exceeds the supported numerical range." });
  }
});

function identifiableShipment(row: unknown): string | undefined {
  if (!row || typeof row !== "object" || !("shipmentId" in row) || typeof row.shipmentId !== "string") return undefined;
  const id = row.shipmentId.trim();
  return id.length > 0 && id.length <= 128 ? id : undefined;
}

/** Compensated summation reduces accumulation error without rounding individual legs. */
function sum(values: readonly number[]): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = total + adjusted;
    compensation = (next - total) - adjusted;
    total = next;
  }
  return total;
}

function aggregate(rows: readonly CalculatedLeg[]): Aggregate {
  return { emissionsKg: sum(rows.map((row) => row.emissionsKg)), tonneKm: sum(rows.map((row) => row.tonneKm)), legCount: rows.length };
}

function groupBy(rows: readonly CalculatedLeg[], key: (row: CalculatedLeg) => string): Map<string, CalculatedLeg[]> {
  const groups = new Map<string, CalculatedLeg[]>();
  for (const row of rows) {
    const name = key(row);
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return groups;
}

/**
 * An identifiable shipment is excluded in full if any leg is invalid or duplicated,
 * or if its leg indices are not contiguous from 1. Unknown-ID invalid rows cannot
 * be associated with a shipment and are rejected individually. No input is mutated.
 * Calculations are deterministic; only processingMs and calculatedAt vary per run.
 */
export function analyze(input: unknown[]): AnalysisResult {
  const started = performance.now();
  if (!Array.isArray(input)) throw new AnalysisInputError("invalid_input", "Provide rows as an array.");
  if (input.length > MAX_LEGS) throw new AnalysisInputError("row_limit_exceeded", `A batch may contain at most ${MAX_LEGS} legs.`);

  const errors: RowError[] = [];
  const invalidShipments = new Set<string>();
  const parsed: { leg: ShipmentLeg; rowIndex: number }[] = [];
  input.forEach((raw, rowIndex) => {
    const result = legSchema.safeParse(raw);
    if (result.success) {
      parsed.push({ leg: result.data, rowIndex });
    } else {
      const shipmentId = identifiableShipment(raw);
      if (shipmentId) invalidShipments.add(shipmentId);
      errors.push({ rowIndex, ...(shipmentId ? { shipmentId } : {}), code: "invalid_row",
        message: result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join(" "),
        fields: [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "row"))],
      });
    }
  });

  const shipments = new Map<string, typeof parsed>();
  for (const entry of parsed) {
    const group = shipments.get(entry.leg.shipmentId) ?? [];
    group.push(entry);
    shipments.set(entry.leg.shipmentId, group);
  }

  for (const [shipmentId, group] of shipments) {
    const indices = new Map<number, typeof parsed>();
    for (const entry of group) {
      const matching = indices.get(entry.leg.legIndex) ?? [];
      matching.push(entry);
      indices.set(entry.leg.legIndex, matching);
    }
    for (const [legIndex, matching] of indices) {
      if (matching.length < 2) continue;
      invalidShipments.add(shipmentId);
      matching.forEach(({ rowIndex }) => errors.push({ rowIndex, shipmentId, code: "duplicate_leg", fields: ["shipmentId", "legIndex"],
        message: `Leg ${legIndex} is duplicated. The entire shipment is excluded until its leg identifiers are unique.` }));
    }
    if (!invalidShipments.has(shipmentId)) {
      const sorted = [...indices.keys()].sort((a, b) => a - b);
      if (sorted.some((legIndex, index) => legIndex !== index + 1)) {
        invalidShipments.add(shipmentId);
        errors.push({ rowIndex: group[0]!.rowIndex, shipmentId, code: "incomplete_shipment", fields: ["legIndex"],
          message: "Shipment legs must run consecutively from 1. The entire shipment is excluded because a leg is missing." });
      }
    }
  }

  const hasError = new Set(errors.map((error) => error.rowIndex));
  const rows: CalculatedLeg[] = [];
  for (const { leg, rowIndex } of parsed) {
    if (invalidShipments.has(leg.shipmentId)) {
      if (!hasError.has(rowIndex)) errors.push({ rowIndex, shipmentId: leg.shipmentId, code: "shipment_excluded",
        message: "Excluded because another leg in this shipment is invalid, duplicated or missing. Correct the shipment and analyze again." });
      continue;
    }
    const factor = FACTORS[leg.profile];
    const tonneKm = leg.tonnes * leg.kilometres;
    rows.push({ ...leg, tonneKm, emissionsKg: tonneKm * factor.kgCO2ePerTonneKm,
      factorKgPerTonneKm: factor.kgCO2ePerTonneKm, factorVersion: factor.version });
  }
  errors.sort((a, b) => a.rowIndex - b.rowIndex || a.code.localeCompare(b.code));
  const byMode = MODES.map((mode) => ({ mode, ...aggregate(rows.filter((row) => row.mode === mode)) }));
  const bySubsidiary = [...groupBy(rows, (row) => row.subsidiary)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([subsidiary, group]) => ({ subsidiary, ...aggregate(group) }));
  const byMonth = [...groupBy(rows, (row) => row.date.slice(0, 7))].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([month, group]) => ({ month, ...aggregate(group) }));
  const totals = { ...aggregate(rows), shipmentCount: new Set(rows.map((row) => row.shipmentId)).size };
  return { rows, errors, totals, byMode, bySubsidiary, byMonth,
    stages: [
      { id: "received", label: "Rows received", status: "complete", count: input.length },
      { id: "validated", label: "Legs accepted after shipment validation", status: "complete", count: rows.length },
      { id: "calculated", label: "Legs calculated with published factors", status: "complete", count: rows.length },
      { id: "aggregated", label: "Complete shipments aggregated", status: "complete", count: totals.shipmentCount },
    ],
    engineVersion: ENGINE_VERSION, processingMs: performance.now() - started, calculatedAt: new Date().toISOString(),
  };
}

/** Equal-distance road/rail illustration. Excludes routing, terminal operations and first/last-mile legs. */
export function compareFreightMix(tonnes: number, kilometres: number, railPercent: number): FreightMixComparison {
  const activity = tonnes * kilometres;
  if (![tonnes, kilometres, railPercent].every(Number.isFinite) || tonnes <= 0 || kilometres <= 0 || railPercent < 0 || railPercent > 100 || activity <= 0 || activity > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Use positive finite tonnes and kilometres, a supported shipment activity, and a rail share from 0 to 100.");
  }
  const baselineKg = activity * FACTORS["road-hcv"].kgCO2ePerTonneKm;
  const railShare = railPercent / 100;
  const scenarioKg = activity * ((1 - railShare) * FACTORS["road-hcv"].kgCO2ePerTonneKm + railShare * FACTORS["rail-india"].kgCO2ePerTonneKm);
  const savedKg = baselineKg - scenarioKg;
  return { baselineKg, scenarioKg, savedKg, reductionPercent: baselineKg === 0 ? 0 : savedKg / baselineKg * 100 };
}
