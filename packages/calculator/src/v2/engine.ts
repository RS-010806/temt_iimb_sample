import { z } from "zod";
import {
  AIR_DISTANCE_ADJUSTMENT_KM, AIR_SHORT_HAUL_LIMIT_KM, ENGINE_V2_VERSION, EV_ENERGY_PROXY_KWH_PER_TKM, FACTOR_SETS, FUELS, GLEC_AIR,
  HUB_TYPES, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, MODE_LABELS, RAIL_FACTORS, REEFER_UPLIFT, ROAD_CLASSES, ROAD_FACTORS,
  SEA_DISTANCE_ADJUSTMENT, TEMT_AIR, TEMT_COURIER, TRADE_LANES, VESSELS,
} from "./library.js";
import type { AirScope, AirService, ContainerType, FactorSetId, FuelId, HubCondition, HubTypeId, Intensity, RoadClassId, RoadFuel, TransportMode } from "./library.js";
import { SOURCES, type SourceId } from "./sources.js";

export type CalcMethod = "distance" | "fuel" | "energy";
export type DataQuality = "primary" | "modelled" | "default";
export type CourierLeg = "first" | "mid" | "last";

export interface LegInput {
  mode: TransportMode;
  method?: CalcMethod;
  /** Cargo mass carried on this leg, tonnes. */
  tonnes: number;
  distanceKm?: number;
  /** Sea only: "shortest" (estimated route, GLEC 15% adjustment applies) or "actual" sailed distance. */
  distanceBasis?: "shortest" | "actual";
  vehicleClass?: RoadClassId;
  fuel?: RoadFuel;
  refrigerated?: boolean;
  courierLeg?: CourierLeg;
  airService?: AirService;
  airScope?: AirScope;
  seaBasis?: "lane" | "vessel";
  tradeLane?: string;
  containerType?: ContainerType;
  tonnesPerTeu?: number;
  vesselId?: string;
  iwwVesselId?: string;
  fuelId?: FuelId;
  fuelQuantity?: number;
  fuelUnit?: "l" | "kg" | "kWh";
  /** Share of the measured fuel or energy attributable to this cargo (0–1]. */
  allocationShare?: number;
  energyKwh?: number;
  gridKgPerKwh?: number;
  customFactor?: { label: string; wtt: number; ttw: number; quality?: DataQuality };
}

export interface HubInput {
  type: HubTypeId;
  condition?: HubCondition;
  tonnes?: number;
  containers?: number;
  label?: string;
}

export interface FactorUsed {
  label: string;
  wtt: number;
  ttw: number;
  unit: string;
  source: SourceId;
  sourceTitle: string;
  ref: string;
}

export interface LegResult {
  mode: TransportMode;
  method: CalcMethod;
  tonnes: number;
  distanceKm: number;
  tonneKm: number;
  ttwKg: number;
  wttKg: number;
  wtwKg: number;
  /** Well-to-wheel grams CO2e per tonne-km; 0 when there is no transport activity. */
  intensityG: number;
  factor: FactorUsed;
  factorSet: FactorSetId;
  uplifts: { label: string; multiplier: number }[];
  dataQuality: DataQuality;
  trace: string[];
  warnings: string[];
}

export interface HubResult {
  type: HubTypeId;
  label: string;
  wtwKg: number;
  ttwKg: number;
  wttKg: number;
  /** Default hub values are published as totals; the WTT/TTW split is unknown. */
  splitKnown: boolean;
  source: SourceId;
  trace: string[];
}

export interface ShipmentInput {
  legs: LegInput[];
  hubs?: HubInput[];
}

export interface ShipmentResult {
  legs: LegResult[];
  hubs: HubResult[];
  ttwKg: number;
  wttKg: number;
  hubKg: number;
  wtwKg: number;
  tonneKm: number;
  distanceKm: number;
  cargoTonnes: number;
  intensityG: number;
  kgPerTonne: number;
  dataQuality: DataQuality;
  factorSet: FactorSetId;
  engineVersion: string;
}

export class CalculationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "CalculationError";
  }
}

