import type { Factor, Profile } from "./types.js";

export const FACTOR_VERSION = "GLEC v3.2 (October 2025)";
const sourceUrl = "https://d1c2gz5q23tkk0.cloudfront.net/shrine_store/uploads/networks/3660/communication_news/13311209/61c644c3cbc7aabd60d91cff8d37cff2.pdf";
const sourceLabel = "Smart Freight Centre, GLEC Framework v3.2";

function factor(value: Omit<Factor, "sourceUrl" | "sourceLabel" | "version">): Readonly<Factor> {
  return Object.freeze({ ...value, assumptions: Object.freeze([...value.assumptions]), sourceUrl, sourceLabel, version: FACTOR_VERSION });
}

/** Published well-to-wheel defaults. They are estimates, not carrier-specific measurements. */
export const FACTORS: Readonly<Record<Profile, Readonly<Factor>>> = Object.freeze({
  "road-hcv": factor({
    id: "road-hcv", mode: "road", label: "India diesel HCV, 30–50 t GVW",
    kgCO2ePerTonneKm: 0.0663, sourcePage: 106,
    assumptions: [
      "Indian heavy commercial vehicle category 3; 20–40 t payload capacity.",
      "Average load 68.3%; empty running 14.4%.",
      "The published factor already includes a 5% distance adjustment.",
      "Indian default factors are preliminary and subject to review.",
    ],
  }),
  "rail-india": factor({
    id: "rail-india", mode: "rail", label: "India rail, mixed traction",
    kgCO2ePerTonneKm: 0.0106, sourcePage: 97,
    assumptions: [
      "Indian average combining diesel and electric traction.",
      "A national default, not a measured factor for a particular train or corridor.",
      "Indian default factors are preliminary and subject to review.",
    ],
  }),
  "ocean-container": factor({
    id: "ocean-container", mode: "ocean", label: "Dry container, Middle East / India",
    kgCO2ePerTonneKm: 0.01145, sourcePage: 112,
    assumptions: [
      "Intra Middle East / India dry-container end-user factor: 114.5 g CO₂e per TEU-km.",
      "Converted using an illustrative average of 10 tonnes per TEU.",
      "The published factor includes 70% fleet load and a 15% distance adjustment.",
      "Port operations and first/last-mile legs are excluded unless supplied separately.",
    ],
  }),
  "air-short": factor({
    id: "air-short", mode: "air", label: "Air, short-haul mixed aircraft",
    kgCO2ePerTonneKm: 1.363, sourcePage: 94,
    assumptions: [
      "Unknown aircraft mix: 55% belly freight, 45% freighter.",
      "Short-haul profile. This demo includes the 1,500 km boundary in short-haul.",
      "The published factor already includes the 95 km distance adjustment.",
      "Default emissions only; no separate aviation radiative-forcing multiplier.",
    ],
  }),
  "air-long": factor({
    id: "air-long", mode: "air", label: "Air, long-haul mixed aircraft",
    kgCO2ePerTonneKm: 0.788, sourcePage: 94,
    assumptions: [
      "Unknown aircraft mix: 55% belly freight, 45% freighter.",
      "Long-haul profile for a leg longer than 1,500 km.",
      "The published factor already includes the 95 km distance adjustment.",
      "Default emissions only; no separate aviation radiative-forcing multiplier.",
    ],
  }),
});
