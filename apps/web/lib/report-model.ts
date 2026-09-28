import { ENGINE_V2_VERSION, FACTOR_SETS, SOURCES, type FactorSetId } from "@temt/calculator";
import { applyFilters, byBusinessUnit, byLane, byMode, byMonth, byQuality, byScope, byVehicleClass, insights, opportunities, previousPeriod, totals, type Bucket, type Filters, type Insight, type Opportunity, type Totals } from "./analytics";
import { fiscalYear, formatDate } from "./format";
import { adjustmentName } from "./adjustments";
import { describeLeg, distanceType, DIRECTION_LABELS, MODE_LABELS, PAID_BY_LABELS, scopeOf, SCOPE_LABELS, type ComputedShipment } from "./records";
import type { Settings } from "./store";

export interface LegRow {
  shipmentRef: string; date: string; fiscalYear: string; businessUnit: string; commodity: string; direction: string; paidBy: string;
  legNo: number; route: string; mode: string; detail: string; method: string; scope: string; dataQuality: string;
  tonnes: number; distanceKm: number; tonneKm: number; ttwKg: number; wttKg: number; wtwKg: number; intensityG: number;
  distanceType: string; factor: string; factorWtt: number; factorTtw: number; factorUnit: string; source: string; sourceRef: string; adjustments: string; warnings: string;
}

export interface HubRow { shipmentRef: string; date: string; hub: string; type: string; wtwKg: number; basis: string }

export interface ShipmentRow {
  ref: string; date: string; fiscalYear: string; businessUnit: string; commodity: string; origin: string; destination: string; direction: string; paidBy: string;
  modes: string; legs: number; cargoTonnes: number; distanceKm: number; tonneKm: number; ttwKg: number; wttKg: number; hubKg: number; wtwKg: number; intensityG: number; kgPerTonne: number; dataQuality: string; source: string; status: string;
}

export interface ReportModel {
  title: string;
  organisation: string;
  period: string;
  generatedAt: string;
  factorSet: { id: FactorSetId; label: string; description: string };
  engineVersion: string;
  filters: Filters;
  totals: Totals;
  previous?: { period: string; totals: Totals; partial?: boolean };
  /** Synthetic sample shipments in the selection; reports label them so they can't pass as real data. */
  sampleShipments: number;
  byMode: Bucket[];
  byMonth: Bucket[];
  byBusinessUnit: Bucket[];
  byLane: Bucket[];
  byScope: Bucket[];
  byQuality: Bucket[];
  byVehicle: Bucket[];
  insights: Insight[];
  opportunities: Opportunity[];
  shipments: ShipmentRow[];
  legs: LegRow[];
  hubs: HubRow[];
  factorsUsed: { factor: string; wtt: number; ttw: number; unit: string; source: string; ref: string; legs: number }[];
  brsr: { indicator: string; value: string; note: string }[];
  carbonCostInr?: number;
  revenueIntensity?: number;
  sources: { title: string; publisher: string; year: number; url: string }[];
  notes: string[];
}

const QUALITY: Record<string, string> = { primary: "Primary", modelled: "Modelled", default: "Default" };
const METHOD: Record<string, string> = { distance: "Distance-based", fuel: "Fuel-based", energy: "Energy-based" };