const num = (value: number, digits = 2) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);
const positive = (value: number | undefined, field: string, label: string): number => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) throw new CalculationError(`${label} must be a positive number.`, field);
  return value;
};

function factorUsed(label: string, intensity: Pick<Intensity, "wtt" | "ttw" | "source" | "ref">, unit = "kg CO₂e/t-km"): FactorUsed {
  return { label, wtt: intensity.wtt, ttw: intensity.ttw, unit, source: intensity.source, sourceTitle: SOURCES[intensity.source].title, ref: intensity.ref };
}

function roadIntensity(set: FactorSetId, vehicleClass: RoadClassId, fuel: Exclude<RoadFuel, "electric">, warnings: string[]): Intensity {
  const own = ROAD_FACTORS[set][vehicleClass]?.[fuel];
  if (own) return own;
  const otherSet: FactorSetId = set === "glec-india" ? "temt-legacy" : "glec-india";
  const other = ROAD_FACTORS[otherSet][vehicleClass]?.[fuel];
  if (other) {
    warnings.push(`${FACTOR_SETS[set].short} has no ${fuel.toUpperCase()} value for this vehicle class; the ${FACTOR_SETS[otherSet].short} value is used.`);
    return other;
  }
  const available = Object.keys(ROAD_FACTORS[set][vehicleClass] ?? {}).join(", ");
  throw new CalculationError(`No ${fuel} factor is published for this vehicle class. Available fuels: ${available || "none"}.`, "fuel");
}

function describeRoadClass(id: RoadClassId) {
  const item = ROAD_CLASSES.find((entry) => entry.id === id);
  if (!item) throw new CalculationError("Choose a supported road vehicle class.", "vehicleClass");
  return `${item.label}, ${item.gvw} GVW`;
}

