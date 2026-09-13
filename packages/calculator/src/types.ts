export const MODES = ["road", "rail", "ocean", "air"] as const;
export type Mode = (typeof MODES)[number];

export const PROFILES = ["road-hcv", "rail-india", "ocean-container", "air-short", "air-long"] as const;
export type Profile = (typeof PROFILES)[number];

export interface ShipmentLeg {
  shipmentId: string;
  legIndex: number;
  date: string;
  subsidiary: string;
  mode: Mode;
  profile: Profile;
  tonnes: number;
  kilometres: number;
}

export interface Factor {
  id: Profile;
  mode: Mode;
  label: string;
  kgCO2ePerTonneKm: number;
  sourceUrl: string;
  sourcePage: number;
  sourceLabel: string;
  version: string;
  assumptions: readonly string[];
}

export interface CalculatedLeg extends ShipmentLeg {
  tonneKm: number;
  emissionsKg: number;
  factorKgPerTonneKm: number;
  factorVersion: string;
}

export type RowErrorCode = "invalid_row" | "duplicate_leg" | "shipment_excluded" | "incomplete_shipment";

export interface RowError {
  /** Zero-based index in the submitted array, including invalid rows. */
  rowIndex: number;
  shipmentId?: string;
  code: RowErrorCode;
  message: string;
  fields?: string[];
}

export interface Aggregate {
  emissionsKg: number;
  tonneKm: number;
  legCount: number;
}

export interface AnalysisStage {
  id: "received" | "validated" | "calculated" | "aggregated";
  label: string;
  status: "complete";
  count: number;
}

export interface AnalysisResult {
  rows: CalculatedLeg[];
  errors: RowError[];
  totals: Aggregate & { shipmentCount: number };
  byMode: (Aggregate & { mode: Mode })[];
  bySubsidiary: (Aggregate & { subsidiary: string })[];
  byMonth: (Aggregate & { month: string })[];
  stages: AnalysisStage[];
  engineVersion: string;
  processingMs: number;
  calculatedAt: string;
}

export interface FreightMixComparison {
  baselineKg: number;
  scenarioKg: number;
  savedKg: number;
  reductionPercent: number;
}
