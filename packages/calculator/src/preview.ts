import { FACTORS } from "./factors.js";
import type { FreightMixComparison } from "./types.js";

export { FACTORS, FACTOR_VERSION } from "./factors.js";
export type * from "./types.js";

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