/** Calculate one transport leg. Deterministic and side-effect free. */
export function calculateLeg(input: LegInput, factorSet: FactorSetId = "glec-india"): LegResult {
  const method: CalcMethod = input.method ?? (input.mode === "road" && input.fuel === "electric" ? "energy" : "distance");
  const tonnes = positive(input.tonnes, "tonnes", "Cargo weight");
  const warnings: string[] = [];
  const uplifts: { label: string; multiplier: number }[] = [];
  const trace: string[] = [];
  let distanceKm = input.distanceKm ?? 0;
  if (distanceKm < 0 || !Number.isFinite(distanceKm)) throw new CalculationError("Distance must be zero or positive.", "distanceKm");

  let ttwKg = 0;
  let wttKg = 0;
  let factor: FactorUsed;
  let dataQuality: DataQuality = "default";

  if (method === "fuel") {
    const fuel = FUELS[input.fuelId ?? "diesel"];
    if (!fuel) throw new CalculationError("Choose a supported fuel.", "fuelId");
    const quantity = positive(input.fuelQuantity, "fuelQuantity", "Fuel quantity");
    const share = input.allocationShare ?? 1;
    if (!(share > 0 && share <= 1)) throw new CalculationError("Allocation share must be greater than 0 and at most 100%.", "allocationShare");
    let base = quantity;
    const unit = input.fuelUnit ?? (fuel.unit === "kWh" ? "kWh" : fuel.density ? "l" : "kg");
    if (fuel.unit === "kWh" && unit !== "kWh") throw new CalculationError("Electricity is measured in kWh.", "fuelUnit");
    if (fuel.unit === "kg" && unit === "l") {
      if (!fuel.density) throw new CalculationError(`${fuel.label} is measured by mass. Enter kilograms.`, "fuelUnit");
      base = quantity * fuel.density;
      trace.push(`Fuel: ${num(quantity)} l × ${fuel.density} kg/l = ${num(base)} kg ${fuel.label.toLowerCase()}`);
    } else {
      trace.push(`Fuel: ${num(quantity)} ${unit} ${fuel.label.toLowerCase()}`);
    }
    ttwKg = base * fuel.ttw * share;
    wttKg = base * (fuel.wtw - fuel.ttw) * share;
    if (share < 1) trace.push(`Allocated to this cargo: ${num(share * 100, 1)}% of the measured fuel`);
    factor = { label: fuel.label, wtt: fuel.wtw - fuel.ttw, ttw: fuel.ttw, unit: `kg CO₂e/${fuel.unit}`, source: fuel.source, sourceTitle: SOURCES[fuel.source].title, ref: fuel.ref };
    trace.push(`Fuel factor: TTW ${fuel.ttw} + WTT ${num(fuel.wtw - fuel.ttw, 3)} = WTW ${fuel.wtw} kg CO₂e/${fuel.unit} (${SOURCES[fuel.source].publisher}, ${fuel.ref})`);
    dataQuality = "primary";
  } else if (method === "energy") {
    const grid = input.gridKgPerKwh ?? INDIA_GRID_KG_PER_KWH;
    if (!(grid >= 0) || !Number.isFinite(grid)) throw new CalculationError("Electricity factor must be zero or positive.", "gridKgPerKwh");
    const share = input.allocationShare ?? 1;
    if (!(share > 0 && share <= 1)) throw new CalculationError("Allocation share must be greater than 0 and at most 100%.", "allocationShare");
    let kwh: number;
    if (input.energyKwh !== undefined) {
      kwh = positive(input.energyKwh, "energyKwh", "Electricity use") * share;
      trace.push(`Measured electricity: ${num(input.energyKwh)} kWh${share < 1 ? ` × ${num(share * 100, 1)}% allocation` : ""}`);
      dataQuality = "primary";
    } else {
      if (input.mode !== "road") throw new CalculationError("Enter measured electricity use for this mode.", "energyKwh");
      const vehicleClass = input.vehicleClass ?? "gvw-12-20";
      const proxy = EV_ENERGY_PROXY_KWH_PER_TKM[vehicleClass];
      if (proxy === undefined) throw new CalculationError("No default energy intensity exists for light electric vehicles. Enter measured kWh from charging or telematics records.", "energyKwh");
      positive(distanceKm, "distanceKm", "Distance");
      kwh = proxy * tonnes * distanceKm;
      trace.push(`Estimated electricity: ${num(tonnes)} t × ${num(distanceKm)} km × ${proxy} kWh/t-km = ${num(kwh)} kWh`);
      warnings.push("Electric-truck energy intensity uses a GLEC v3.2 Table 11 European proxy. Replace it with measured kWh when available.");
    }
    wttKg = kwh * grid;
    const custom = input.gridKgPerKwh !== undefined;
    factor = { label: custom ? "Electricity (user-supplied factor)" : "Grid electricity, India", wtt: grid, ttw: 0, unit: "kg CO₂e/kWh", source: "cea-21", sourceTitle: SOURCES["cea-21"].title, ref: custom ? "User-supplied" : "Weighted average, FY 2024–25" };
    trace.push(`Electricity factor: ${grid} kg CO₂e/kWh (${custom ? "user-supplied, for example a renewable supply contract" : "CEA V21.0 all-India average"}). Tank-to-wheel emissions are zero.`);
    if (input.mode === "road" && input.vehicleClass) trace.unshift(`Vehicle: ${describeRoadClass(input.vehicleClass)}, battery-electric`);
  } else {
    positive(distanceKm, "distanceKm", "Distance");
    let intensity: Intensity;
    let label: string;
    if (input.customFactor) {
      const { wtt, ttw } = input.customFactor;
      if (![wtt, ttw].every((value) => Number.isFinite(value) && value >= 0)) throw new CalculationError("Custom factor values must be zero or positive.", "customFactor");
      intensity = { wtt, ttw, source: "iso-14083", ref: "Carrier or user-supplied intensity" };
      label = input.customFactor.label || "Custom intensity";
      dataQuality = input.customFactor.quality ?? "primary";
    } else if (input.mode === "road") {
      const fuel = (input.fuel ?? "diesel") as Exclude<RoadFuel, "electric">;
      if (factorSet === "temt-legacy" && input.courierLeg) {
        intensity = input.courierLeg === "mid" ? TEMT_COURIER.midMile : input.courierLeg === "first" ? TEMT_COURIER.firstMile : TEMT_COURIER.lastMile;
        label = `Courier ${input.courierLeg}-mile default`;
      } else {
        const vehicleClass = input.vehicleClass ?? "gvw-12-20";
        intensity = roadIntensity(factorSet, vehicleClass, fuel, warnings);
        label = `${describeRoadClass(vehicleClass)}, ${fuel === "cng" ? "CNG" : fuel}`;
      }
      if (input.refrigerated) uplifts.push({ label: "Refrigerated (temperature-controlled) uplift", multiplier: REEFER_UPLIFT });
    } else if (input.mode === "rail") {
      intensity = RAIL_FACTORS[factorSet];
      label = "Indian Railways average, mixed diesel/electric traction";
    } else if (input.mode === "air") {
      const gcd = distanceKm;
      if (factorSet === "temt-legacy") {
        const scope = input.airScope ?? "domestic";
        intensity = TEMT_AIR[scope];
        label = `Air freight, ${scope}`;
        distanceKm = gcd + AIR_DISTANCE_ADJUSTMENT_KM;
        trace.push(`Distance: ${num(gcd)} km great-circle + ${AIR_DISTANCE_ADJUSTMENT_KM} km routing adjustment = ${num(distanceKm)} km`);
      } else {
        const service = input.airService ?? "unknown";
        const haul = gcd <= AIR_SHORT_HAUL_LIMIT_KM ? "short" : "long";
        intensity = GLEC_AIR[service][haul];
        label = `Air freight, ${service === "unknown" ? "unknown aircraft mix" : service === "belly" ? "belly hold" : "freighter"}, ${haul}-haul`;
        trace.push(`Distance: ${num(gcd)} km great-circle. GLEC air intensities already include the +95 km routing adjustment.`);
      }
    } else if (input.mode === "sea") {
      const basis = input.seaBasis ?? (input.vesselId ? "vessel" : "lane");
      if (basis === "lane") {
        const lane = TRADE_LANES.find((item) => item.id === (input.tradeLane ?? "intra-me-india"));
        if (!lane) throw new CalculationError("Choose a supported container trade lane.", "tradeLane");
        const type = input.containerType ?? "dry";
        const perTeu = input.tonnesPerTeu ?? 10;
        positive(perTeu, "tonnesPerTeu", "Cargo per TEU");
        intensity = { wtt: lane[type].wtt / 1000 / perTeu, ttw: lane[type].ttw / 1000 / perTeu, source: "glec-3.2", ref: "Sea Table 18, container end-user values" };
        label = `Container, ${lane.label}, ${type}`;
        trace.push(`Container intensity: WTT ${lane[type].wtt} + TTW ${lane[type].ttw} g CO₂e/TEU-km ÷ ${num(perTeu)} t per TEU (includes the GLEC distance adjustment)`);
        if (factorSet === "temt-legacy") warnings.push("Production TEMT has no trade-lane factors; the GLEC v3.2 container value is used.");
      } else {
        const vessel = VESSELS.find((item) => item.id === input.vesselId);
        if (!vessel) throw new CalculationError("Choose a supported vessel type and size.", "vesselId");
        const useTemt = factorSet === "temt-legacy" ? vessel.temtTtw !== undefined : !vessel.glec;
        if (useTemt && vessel.temtTtw !== undefined) {
          intensity = t(vessel.temtTtw / 5, vessel.temtTtw);
          if (factorSet === "glec-india") warnings.push("GLEC publishes container vessels by trade lane rather than size; the production TEMT vessel value is used.");
        } else if (vessel.glec) {
          intensity = { wtt: vessel.glec.wtt / 1000, ttw: vessel.glec.ttw / 1000, source: "glec-3.2", ref: "Sea Tables 14–17, VLSFO" };
          if (factorSet === "temt-legacy") warnings.push("Production TEMT has no value for this vessel; the GLEC v3.2 value is used.");
          if ((input.distanceBasis ?? "shortest") === "shortest") uplifts.push({ label: "GLEC sea distance adjustment (shortest route to actual)", multiplier: SEA_DISTANCE_ADJUSTMENT });
        } else {
          throw new CalculationError("No factor is available for this vessel.", "vesselId");
        }
        label = `${vessel.type}, ${vessel.size}`;
      }
    } else {
      const vessel = IWW_VESSELS.find((item) => item.id === (input.iwwVesselId ?? "mv-85-110"));
      if (!vessel) throw new CalculationError("Choose a supported inland vessel.", "iwwVesselId");
      intensity = vessel.f;
      label = vessel.label;
      warnings.push("GLEC inland waterway defaults are based mainly on European operations. Use operator data for Indian National Waterways where available.");
    }
    factor = factorUsed(label, intensity);
    const multiplier = uplifts.reduce((product, uplift) => product * uplift.multiplier, 1);
    const tkm = tonnes * distanceKm;
    ttwKg = tkm * intensity.ttw * multiplier;
    wttKg = tkm * intensity.wtt * multiplier;
    trace.push(`Activity: ${num(tonnes)} t × ${num(distanceKm)} km = ${num(tkm)} t-km`);
    trace.push(`Factor: ${label}. WTT ${num(intensity.wtt, 5)} + TTW ${num(intensity.ttw, 5)} = WTW ${num(intensity.wtt + intensity.ttw, 5)} kg CO₂e/t-km (${SOURCES[intensity.source].publisher}, ${intensity.ref})`);
    for (const uplift of uplifts) trace.push(`${uplift.label}: × ${uplift.multiplier}`);
  }

  const tonneKm = tonnes * distanceKm;
  const wtwKg = ttwKg + wttKg;
  trace.push(`Result: TTW ${num(ttwKg)} + WTT ${num(wttKg)} = ${num(wtwKg)} kg CO₂e well-to-wheel`);
  return { mode: input.mode, method, tonnes, distanceKm, tonneKm, ttwKg, wttKg, wtwKg, intensityG: tonneKm > 0 ? (wtwKg / tonneKm) * 1000 : 0,
    factor: factor!, factorSet, uplifts, dataQuality, trace, warnings };
}

