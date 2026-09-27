import { calculateLeg, EV_ENERGY_PROXY_KWH_PER_TKM, INDIA_GRID_KG_PER_KWH, ROAD_CLASSES, type FactorSetId } from "@temt/calculator";
import { railAlternativeKg } from "./analytics";
import type { ComputedShipment } from "./records";

export interface Levers {
  /** Share (%) of eligible long road hauls moved to rail with road drayage. */
  railShift: number;
  railMinKm: number;
  /** Share (%) of eligible air legs moved to road. */
  airToRoad: number;
  /** Share (%) of long hauls in small trucks consolidated into 12–20 t trucks. */
  consolidate: number;
  /** Share (%) of short road legs electrified. */
  evShare: number;
  evMaxKm: number;
  /** kg CO2e per kWh for charging (CEA grid average or a renewable contract). */
  evGrid: number;
  /** Load factor improvement, percentage points, on remaining diesel road legs. */
  loadFactorGain: number;
}

export const DEFAULT_LEVERS: Levers = { railShift: 30, railMinKm: 500, airToRoad: 50, consolidate: 50, evShare: 25, evMaxKm: 150, evGrid: INDIA_GRID_KG_PER_KWH, loadFactorGain: 5 };

export interface ScenarioResult {
  baselineKg: number;
  resultKg: number;
  steps: { id: keyof Levers | "air" | "rail" | "consolidation" | "ev" | "load"; label: string; deltaKg: number; legs: number }[];
  /** Distinct legs changed by at least one lever. */
  affectedLegs: number;
  totalLegs: number;
  notes: string[];
}

/** Apply reduction levers leg by leg, recalculating alternatives with the active factor set. */
export function runScenario(rows: ComputedShipment[], factorSet: FactorSetId, levers: Levers): ScenarioResult {
  let baselineKg = 0;
  const delta = { air: 0, rail: 0, consolidation: 0, ev: 0, load: 0 };
  const count = { air: 0, rail: 0, consolidation: 0, ev: 0, load: 0 };
  let evSkippedLight = 0, totalLegs = 0;
  const affected = new Set<string>();
  for (const row of rows) {
    if (!row.result) continue;
    baselineKg += row.result.wtwKg;
    row.result.legs.forEach((leg, index) => {
      const input = row.input.legs[index]!;
      const key = `${row.id}:${index}`;
      totalLegs += 1;
      let remaining = leg.wtwKg;
      if (leg.mode === "air" && leg.distanceKm <= 2500 && levers.airToRoad > 0) {
        const road = calculateLeg({ mode: "road", tonnes: leg.tonnes, distanceKm: leg.distanceKm * 1.22, vehicleClass: "gvw-5-12" }, factorSet).wtwKg;
        const share = levers.airToRoad / 100;
        delta.air += share * (road - leg.wtwKg); count.air += 1; affected.add(key);
        return;
      }
      if (leg.mode !== "road" || leg.method !== "distance" || input.courierLeg) return;
      const fuel = input.fuel ?? "diesel";
      if (fuel === "electric") return;
      if (leg.distanceKm >= levers.railMinKm && leg.tonnes >= 8 && levers.railShift > 0) {
        const alternative = railAlternativeKg(input, leg.distanceKm, factorSet);
        if (alternative < leg.wtwKg) {
          const share = levers.railShift / 100;
          delta.rail += share * (alternative - leg.wtwKg); count.rail += 1; affected.add(key);
          remaining = leg.wtwKg * (1 - share);
        }
      } else if (["gvw-3.5", "gvw-3-5", "gvw-5-12"].includes(input.vehicleClass ?? "") && leg.distanceKm >= 250 && levers.consolidate > 0) {
        try {
          const bigger = calculateLeg({ ...input, vehicleClass: "gvw-12-20", fuel: "diesel" }, factorSet).wtwKg;
          if (bigger < leg.wtwKg) {
            const share = levers.consolidate / 100;
            delta.consolidation += share * (bigger - leg.wtwKg); count.consolidation += 1; affected.add(key);
            remaining = leg.wtwKg + share * (bigger - leg.wtwKg);
          }
        } catch { /* no comparable factor */ }
      } else if (leg.distanceKm <= levers.evMaxKm && levers.evShare > 0) {
        const vehicleClass = input.vehicleClass ?? "gvw-12-20";
        if (EV_ENERGY_PROXY_KWH_PER_TKM[vehicleClass] === undefined) { evSkippedLight += 1; }
        else {
          const ev = calculateLeg({ mode: "road", fuel: "electric", tonnes: leg.tonnes, distanceKm: leg.distanceKm, vehicleClass, gridKgPerKwh: levers.evGrid }, factorSet).wtwKg;
          const share = levers.evShare / 100;
          delta.ev += share * (ev - leg.wtwKg); count.ev += 1; affected.add(key);
          remaining = leg.wtwKg * (1 - share);
        }
      }
      if (levers.loadFactorGain > 0 && remaining > 0) {
        const lf = ROAD_CLASSES.find((item) => item.id === (input.vehicleClass ?? "gvw-12-20"))?.loadFactor ?? 0.75;
        const improved = Math.min(0.98, lf + levers.loadFactorGain / 100);
        // Emissions per tonne-km scale approximately with the inverse of the load factor.
        delta.load += remaining * (lf / improved - 1); count.load += 1; affected.add(key);
      }
    });
  }
  const steps: ScenarioResult["steps"] = [
    { id: "air", label: "Air → road", deltaKg: delta.air, legs: count.air },
    { id: "rail", label: "Road → rail", deltaKg: delta.rail, legs: count.rail },
    { id: "consolidation", label: "Consolidate", deltaKg: delta.consolidation, legs: count.consolidation },
    { id: "ev", label: "Electric trucks", deltaKg: delta.ev, legs: count.ev },
    { id: "load", label: "Load factor", deltaKg: delta.load, legs: count.load },
  ];
  const notes: string[] = [];
  if (delta.ev > 0) notes.push("Electrifying on the average Indian grid increases emissions for these vehicles with the published European energy proxies. Use a renewable electricity factor to see the benefit of green charging.");
  if (evSkippedLight) notes.push(`${evSkippedLight} light-vehicle legs were not electrified because no default energy intensity exists for vehicles under 3.5 t; enter measured kWh on real EV shipments.`);
  notes.push("Rail options assume 30 km of road drayage at each end; terminal handling is not included. Confirm rail access, capacity and transit time.");
  return { baselineKg, resultKg: baselineKg + steps.reduce((sum, step) => sum + step.deltaKg, 0), steps, affectedLegs: affected.size, totalLegs, notes };
}