export function buildReportModel(all: ComputedShipment[], settings: Settings, filters: Filters): ReportModel {
  const rows = applyFilters(all, filters);
  const t = totals(rows);
  const period = filters.fy && filters.fy !== "all" ? filters.fy : "All periods";
  const prior = previousPeriod(all, filters.fy, filters);
  const previous: ReportModel["previous"] = prior ? { period: prior.short, totals: prior.totals, partial: prior.partial } : undefined;
  const sampleShipments = rows.filter((row) => row.source === "sample").length;

  const legs: LegRow[] = [];
  const hubs: HubRow[] = [];
  const factorMap = new Map<string, ReportModel["factorsUsed"][number]>();
  const shipments: ShipmentRow[] = rows.map((row) => {
    const result = row.result;
    result?.legs.forEach((leg, index) => {
      const described = describeLeg(row, index);
      legs.push({
        shipmentRef: row.ref, date: row.date, fiscalYear: fiscalYear(row.date), businessUnit: row.businessUnit, commodity: row.commodity, direction: DIRECTION_LABELS[row.direction], paidBy: PAID_BY_LABELS[row.paidBy],
        legNo: index + 1, route: described.route, mode: described.mode, detail: described.detail, method: METHOD[leg.method] ?? leg.method, scope: SCOPE_LABELS[scopeOf(row, leg.method)].short, dataQuality: QUALITY[leg.dataQuality] ?? leg.dataQuality,
        tonnes: leg.tonnes, distanceKm: leg.distanceKm, tonneKm: leg.tonneKm, ttwKg: leg.ttwKg, wttKg: leg.wttKg, wtwKg: leg.wtwKg, intensityG: leg.intensityG,
        distanceType: distanceType(row.legMeta[index]?.distanceMethod, leg.mode),
        factor: leg.factor.label, factorWtt: leg.factor.wtt, factorTtw: leg.factor.ttw, factorUnit: leg.factor.unit, source: SOURCES[leg.factor.source].publisher, sourceRef: leg.factor.ref,
        adjustments: leg.uplifts.map((uplift) => adjustmentName(uplift.label)).join("; "), warnings: leg.warnings.join(" "),
      });
      const key = `${leg.factor.label}|${leg.factor.wtt}|${leg.factor.ttw}`;
      const entry = factorMap.get(key) ?? { factor: leg.factor.label, wtt: leg.factor.wtt, ttw: leg.factor.ttw, unit: leg.factor.unit, source: SOURCES[leg.factor.source].publisher, ref: leg.factor.ref, legs: 0 };
      entry.legs += 1;
      factorMap.set(key, entry);
    });
    result?.hubs.forEach((hub) => hubs.push({ shipmentRef: row.ref, date: row.date, hub: hub.label, type: hub.type, wtwKg: hub.wtwKg, basis: `${SOURCES[hub.source].publisher} default hub intensity` }));
    return {
      ref: row.ref, date: row.date, fiscalYear: fiscalYear(row.date), businessUnit: row.businessUnit, commodity: row.commodity, origin: row.origin.label, destination: row.destination.label,
      direction: DIRECTION_LABELS[row.direction], paidBy: PAID_BY_LABELS[row.paidBy], modes: [...new Set(row.input.legs.map((leg) => MODE_LABELS[leg.mode]))].join(" + "), legs: row.input.legs.length,
      cargoTonnes: result?.cargoTonnes ?? 0, distanceKm: result?.distanceKm ?? 0, tonneKm: result?.tonneKm ?? 0, ttwKg: result?.ttwKg ?? 0, wttKg: result?.wttKg ?? 0, hubKg: result?.hubKg ?? 0, wtwKg: result?.wtwKg ?? 0,
      intensityG: result?.intensityG ?? 0, kgPerTonne: result?.kgPerTonne ?? 0, dataQuality: result ? QUALITY[result.dataQuality] ?? result.dataQuality : "", source: row.source, status: row.error ? `Not calculated: ${row.error}` : "Calculated",
    };
  });

  const scopes = byScope(rows);
  const scope3 = scopes.filter((item) => item.key === "cat4" || item.key === "cat9").reduce((sum, item) => sum + item.wtwKg, 0);
  const scope12 = scopes.filter((item) => item.key === "scope1" || item.key === "scope2").reduce((sum, item) => sum + item.wtwKg, 0);
  const revenue = settings.organisation.revenueCrore;
  const brsr = [
    { indicator: "Principle 6 · Scope 3 GHG emissions (freight share)", value: `${(scope3 / 1000).toFixed(2)} t CO₂e`, note: "Leadership indicator. Category 4 and Category 9 transport, well-to-wheel." },
    { indicator: "Principle 6 · Scope 1 and 2 GHG emissions (own fleet share)", value: `${(scope12 / 1000).toFixed(2)} t CO₂e`, note: "Own fleet fuel (Scope 1) and electricity for own electric vehicles (Scope 2). Add to your site-level Scope 1 and 2 inventory." },
    { indicator: "Freight emission intensity", value: `${t.intensityG.toFixed(1)} g CO₂e per tonne-km`, note: "Physical intensity for year-on-year comparison." },
    ...(revenue ? [{ indicator: "Freight emissions per ₹ crore of revenue", value: `${(t.wtwKg / 1000 / revenue).toFixed(3)} t CO₂e`, note: `Revenue entered in Settings: ₹${revenue.toLocaleString("en-IN")} crore.` }] : []),
    { indicator: "Methodology", value: FACTOR_SETS[settings.factorSet].short, note: "ISO 14083-aligned; factor sources listed in the methodology section." },
  ];

  const usedSources = new Set(rows.flatMap((row) => row.result?.legs.map((leg) => leg.factor.source) ?? []));
  usedSources.add("iso-14083");
  usedSources.add("ghg-protocol-scope3");
  return {
    title: "Freight emissions report",
    organisation: settings.organisation.name || "Your organisation",
    period,
    generatedAt: new Date().toISOString(),
    factorSet: { id: settings.factorSet, label: FACTOR_SETS[settings.factorSet].label, description: FACTOR_SETS[settings.factorSet].description },
    engineVersion: ENGINE_V2_VERSION,
    filters,
    totals: t,
    previous,
    sampleShipments,
    byMode: byMode(rows),
    byMonth: byMonth(rows, filters.fy),
    byBusinessUnit: byBusinessUnit(rows),
    byLane: byLane(rows).slice(0, 12),
    byScope: scopes,
    byQuality: byQuality(rows),
    byVehicle: byVehicleClass(rows),
    insights: insights(rows),
    opportunities: opportunities(rows, settings.factorSet),
    shipments,
    legs,
    hubs,
    factorsUsed: [...factorMap.values()].sort((a, b) => b.legs - a.legs),
    brsr,
    carbonCostInr: settings.carbonPriceInrPerTonne ? (t.wtwKg / 1000) * settings.carbonPriceInrPerTonne : undefined,
    revenueIntensity: revenue ? t.wtwKg / 1000 / revenue : undefined,
    sources: [...usedSources].map((id) => SOURCES[id]).map(({ title, publisher, year, url }) => ({ title, publisher, year, url })),
    notes: [
      ...(sampleShipments ? [`This selection includes ${sampleShipments} synthetic sample shipments generated for demonstration. They are not the organisation's actual freight.`] : []),
      "Emissions are reported well-to-wheel (WTW) in kg or tonnes CO₂e, split into tank-to-wheel (vehicle operation), well-to-tank (energy provision) and hub operations, following ISO 14083:2023 with TEMT's India-specific emission factors.",
      "Default factors are estimates for typical operations. Replace them with primary fuel or energy data from carriers where available.",
      "Distance type follows ISO 14083: road, rail, waterway and sea legs use the shortest feasible distance (SFD), estimated unless an actual distance was supplied; air legs use the great-circle distance (GCD) with the standard routing allowance.",
      "Scope classification follows the GHG Protocol: own fleet → Scope 1/2; purchased transport → Scope 3 Category 4; customer-paid downstream transport → Scope 3 Category 9.",
      "TEMT is certified to ISO 14083 (December 2024) and its information security to ISO/IEC 27001:2022.",
    ],
  };
}

export function reportFileStem(model: ReportModel) {
  const org = model.organisation.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisation";
  return `TEMT-${org}-${model.period.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

export const generatedLabel = (model: ReportModel) => `Generated ${formatDate(model.generatedAt.slice(0, 10), "long")} · ${model.factorSet.label} · engine ${model.engineVersion}`;