function t(wtt: number, ttw: number): Intensity {
  return { wtt, ttw, source: "temt-production", ref: "Vessel table (WTT = TTW ÷ 5)" };
}

export function calculateHub(input: HubInput, factorSet: FactorSetId = "glec-india"): HubResult {
  const hub = HUB_TYPES[input.type];
  if (!hub) throw new CalculationError("Choose a supported hub type.", "type");
  if (factorSet === "temt-legacy" && input.type === "transshipment") {
    const tonnes = positive(input.tonnes, "tonnes", "Tonnes handled");
    const kg = tonnes * TEMT_COURIER.transshipmentKgPerTonne;
    return { type: input.type, label: input.label || hub.label, wtwKg: kg, ttwKg: kg, wttKg: 0, splitKnown: true, source: "temt-production",
      trace: [`Transshipment: ${num(tonnes)} t × ${TEMT_COURIER.transshipmentKgPerTonne} kg CO₂e/t = ${num(kg)} kg CO₂e (production TEMT)`] };
  }
  const condition = input.condition ?? "ambient";
  const perUnit = hub[condition];
  const quantity = hub.unit === "container" ? positive(input.containers, "containers", "Containers handled") : positive(input.tonnes, "tonnes", "Tonnes handled");
  const kg = quantity * perUnit;
  const conditionLabel = hub.unit === "container" ? (condition === "ambient" ? "ambient" : "temperature-controlled") : condition;
  return { type: input.type, label: input.label || hub.label, wtwKg: kg, ttwKg: 0, wttKg: 0, splitKnown: false, source: "glec-3.2",
    trace: [`${hub.label} (${conditionLabel}): ${num(quantity)} ${hub.unit === "container" ? "containers" : "t"} × ${perUnit} kg CO₂e/${hub.unit} = ${num(kg)} kg CO₂e WTW (GLEC v3.2 Table 3)`] };
}

const QUALITY_RANK: Record<DataQuality, number> = { primary: 0, modelled: 1, default: 2 };

/** Calculate a transport chain: legs plus optional hub operations. */
export function calculateShipment(input: ShipmentInput, factorSet: FactorSetId = "glec-india"): ShipmentResult {
  if (!input.legs?.length) throw new CalculationError("Add at least one transport leg.", "legs");
  const legs = input.legs.map((leg) => calculateLeg(leg, factorSet));
  const hubs = (input.hubs ?? []).map((hub) => calculateHub(hub, factorSet));
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const ttwKg = sum(legs.map((leg) => leg.ttwKg)) + sum(hubs.map((hub) => hub.ttwKg));
  const wttKg = sum(legs.map((leg) => leg.wttKg)) + sum(hubs.map((hub) => hub.wttKg));
  const hubKg = sum(hubs.map((hub) => hub.wtwKg));
  const legWtw = sum(legs.map((leg) => leg.wtwKg));
  const wtwKg = legWtw + hubKg;
  const tonneKm = sum(legs.map((leg) => leg.tonneKm));
  const distanceKm = sum(legs.map((leg) => leg.distanceKm));
  const cargoTonnes = Math.max(...legs.map((leg) => leg.tonnes));
  const worst = legs.reduce<DataQuality>((current, leg) => QUALITY_RANK[leg.dataQuality] > QUALITY_RANK[current] ? leg.dataQuality : current, "primary");
  return { legs, hubs, ttwKg, wttKg, hubKg, wtwKg, tonneKm, distanceKm, cargoTonnes, intensityG: tonneKm > 0 ? (wtwKg / tonneKm) * 1000 : 0,
    kgPerTonne: cargoTonnes > 0 ? wtwKg / cargoTonnes : 0, dataQuality: worst, factorSet, engineVersion: ENGINE_V2_VERSION };
}

// ─── Validation schema for API and file imports ────────────────────────────

const finitePositive = z.number().finite().positive();
export const legInputSchema = z.object({
  mode: z.enum(["road", "rail", "air", "sea", "iww"]),
  method: z.enum(["distance", "fuel", "energy"]).optional(),
  tonnes: finitePositive.max(1e7),
  distanceKm: z.number().finite().min(0).max(40000).optional(),
  distanceBasis: z.enum(["shortest", "actual"]).optional(),
  vehicleClass: z.enum(ROAD_CLASSES.map((item) => item.id) as [RoadClassId, ...RoadClassId[]]).optional(),
  fuel: z.enum(["diesel", "petrol", "cng", "electric"]).optional(),
  refrigerated: z.boolean().optional(),
  courierLeg: z.enum(["first", "mid", "last"]).optional(),
  airService: z.enum(["unknown", "freighter", "belly"]).optional(),
  airScope: z.enum(["domestic", "international"]).optional(),
  seaBasis: z.enum(["lane", "vessel"]).optional(),
  tradeLane: z.string().max(64).optional(),
  containerType: z.enum(["dry", "reefer"]).optional(),
  tonnesPerTeu: finitePositive.max(40).optional(),
  vesselId: z.string().max(80).optional(),
  iwwVesselId: z.string().max(40).optional(),
  fuelId: z.enum(Object.keys(FUELS) as [FuelId, ...FuelId[]]).optional(),
  fuelQuantity: finitePositive.max(1e9).optional(),
  fuelUnit: z.enum(["l", "kg", "kWh"]).optional(),
  allocationShare: z.number().finite().gt(0).max(1).optional(),
  energyKwh: finitePositive.max(1e9).optional(),
  gridKgPerKwh: z.number().finite().min(0).max(2).optional(),
  customFactor: z.object({ label: z.string().max(120), wtt: z.number().finite().min(0).max(10), ttw: z.number().finite().min(0).max(10), quality: z.enum(["primary", "modelled", "default"]).optional() }).optional(),
});
export const hubInputSchema = z.object({
  type: z.enum(Object.keys(HUB_TYPES) as [HubTypeId, ...HubTypeId[]]),
  condition: z.enum(["ambient", "mixed"]).optional(),
  tonnes: finitePositive.max(1e7).optional(),
  containers: finitePositive.max(1e6).optional(),
  label: z.string().max(120).optional(),
});
export const shipmentInputSchema = z.object({ legs: z.array(legInputSchema).min(1).max(12), hubs: z.array(hubInputSchema).max(12).optional() });

export function describeMode(mode: TransportMode) {
  return MODE_LABELS[mode];
}
