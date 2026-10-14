"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowRightLeft, BadgeCheck, Calculator, ChevronDown, Fuel, GitBranch, LoaderCircle, MapPinned, Package, PencilLine, Plane, Plus, Route, RotateCcw, Save, Ship, Snowflake, TrainFront, Truck, Waves, Zap } from "lucide-react";
import { calculateShipment, suggestTradeLane, FUELS, HUB_TYPES, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, ROAD_CLASSES, ROAD_FACTORS, TEU_LOADS, TRADE_LANES, VESSELS, type FuelId, type HubInput, type LegInput, type RoadClassId, type RoadFuel, type ShipmentResult } from "@temt/calculator";
import { buildRecord, vehicleForTonnes } from "@/lib/builders";
import { emissions, emissionsText, fmt, formatDate, todayIso } from "@/lib/format";
import { estimateDistance, hasCoords, measureDistance, type DistanceEstimate, type Place, type PlaceKind } from "@/lib/places";
import { DIRECTION_LABELS, PAID_BY_LABELS, SCOPE_LABELS, scopeOf, type Direction, type LegMeta, type PaidBy, type ShipmentRecord } from "@/lib/records";
import { actions, getState, useSettings, useStore } from "@/lib/store";
import { PlaceInput } from "../place-input";
import { StageBar } from "../charts";
import { CalculationBasis, DISTANCE_LABELS, factorSource } from "../basis";
import { Field, Modal, NumberInput, PageHeader, Segmented, Select, Toggle, cx, useToast } from "../../ui";

type CalcMode = "road" | "courier" | "rail" | "air" | "sea" | "iww";
type Method = "distance" | "fuel";
type DistanceSource = "route" | "manual";
type WeightUnit = "ton" | "kg";
type FuelUnit = "l" | "kg" | "t" | "kWh";

const MODES: { id: CalcMode; label: string; icon: typeof Truck; hint: string }[] = [
  { id: "road", label: "Road", icon: Truck, hint: "Full truckload, own or hired trucks, electric vehicles" },
  { id: "courier", label: "Courier / PTL", icon: Package, hint: "Express and part-truckload through carrier hubs" },
  { id: "rail", label: "Rail", icon: TrainFront, hint: "Indian Railways freight, station to station" },
  { id: "air", label: "Air", icon: Plane, hint: "Domestic and international air cargo" },
  { id: "sea", label: "Sea", icon: Ship, hint: "Coastal and international, container or bulk" },
  { id: "iww", label: "Inland waterway", icon: Waves, hint: "Barges and inland vessels" },
];

/** Fuels and the units they are usually recorded in, per mode, for the fuel-based method. */
const FUEL_OPTIONS: Record<Exclude<CalcMode, "courier">, { id: FuelId; label: string; units: FuelUnit[] }[]> = {
  road: [{ id: "diesel", label: "Diesel", units: ["l", "kg"] }, { id: "petrol", label: "Petrol", units: ["l", "kg"] }, { id: "cng", label: "CNG", units: ["kg"] }, { id: "electricity", label: "Electricity", units: ["kWh"] }],
  rail: [{ id: "diesel", label: "Diesel locomotive", units: ["l", "kg"] }, { id: "electricity", label: "Electric locomotive", units: ["kWh"] }],
  air: [{ id: "jet", label: "Jet fuel (ATF)", units: ["l", "kg", "t"] }],
  sea: [{ id: "vlsfo", label: "Fuel oil (VLSFO)", units: ["t", "kg"] }, { id: "mgo", label: "Marine gas oil", units: ["t", "kg"] }, { id: "lng-marine", label: "LNG", units: ["t", "kg"] }],
  iww: [{ id: "diesel", label: "Diesel", units: ["l", "kg"] }, { id: "mgo", label: "Marine gas oil", units: ["t", "kg"] }],
};
const UNIT_LABEL: Record<FuelUnit, string> = { l: "Litres", kg: "kg", t: "Tonnes", kWh: "kWh" };

/** Transport document numbers by mode, so the reference matches the paperwork. */
const REFERENCE: Record<CalcMode, { label: string; placeholder: string }> = {
  road: { label: "LR number", placeholder: "Lorry receipt, e.g. LR-20481" },
  courier: { label: "AWB or docket number", placeholder: "e.g. 7845 1203 9921" },
  rail: { label: "RR number", placeholder: "Railway receipt, e.g. RR-112093" },
  air: { label: "AWB number", placeholder: "Air waybill, e.g. 098-12345675" },
  sea: { label: "Bill of lading number", placeholder: "e.g. MAEU 213456789" },
  iww: { label: "Consignment note number", placeholder: "e.g. CN-4402" },
};

const PLACE: Record<CalcMode, { kinds: PlaceKind[]; placeholder: string }> = {
  road: { kinds: ["city", "pin"], placeholder: "City, town or 6-digit PIN code" },
  courier: { kinds: ["city", "pin"], placeholder: "City, town or 6-digit PIN code" },
  rail: { kinds: ["station", "city", "pin"], placeholder: "Station name or code, e.g. NDLS" },
  air: { kinds: ["airport", "city"], placeholder: "Airport, city or IATA code" },
  sea: { kinds: ["port", "city"], placeholder: "Port or city" },
  iww: { kinds: ["port", "city"], placeholder: "Terminal city or port" },
};

interface Form {
  method: Method;
  mode: CalcMode;
  origin?: Place;
  destination?: Place;
  distanceSource: DistanceSource;
  manualKm?: number;
  distanceBasis: "shortest" | "actual";
  weight?: number;
  weightUnit: WeightUnit;
  vehicleClass: RoadClassId;
  vehicleAuto: boolean;
  roadFuel: RoadFuel;
  refrigerated: boolean;
  fuelId: FuelId;
  fuelQuantity?: number;
  fuelUnit: FuelUnit;
  sharePercent?: number;
  gridFactor?: number;
  firstMileKm?: number;
  lastMileKm?: number;
  firstVehicle: RoadClassId;
  midVehicle: RoadClassId;
  lastVehicle: RoadClassId;
  airService: "unknown" | "freighter" | "belly";
  seaBasis: "lane" | "vessel";
  tradeLane: string;
  /** Set once the user picks a lane; until then it follows the route. */
  tradeLaneEdited?: boolean;
  containerType: "dry" | "reefer";
  tonnesPerTeu: number;
  vesselId: string;
  iwwVesselId: string;
  useCustom: boolean;
  customWtt?: number;
  customTtw?: number;
  customLabel: string;
  ref: string;
  date: string;
  businessUnit: string;
  commodity: string;
  direction: Direction;
  paidBy: PaidBy;
  notes: string;
}

const initialForm = (businessUnit: string): Form => ({
  method: "distance", mode: "road", distanceSource: "route", distanceBasis: "shortest", weightUnit: "ton", vehicleClass: "gvw-30-50", vehicleAuto: true, roadFuel: "diesel", refrigerated: false,
  fuelId: "diesel", fuelUnit: "l", firstMileKm: 25, lastMileKm: 25, firstVehicle: "gvw-3.5", midVehicle: "gvw-20-30", lastVehicle: "gvw-3.5", airService: "unknown", seaBasis: "lane", tradeLane: "intra-me-india",
  containerType: "dry", tonnesPerTeu: 10, vesselId: VESSELS[8]!.id, iwwVesselId: "mv-85-110", useCustom: false, customLabel: "Carrier-reported emission factor",
  ref: "", date: todayIso(), businessUnit, commodity: "General cargo", direction: "outbound", paidBy: "company", notes: "",
});

const NOT_SPECIFIED: Place = { label: "Not specified", kind: "custom" };

function Step({ n, title, subtitle, children, dataTour, aside }: { n: number; title: string; subtitle?: string; children: ReactNode; dataTour?: string; aside?: ReactNode }) {
  return (
    <section className="card card-pad animate-rise" data-tour={dataTour}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-maroon-600 text-xs font-bold text-white">{n}</span>
          <div><h2 className="text-[15px] font-bold leading-snug">{title}</h2>{subtitle && <p className="mt-0.5 text-[13px] text-grey-600">{subtitle}</p>}</div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Large radio card used for the two top-level choices. */
function Choice({ active, onClick, icon, title, body, badge, disabled }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; body: string; badge?: string; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={cx("flex h-full items-start gap-3 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50", active ? "border-maroon-600 bg-maroon-50 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 bg-white hover:border-maroon-300")}>
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-maroon-600 text-white" : "bg-stone-100 text-grey-600")}>{icon}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold">{title}{badge && <span className={cx("badge", active ? "badge-maroon" : "badge-stone")}>{badge}</span>}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-grey-600">{body}</span>
      </span>
    </button>
  );
}

/** Distance for the route: the Indian Railways network for rail (loaded on demand), estimates for other modes. */
function useRouteDistance(mode: CalcMode, origin?: Place, destination?: Place) {
  const network = mode === "courier" ? "road" : mode;
  const [state, setState] = useState<{ estimate?: DistanceEstimate; loading: boolean }>({ loading: false });
  useEffect(() => {
    const quick = estimateDistance(network, origin, destination);
    if (network !== "rail" || !quick) { setState({ estimate: quick, loading: false }); return; }
    let cancelled = false;
    setState({ loading: true });
    measureDistance("rail", origin, destination).then((estimate) => { if (!cancelled) setState({ estimate, loading: false }); }).catch(() => { if (!cancelled) setState({ estimate: quick, loading: false }); });
    return () => { cancelled = true; };
  }, [network, origin, destination]);
  return state;
}

function buildInput(form: Form, tonnes: number | undefined, distanceKm: number | undefined, estimate: DistanceEstimate | undefined): { legs: LegInput[]; hubs: HubInput[]; legMeta: LegMeta[] } | { error: string } {
  if (!tonnes || tonnes <= 0) return { error: "Enter the cargo weight." };
  const routeMethod = form.distanceSource === "manual" || !estimate ? "user" : estimate.method;
  const meta: LegMeta = { from: form.origin, to: form.destination, distanceMethod: routeMethod };
  const mode = form.mode;
  const share = form.sharePercent ? form.sharePercent / 100 : undefined;

  if (form.method === "fuel") {
    if (mode === "courier") return { error: "Courier shipments use carrier defaults. Choose Road to enter fuel." };
    if (!form.fuelQuantity || form.fuelQuantity <= 0) return { error: form.fuelId === "electricity" ? "Enter the electricity used." : "Enter the fuel used." };
    const base: LegInput = { mode, tonnes, distanceKm: distanceKm ?? 0, ...(mode === "road" ? { vehicleClass: form.vehicleClass } : {}) };
    const leg: LegInput = form.fuelId === "electricity"
      ? { ...base, ...(mode === "road" ? { fuel: "electric" as RoadFuel } : {}), method: "energy", energyKwh: form.fuelQuantity, gridKgPerKwh: form.gridFactor, allocationShare: share }
      : { ...base, method: "fuel", fuelId: form.fuelId, fuelQuantity: form.fuelUnit === "t" ? form.fuelQuantity * 1000 : form.fuelQuantity, fuelUnit: form.fuelUnit === "l" ? "l" : "kg", allocationShare: share };
    return { legs: [leg], hubs: [], legMeta: [{ ...meta, distanceMethod: distanceKm ? routeMethod : "user" }] };
  }

  if (!distanceKm) return { error: form.distanceSource === "manual" ? "Enter the distance." : "Choose the origin and destination, or enter the distance yourself." };
  const custom = form.useCustom && form.customTtw !== undefined ? { customFactor: { label: form.customLabel || "Carrier-reported emission factor", wtt: form.customWtt ?? 0, ttw: form.customTtw } } : {};
  if (mode === "courier") {
    const legs: LegInput[] = [
      { mode: "road", tonnes, distanceKm: form.firstMileKm || 1, vehicleClass: form.firstVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "first" },
      { mode: "road", tonnes, distanceKm, vehicleClass: form.midVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "mid" },
      { mode: "road", tonnes, distanceKm: form.lastMileKm || 1, vehicleClass: form.lastVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "last" },
    ];
    return { legs, hubs: [{ type: "transshipment", tonnes, label: "Origin hub" }, { type: "transshipment", tonnes, label: "Destination hub" }], legMeta: [{ from: form.origin, distanceMethod: "user" }, { distanceMethod: routeMethod }, { to: form.destination, distanceMethod: "user" }] };
  }
  let leg: LegInput;
  if (mode === "road") {
    leg = form.roadFuel === "electric"
      ? { mode: "road", tonnes, distanceKm, vehicleClass: form.vehicleClass, fuel: "electric", method: "energy", gridKgPerKwh: form.gridFactor }
      : { mode: "road", tonnes, distanceKm, vehicleClass: form.vehicleClass, fuel: form.roadFuel, refrigerated: form.refrigerated, ...custom };
  } else if (mode === "rail") leg = { mode: "rail", tonnes, distanceKm, ...custom };
  else if (mode === "air") leg = { mode: "air", tonnes, distanceKm, airService: form.airService, airScope: form.origin?.country && form.destination?.country && (form.origin.country !== "IN" || form.destination.country !== "IN") ? "international" : "domestic", ...custom };
  else if (mode === "sea") leg = { mode: "sea", tonnes, distanceKm, distanceBasis: form.distanceSource === "manual" ? form.distanceBasis : "shortest", seaBasis: form.seaBasis, tradeLane: form.tradeLane, containerType: form.containerType, tonnesPerTeu: form.tonnesPerTeu, vesselId: form.vesselId, ...custom };
  else leg = { mode: "iww", tonnes, distanceKm, iwwVesselId: form.iwwVesselId, ...custom };
  return { legs: [leg], hubs: [], legMeta: [meta] };
}

/** The record's legs back into the form, for editing a saved shipment. */
function formFromRecord(record: ShipmentRecord, current: Form): Form {
  const leg = record.kind === "courier" ? record.input.legs[1]! : record.input.legs[0]!;
  const measured = leg.method === "fuel" || (leg.method === "energy" && leg.energyKwh !== undefined);
  const fuelId: FuelId = leg.method === "energy" ? "electricity" : leg.fuelId ?? "diesel";
  return {
    ...current, method: measured ? "fuel" : "distance", mode: record.kind === "courier" ? "courier" : (leg.mode as CalcMode), origin: record.origin.kind === "custom" && record.origin.label === NOT_SPECIFIED.label ? undefined : record.origin,
    destination: record.destination.kind === "custom" && record.destination.label === NOT_SPECIFIED.label ? undefined : record.destination,
    distanceSource: "manual", manualKm: leg.distanceKm || undefined, weight: leg.tonnes, weightUnit: "ton", vehicleClass: leg.vehicleClass ?? current.vehicleClass, vehicleAuto: false,
    roadFuel: leg.fuel ?? "diesel", refrigerated: !!leg.refrigerated, fuelId, fuelQuantity: leg.method === "energy" ? leg.energyKwh : leg.fuelQuantity, fuelUnit: leg.method === "energy" ? "kWh" : leg.fuelUnit === "l" ? "l" : "kg",
    sharePercent: leg.allocationShare ? leg.allocationShare * 100 : undefined, gridFactor: leg.gridKgPerKwh, airService: leg.airService ?? "unknown", seaBasis: leg.seaBasis ?? "lane", tradeLane: leg.tradeLane ?? current.tradeLane, tradeLaneEdited: true,
    containerType: leg.containerType ?? "dry", tonnesPerTeu: leg.tonnesPerTeu ?? 10, vesselId: leg.vesselId ?? current.vesselId, iwwVesselId: leg.iwwVesselId ?? current.iwwVesselId,
    useCustom: !!leg.customFactor, customWtt: leg.customFactor?.wtt, customTtw: leg.customFactor?.ttw,
    firstMileKm: record.kind === "courier" ? record.input.legs[0]!.distanceKm : current.firstMileKm, lastMileKm: record.kind === "courier" ? record.input.legs[2]!.distanceKm : current.lastMileKm,
    ref: record.ref, date: record.date, businessUnit: record.businessUnit, commodity: record.commodity, direction: record.direction, paidBy: record.paidBy, notes: record.notes ?? "",
  };
}

export function CalculateView() {
  const settings = useSettings();
  const shipments = useStore((state) => state.shipments);
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => initialForm(settings.businessUnits[0] ?? "Operations"));
  const [editing, setEditing] = useState<ShipmentRecord | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [missing, setMissing] = useState({ ref: false, date: false });
  // Wide screens: the result's details scroll inside the panel, so point to the working when it is out of view.
  const details = useRef<HTMLDivElement>(null);
  const basis = useRef<HTMLDivElement>(null);
  const [scrollHint, setScrollHint] = useState({ moreBelow: false, basisBelow: false });
  const checkMore = () => {
    const box = details.current, start = basis.current;
    const next = box && start ? { moreBelow: box.scrollHeight - box.scrollTop - box.clientHeight > 8, basisBelow: start.offsetTop + 40 > box.scrollTop + box.clientHeight } : { moreBelow: false, basisBelow: false };
    setScrollHint((current) => (current.moreBelow === next.moreBelow && current.basisBelow === next.basisBelow ? current : next));
  };
  useEffect(checkMore);
  useEffect(() => { window.addEventListener("resize", checkMore); return () => window.removeEventListener("resize", checkMore); }, []);
  const { moreBelow, basisBelow } = scrollHint;
  const [showRoute, setShowRoute] = useState(false);
  const [duplicate, setDuplicate] = useState<{ existing: ShipmentRecord; record: ShipmentRecord; again: boolean } | null>(null);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const tonnes = form.weight === undefined ? undefined : form.weightUnit === "kg" ? form.weight / 1000 : form.weight;

  // Deep links: ?mode=, ?method=, ?t= from the Copilot and Compare, and ?edit=<id> from the ledger.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") as CalcMode | null;
    if (mode && MODES.some((item) => item.id === mode)) set({ mode });
    if (params.get("method") === "fuel") set({ method: "fuel" });
    const t = Number(params.get("t"));
    if (t > 0) set({ weight: t, weightUnit: "ton" });
    const edit = params.get("edit");
    if (edit) {
      const record = getState().shipments.find((item) => item.id === edit);
      if (record && (record.kind === "single" || record.kind === "courier")) {
        setEditing(record);
        setShowMore(true);
        setShowRoute(true);
        setForm((current) => formFromRecord(record, current));
      } else if (record) router.replace(`/app/chain/?edit=${record.id}`);
    }
  }, [router]);

  const route = useRouteDistance(form.mode, form.origin, form.destination);
  const calculatedKm = route.estimate ? Math.max(1, Math.round(route.estimate.km)) : undefined;
  const distanceKm = form.distanceSource === "manual" ? form.manualKm : calculatedKm;

  // Suggest a truck class that fits the cargo until the user picks one.
  // Before paint, so the result never flashes an intermediate truck class while the weight is typed.
  useLayoutEffect(() => { if (form.vehicleAuto && tonnes) set({ vehicleClass: vehicleForTonnes(tonnes) }); }, [tonnes, form.vehicleAuto]);
  // Container voyages use the trade lane that matches the route until the user picks one.
  useEffect(() => {
    if (form.mode !== "sea" || form.tradeLaneEdited || !form.origin?.country || !form.destination?.country) return;
    const lane = suggestTradeLane(form.origin.country, form.destination.country);
    if (lane !== form.tradeLane) set({ tradeLane: lane });
  }, [form.mode, form.origin, form.destination, form.tradeLaneEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useMemo(() => buildInput(form, tonnes, form.method === "fuel" ? (form.distanceSource === "manual" ? form.manualKm : calculatedKm) : distanceKm, route.estimate), [form, tonnes, distanceKm, calculatedKm, route.estimate]);
  const calc = useMemo<{ result?: ShipmentResult; error?: string }>(() => {
    if ("error" in built) return { error: built.error };
    try { return { result: calculateShipment({ legs: built.legs, hubs: built.hubs }, settings.factorSet) }; } catch (error) { return { error: error instanceof Error ? error.message : "Calculation failed." }; }
  }, [built, settings.factorSet]);

  const fuelOptions = form.mode === "courier" ? [] : FUEL_OPTIONS[form.mode];
  const fuelOption = fuelOptions.find((option) => option.id === form.fuelId) ?? fuelOptions[0];
  const roadFuels = (["diesel", "cng", "petrol"] as const).filter((fuel) => ROAD_FACTORS[settings.factorSet][form.vehicleClass]?.[fuel] || ROAD_FACTORS.temt[form.vehicleClass]?.[fuel]);
  const result = calc.result;
  const headline = result ? emissions(result.wtwKg) : null;
  const mainLeg = result?.legs[form.mode === "courier" ? 1 : 0];
  const vehicle = ROAD_CLASSES.find((item) => item.id === form.vehicleClass)!;
  const scopeKey = scopeOf({ paidBy: form.paidBy }, result?.legs[0]?.method);
  const reference = REFERENCE[form.mode];
  const place = PLACE[form.mode];
  const fuelBased = form.method === "fuel";
  // The optional route stays open while it holds places, for example after switching from the distance-based method.
  const routeOpen = showRoute || !!(form.origin || form.destination);

  const chooseMethod = (method: Method) => set({ method, mode: method === "fuel" && form.mode === "courier" ? "road" : form.mode });
  // Keep the fuel and its unit valid for the mode (for example after switching method or arriving from a link).
  useEffect(() => {
    if (!fuelBased || !fuelOption) return;
    if (form.fuelId !== fuelOption.id || !fuelOption.units.includes(form.fuelUnit)) set({ fuelId: fuelOption.id, fuelUnit: fuelOption.units.includes(form.fuelUnit) ? form.fuelUnit : fuelOption.units[0]! });
  }, [fuelBased, fuelOption, form.fuelId, form.fuelUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseMode = (mode: CalcMode) => {
    const placesChange = (["air", "sea"] as CalcMode[]).includes(mode) || (["air", "sea"] as CalcMode[]).includes(form.mode) || (mode === "rail") !== (form.mode === "rail");
    const options = mode === "courier" ? [] : FUEL_OPTIONS[mode];
    const fuel = options.find((option) => option.id === form.fuelId) ?? options[0];
    set({ mode, origin: placesChange ? undefined : form.origin, destination: placesChange ? undefined : form.destination, fuelId: fuel?.id ?? form.fuelId, fuelUnit: fuel && !fuel.units.includes(form.fuelUnit) ? fuel.units[0]! : form.fuelUnit });
  };
  const chooseFuel = (fuelId: FuelId) => { const option = fuelOptions.find((item) => item.id === fuelId)!; set({ fuelId, fuelUnit: option.units.includes(form.fuelUnit) ? form.fuelUnit : option.units[0]! }); };
  const useManual = () => set({ distanceSource: "manual", manualKm: form.manualKm ?? calculatedKm });

  const commit = (record: ShipmentRecord, again: boolean, replace?: ShipmentRecord) => {
    if (replace) {
      actions.updateShipment(replace.id, { ...record, id: replace.id, createdAt: replace.createdAt, source: replace.source });
      toast({ tone: "ok", message: `Updated ${record.ref}: ${emissionsText(result!.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
    } else {
      actions.addShipments([record]);
      toast({ tone: "ok", message: `Saved ${record.ref}: ${emissionsText(result!.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
    }
    if (editing) { router.push("/app/shipments/"); return; }
    if (again) set({ origin: undefined, destination: undefined, manualKm: undefined, weight: undefined, ref: "", fuelQuantity: undefined });
  };

  const save = (again: boolean) => {
    if (!result || "error" in built) return;
    if (!fuelBased && (!form.origin || !form.destination)) { toast({ tone: "warn", message: "Add an origin and destination to save this shipment." }); return; }
    // The transport document number and dispatch date are what make a saved shipment traceable.
    const gaps = { ref: !form.ref.trim(), date: !form.date };
    if (gaps.ref || gaps.date) {
      setMissing(gaps);
      // After the error message renders, so the layout shift cannot leave the field off screen.
      requestAnimationFrame(() => {
        const field = document.getElementById(gaps.ref ? "reference" : "dispatch-date");
        field?.scrollIntoView({ block: "center" });
        field?.focus({ preventScroll: true });
      });
      return;
    }
    const record = buildRecord({ ref: form.ref.trim(), date: form.date, businessUnit: form.businessUnit, commodity: form.commodity, origin: form.origin ?? NOT_SPECIFIED, destination: form.destination ?? NOT_SPECIFIED, direction: form.direction, paidBy: form.paidBy, kind: form.mode === "courier" ? "courier" : "single", legs: built.legs, legMeta: built.legMeta, hubs: built.hubs, source: "manual", notes: form.notes || undefined });
    if (editing) { commit({ ...record, ref: form.ref.trim() || editing.ref }, again, editing); return; }
    const existing = form.ref.trim() ? shipments.find((item) => item.ref.trim().toLowerCase() === form.ref.trim().toLowerCase()) : undefined;
    if (existing) { setDuplicate({ existing, record, again }); return; }
    commit(record, again);
  };

  let n = 0;
  return (
    <div>
      <PageHeader eyebrow={editing ? `Editing ${editing.ref}` : "Calculate"} title={editing ? "Edit shipment" : "Calculate a shipment"} description="Choose how you want to calculate, then enter only what that method needs. The result updates as you type, with every step shown."
        actions={<><Link prefetch={false} href="/app/compare/" className="btn btn-secondary"><ArrowLeftRight size={16} aria-hidden="true" /> Compare modes</Link><Link prefetch={false} href="/app/chain/" className="btn btn-secondary"><GitBranch size={16} aria-hidden="true" /> Multimodal chain</Link></>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-5">
          <Step n={++n} title="How do you want to calculate?" subtitle="ISO 14083 prefers measured fuel or energy where you have it." dataTour="method-picker">
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Calculation method">
              <Choice active={!fuelBased} onClick={() => chooseMethod("distance")} icon={<Route size={18} aria-hidden="true" />} title="Distance-based" badge="Default factors"
                body="Cargo weight × distance × emission factor. Use when you know the route and the weight." />
              <Choice active={fuelBased} onClick={() => chooseMethod("fuel")} icon={<Fuel size={18} aria-hidden="true" />} title="Fuel-based" badge="Primary data"
                body="Fuel or electricity actually used × its emission factor. Most accurate; the route is optional." />
            </div>
          </Step>

          <Step n={++n} title="Transport mode" dataTour="mode-picker">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Transport mode">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const active = form.mode === mode.id;
                const disabled = fuelBased && mode.id === "courier";
                return (
                  <button key={mode.id} type="button" role="radio" aria-checked={active} disabled={disabled} title={disabled ? "Courier shipments use carrier defaults; choose Road to enter fuel" : mode.hint} onClick={() => chooseMode(mode.id)}
                    className={cx("group flex flex-col items-center gap-2 rounded-xl border px-2 py-3.5 text-center text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", active ? "border-maroon-600 bg-maroon-50 text-maroon-800 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 bg-white text-grey-700 hover:border-maroon-300")}>
                    <Icon size={22} aria-hidden="true" className={active ? "text-maroon-600" : "text-grey-500 group-hover:text-maroon-600"} />{mode.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[13px] text-grey-600">{MODES.find((mode) => mode.id === form.mode)!.hint}.{fuelBased && " Courier is not available for fuel-based calculation because carriers pool many consignments."}</p>
          </Step>

          {fuelBased ? (
            <Step n={++n} title={form.fuelId === "electricity" ? "Electricity used" : "Fuel used"} subtitle="From fuel bills, a fuel card, telematics or charging records.">
              <div className="grid items-start gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><Field label="Fuel or energy">
                  <Segmented ariaLabel="Fuel or energy" value={fuelOption!.id} onChange={chooseFuel} options={fuelOptions.map((option) => ({ value: option.id, label: option.label, icon: option.id === "electricity" ? <Zap size={13} aria-hidden="true" /> : <Fuel size={13} aria-hidden="true" /> }))} />
                </Field></div>
                <Field label="Quantity" htmlFor="fuel-quantity">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1"><NumberInput id="fuel-quantity" value={form.fuelQuantity} suffix={fuelOption!.units.length > 1 ? undefined : form.fuelUnit} onChange={(fuelQuantity) => set({ fuelQuantity })} placeholder={form.fuelUnit === "kWh" ? "e.g. 420" : form.fuelUnit === "t" ? "e.g. 18.5" : "e.g. 315"} /></div>
                    {fuelOption!.units.length > 1 && <Segmented ariaLabel="Fuel unit" value={form.fuelUnit} onChange={(fuelUnit) => set({ fuelUnit })} options={fuelOption!.units.map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }))} />}
                  </div>
                </Field>
                <Field label="Share of this fuel for the cargo" htmlFor="share" hint="For a shared vehicle, e.g. 40%. Leave blank if the vehicle carried only this cargo.">
                  <NumberInput id="share" value={form.sharePercent} suffix="%" onChange={(sharePercent) => set({ sharePercent })} placeholder="100" />
                </Field>
                {form.fuelId === "electricity" ? (
                  <Field label="Electricity emission factor" htmlFor="grid" hint={`Blank uses the CEA all-India grid average, ${INDIA_GRID_KG_PER_KWH} kg CO₂ per kWh. Enter your supplier's factor for renewable power.`}>
                    <NumberInput id="grid" value={form.gridFactor} suffix="kg/kWh" onChange={(gridFactor) => set({ gridFactor })} placeholder={String(INDIA_GRID_KG_PER_KWH)} />
                  </Field>
                ) : (
                  <div className="rounded-xl bg-stone-50 p-3.5 text-[13px] leading-relaxed text-grey-700">
                    <p className="font-semibold text-ink">{FUELS[form.fuelId].label}</p>
                    <p className="mt-0.5">{fmt(FUELS[form.fuelId].wtw, 2)} kg CO₂e per kg, well-to-wheel{FUELS[form.fuelId].density ? ` (${fmt(FUELS[form.fuelId].wtw * FUELS[form.fuelId].density!, 2)} per litre)` : ""}. Source: GLEC Framework v3.2, {FUELS[form.fuelId].ref}.</p>
                  </div>
                )}
              </div>
            </Step>
          ) : (
            <Step n={++n} title="Route and distance" subtitle="Calculate the distance from the route, or enter the distance from your own records." dataTour="route">
              <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
                <Field label={form.mode === "rail" ? "From station" : form.mode === "air" ? "From airport" : form.mode === "sea" ? "From port" : "From"} htmlFor="origin"><PlaceInput id="origin" value={form.origin} onChange={(origin) => set({ origin })} kinds={place.kinds} placeholder={place.placeholder} /></Field>
                <button type="button" className="btn btn-ghost btn-icon justify-self-center md:mt-[26px]" onClick={() => set({ origin: form.destination, destination: form.origin })} aria-label="Swap origin and destination"><ArrowRightLeft size={17} /></button>
                <Field label={form.mode === "rail" ? "To station" : form.mode === "air" ? "To airport" : form.mode === "sea" ? "To port" : "To"} htmlFor="destination"><PlaceInput id="destination" value={form.destination} onChange={(destination) => set({ destination })} kinds={place.kinds} placeholder={place.placeholder} /></Field>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="label">{form.mode === "courier" ? "Line-haul distance (hub to hub)" : "Distance"}</p>
                  <Segmented ariaLabel="Distance source" value={form.distanceSource} onChange={(source) => (source === "manual" ? useManual() : set({ distanceSource: "route" }))}
                    options={[{ value: "route", label: "Calculate from route", icon: <MapPinned size={13} aria-hidden="true" /> }, { value: "manual", label: "Enter manually", icon: <PencilLine size={13} aria-hidden="true" /> }]} />
                </div>
                {form.distanceSource === "route" ? (
                  <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4" aria-live="polite">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-maroon-700 ring-1 ring-stone-200">{route.loading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Calculator size={17} aria-hidden="true" />}</span>
                    {route.loading ? <p className="text-[14px] text-grey-600">Finding the rail route…</p>
                      : route.estimate ? (
                        <div className="min-w-0">
                          <p className="num text-[22px] font-bold leading-tight">{fmt(calculatedKm!, 0)} km</p>
                          <p className="mt-0.5 text-[13px] font-semibold text-grey-800">{DISTANCE_LABELS[route.estimate.method]}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-grey-600">{route.estimate.note}</p>
                          <button type="button" className="mt-1.5 text-[13px] font-semibold text-maroon-700 hover:underline" onClick={useManual}>Have the actual distance? Enter it instead</button>
                        </div>
                      ) : (
                        <p className="text-[14px] text-grey-600">{form.origin && form.destination ? <>One of these places is not on the map, so the distance cannot be calculated. <button type="button" className="font-semibold text-maroon-700 hover:underline" onClick={useManual}>Enter the distance</button>.</> : "Choose both places to calculate the distance."}</p>
                      )}
                  </div>
                ) : (
                  <div className="grid items-start gap-3 md:grid-cols-2">
                    <Field label="Distance travelled" htmlFor="distance" hint="From a trip sheet, GPS record, e-way bill or carrier invoice.">
                      <NumberInput id="distance" value={form.manualKm} suffix="km" onChange={(manualKm) => set({ manualKm })} placeholder="e.g. 1,420" />
                    </Field>
                    {form.mode === "sea" && (
                      <Field label="Distance basis" info="Non-container sea factors assume the shortest feasible route and include a distance adjustment. If you enter the distance the ship actually sailed, the adjustment is skipped.">
                        <Segmented ariaLabel="Distance basis" value={form.distanceBasis} onChange={(distanceBasis) => set({ distanceBasis })} options={[{ value: "shortest", label: "Shortest route" }, { value: "actual", label: "Actual sailed" }]} />
                      </Field>
                    )}
                  </div>
                )}
              </div>
              {form.mode === "courier" && (
                <div className="mt-4 grid items-start gap-3 md:grid-cols-2">
                  <Field label="First mile (pickup to hub)" htmlFor="first-mile"><NumberInput id="first-mile" value={form.firstMileKm} suffix="km" onChange={(firstMileKm) => set({ firstMileKm })} /></Field>
                  <Field label="Last mile (hub to delivery)" htmlFor="last-mile"><NumberInput id="last-mile" value={form.lastMileKm} suffix="km" onChange={(lastMileKm) => set({ lastMileKm })} /></Field>
                </div>
              )}
            </Step>
          )}

          <Step n={++n} title="Cargo">
            <div className="grid items-start gap-4 md:grid-cols-2">
              <Field label="Cargo weight" htmlFor="tonnes" hint="Weight of this shipment, not the vehicle's capacity.">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1"><NumberInput id="tonnes" value={form.weight} onChange={(weight) => set({ weight })} placeholder={form.weightUnit === "ton" ? "e.g. 18" : "e.g. 750"} /></div>
                  <Segmented ariaLabel="Weight unit" value={form.weightUnit} onChange={(weightUnit) => set({ weightUnit, weight: form.weight === undefined || weightUnit === form.weightUnit ? form.weight : weightUnit === "kg" ? form.weight * 1000 : form.weight / 1000 })} options={[{ value: "ton", label: "TON" }, { value: "kg", label: "KG" }]} />
                </div>
              </Field>
              {(form.mode === "road" || form.mode === "courier" || form.mode === "sea") && !fuelBased && form.roadFuel !== "electric" && (
                <Field label="Temperature control">
                  <div className="flex min-h-[42px] items-center"><Toggle checked={form.refrigerated} onChange={(refrigerated) => set({ refrigerated, containerType: refrigerated ? "reefer" : "dry" })} label={<span className="inline-flex items-center gap-1.5"><Snowflake size={14} aria-hidden="true" /> Refrigerated</span>} description={form.mode === "sea" ? "Uses reefer container values" : "Adds TEMT's refrigeration uplift"} /></div>
                </Field>
              )}
            </div>
          </Step>

          {fuelBased && (
            <section className="card animate-rise">
              <button type="button" className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left" onClick={() => setShowRoute(!routeOpen)} aria-expanded={routeOpen}>
                <span className="flex items-center gap-3 text-[15px] font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-maroon-600 text-xs text-white">{++n}</span>Route <span className="text-xs font-normal text-grey-500">Optional: for reporting by lane and emissions per tonne-km</span></span>
                <ChevronDown size={18} className={cx("text-grey-500 transition", routeOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {routeOpen && (
                <div className="grid gap-3 border-t border-stone-200 px-6 py-5">
                  <div className="grid items-start gap-3 md:grid-cols-2">
                    <Field label="From" htmlFor="origin"><PlaceInput id="origin" value={form.origin} onChange={(origin) => set({ origin })} kinds={place.kinds} placeholder={place.placeholder} /></Field>
                    <Field label="To" htmlFor="destination"><PlaceInput id="destination" value={form.destination} onChange={(destination) => set({ destination })} kinds={place.kinds} placeholder={place.placeholder} /></Field>
                  </div>
                  {calculatedKm && <p className="text-[13px] text-grey-600">{fmt(calculatedKm, 0)} km, {DISTANCE_LABELS[route.estimate!.method].toLowerCase()}. Used only for emissions per tonne-km; the emissions come from the fuel.</p>}
                </div>
              )}
            </section>
          )}

          {!fuelBased && (
            <Step n={++n} title={form.mode === "road" ? "Vehicle" : form.mode === "courier" ? "Carrier vehicles" : form.mode === "sea" ? "Vessel or container" : form.mode === "air" ? "Aircraft" : form.mode === "iww" ? "Inland vessel" : "Rail service"}>
              {form.mode === "road" && (
                <div className="grid gap-5">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Truck class">
                    {ROAD_CLASSES.map((item) => (
                      <button key={item.id} type="button" role="radio" aria-checked={form.vehicleClass === item.id} onClick={() => set({ vehicleClass: item.id, vehicleAuto: false })}
                        className={cx("rounded-xl border p-3 text-left transition", form.vehicleClass === item.id ? "border-maroon-600 bg-maroon-50 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 bg-white hover:border-maroon-300")}>
                        <p className="text-[13px] font-bold">{item.label}</p>
                        <p className="mt-0.5 text-xs text-grey-600">{item.gvw} GVW · payload {item.payload}</p>
                        <p className="mt-1 text-[11.5px] text-grey-500">{item.typical}</p>
                      </button>
                    ))}
                  </div>
                  {tonnes && tonnes > vehicle.payloadMaxT && <p className="callout callout-info"><Truck size={16} aria-hidden="true" /> {fmt(tonnes, 1)} ton is more than one {vehicle.label.toLowerCase()} carries. That's fine: emissions scale with tonne-km, so several trucks are covered.</p>}
                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <Field label="Fuel">
                      <Segmented ariaLabel="Fuel" value={form.roadFuel} onChange={(roadFuel) => set({ roadFuel })}
                        options={[...roadFuels.map((fuel) => ({ value: fuel as RoadFuel, label: fuel === "cng" ? "CNG" : fuel[0]!.toUpperCase() + fuel.slice(1), icon: <Fuel size={13} aria-hidden="true" /> })), { value: "electric" as RoadFuel, label: "Electric", icon: <Zap size={13} aria-hidden="true" /> }]} />
                    </Field>
                    {form.roadFuel === "electric" && (
                      <Field label="Electricity emission factor" htmlFor="grid" hint={`Blank uses the CEA all-India grid average, ${INDIA_GRID_KG_PER_KWH} kg CO₂ per kWh.`}>
                        <NumberInput id="grid" value={form.gridFactor} suffix="kg/kWh" onChange={(gridFactor) => set({ gridFactor })} placeholder={String(INDIA_GRID_KG_PER_KWH)} />
                      </Field>
                    )}
                  </div>
                  {form.roadFuel === "electric" && (form.vehicleClass === "gvw-3.5"
                    ? <p className="callout callout-warn"><AlertTriangle size={16} aria-hidden="true" /> Light electric vehicles have no default energy use. <button type="button" className="font-semibold underline" onClick={() => set({ method: "fuel", fuelId: "electricity", fuelUnit: "kWh" })}>Use the fuel-based method with kWh from charging records</button>.</p>
                    : <p className="text-[13px] leading-relaxed text-grey-600">Energy use is estimated for this truck class on Indian loading. For primary data, switch to the fuel-based method and enter kWh from charging records.</p>)}
                </div>
              )}
              {form.mode === "courier" && (
                <div className="grid items-start gap-3 md:grid-cols-3">
                  {([["firstVehicle", "First-mile vehicle"], ["midVehicle", "Line-haul vehicle"], ["lastVehicle", "Last-mile vehicle"]] as const).map(([key, label]) => (
                    <Field key={key} label={label}><Select value={form[key]} onChange={(value) => set({ [key]: value } as Partial<Form>)} options={ROAD_CLASSES.map((item) => ({ value: item.id, label: `${item.label} (${item.gvw})` }))} /></Field>
                  ))}
                  <p className="text-[13px] text-grey-600 md:col-span-3">Includes two hub transshipments ({settings.factorSet === "temt" ? "TEMT courier hub default" : `${HUB_TYPES.transshipment.ambient} kg CO₂e per tonne each, GLEC Table 3`}).{settings.factorSet === "temt" && " Each leg uses TEMT's courier defaults."}</p>
                </div>
              )}
              {form.mode === "rail" && <p className="text-[14px] leading-relaxed text-grey-700">Indian Railways average for mixed diesel and electric traction. The distance is measured station to station; to add road transport to and from the stations, use <Link href="/app/compare/" className="font-semibold text-maroon-700 underline">Compare modes</Link> or the <Link href="/app/chain/" className="font-semibold text-maroon-700 underline">chain builder</Link>.</p>}
              {form.mode === "air" && (
                <Field label="Aircraft type" info="Belly cargo travels in passenger aircraft; freighters carry only cargo. If you don't know, use unknown: a weighted mix.">
                  <Segmented ariaLabel="Aircraft type" value={form.airService} onChange={(airService) => set({ airService })} options={[{ value: "unknown", label: "Unknown mix" }, { value: "belly", label: "Belly hold" }, { value: "freighter", label: "Freighter" }]} />
                </Field>
              )}
              {form.mode === "sea" && (
                <div className="grid gap-4">
                  <Segmented ariaLabel="Sea calculation basis" value={form.seaBasis} onChange={(seaBasis) => set({ seaBasis })} options={[{ value: "lane", label: "Container by trade lane" }, { value: "vessel", label: "Vessel type and size" }]} />
                  {form.seaBasis === "lane" ? (
                    <div className="grid items-start gap-3 md:grid-cols-3">
                      <Field label="Trade lane" hint={form.tradeLaneEdited ? undefined : "Suggested from the route"}><Select value={form.tradeLane} onChange={(tradeLane) => set({ tradeLane, tradeLaneEdited: true })} options={TRADE_LANES.map((lane) => ({ value: lane.id, label: lane.label }))} /></Field>
                      <Field label="Container"><Segmented ariaLabel="Container type" value={form.containerType} onChange={(containerType) => set({ containerType })} options={[{ value: "dry", label: "Dry" }, { value: "reefer", label: "Reefer" }]} /></Field>
                      <Field label="Cargo per TEU"><Select value={String(form.tonnesPerTeu)} onChange={(value) => set({ tonnesPerTeu: Number(value) })} options={TEU_LOADS.map((item) => ({ value: String(item.tonnes), label: `${item.label} (${item.tonnes} t)` }))} /></Field>
                    </div>
                  ) : (
                    <Field label="Vessel type and size"><Select value={form.vesselId} onChange={(vesselId) => set({ vesselId })} options={VESSELS.map((vessel) => ({ value: vessel.id, label: `${vessel.type}, ${vessel.size}` }))} /></Field>
                  )}
                </div>
              )}
              {form.mode === "iww" && <Field label="Inland vessel" hint="International defaults, based mainly on European operations. Use operator data for National Waterways where available."><Select value={form.iwwVesselId} onChange={(iwwVesselId) => set({ iwwVesselId })} options={IWW_VESSELS.map((vessel) => ({ value: vessel.id, label: vessel.label }))} /></Field>}
              {form.mode !== "courier" && form.roadFuel !== "electric" && (
                <div className="mt-5 border-t border-stone-200 pt-4">
                  <Toggle checked={form.useCustom} onChange={(useCustom) => set({ useCustom })} label="Use a carrier-specific emission factor" description="Primary data from your carrier or telematics, in kg CO₂e per tonne-km." />
                  {form.useCustom && (
                    <div className="mt-3 grid items-start gap-3 md:grid-cols-3">
                      <Field label="Name"><input className="input" value={form.customLabel} onChange={(event) => set({ customLabel: event.target.value })} /></Field>
                      <Field label="Tank-to-wheel" htmlFor="custom-ttw"><NumberInput id="custom-ttw" value={form.customTtw} suffix="kg/t-km" onChange={(customTtw) => set({ customTtw })} /></Field>
                      <Field label="Well-to-tank" htmlFor="custom-wtt"><NumberInput id="custom-wtt" value={form.customWtt} suffix="kg/t-km" onChange={(customWtt) => set({ customWtt })} /></Field>
                    </div>
                  )}
                </div>
              )}
            </Step>
          )}

          <Step n={++n} title="Shipment reference" subtitle="Needed to save, so every shipment can be traced to its transport document. Saving a reference that already exists offers to update that shipment.">
            <div className="grid items-start gap-4 md:grid-cols-2">
              <Field label={reference.label} htmlFor="reference" required error={missing.ref ? `Enter the ${reference.label} to save this shipment.` : undefined}>
                <input id="reference" className="input" required aria-invalid={missing.ref} value={form.ref} placeholder={reference.placeholder} onChange={(event) => { set({ ref: event.target.value }); setMissing((current) => ({ ...current, ref: false })); }} />
              </Field>
              <Field label="Dispatch date" htmlFor="dispatch-date" required error={missing.date ? "Enter the dispatch date to save this shipment." : undefined}>
                <input id="dispatch-date" type="date" className="input" required aria-invalid={missing.date} value={form.date} onChange={(event) => { set({ date: event.target.value }); setMissing((current) => ({ ...current, date: false })); }} />
              </Field>
            </div>
            <button type="button" className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-maroon-700" onClick={() => setShowMore(!showMore)} aria-expanded={showMore}>
              <ChevronDown size={15} className={cx("transition", showMore && "rotate-180")} aria-hidden="true" /> More details (optional): business unit, commodity, GHG scope
            </button>
            {showMore && (
              <div className="mt-3 grid items-start gap-3 border-t border-stone-200 pt-4 md:grid-cols-3 animate-fade">
                <Field label="Business unit"><input className="input" list="bu-list" value={form.businessUnit} onChange={(event) => set({ businessUnit: event.target.value })} /><datalist id="bu-list">{[...new Set([...settings.businessUnits, ...shipments.map((row) => row.businessUnit)])].map((unit) => <option key={unit} value={unit} />)}</datalist></Field>
                <Field label="Commodity"><input className="input" value={form.commodity} onChange={(event) => set({ commodity: event.target.value })} /></Field>
                <Field label="Direction"><Select value={form.direction} onChange={(direction) => set({ direction })} options={(Object.keys(DIRECTION_LABELS) as Direction[]).map((key) => ({ value: key, label: DIRECTION_LABELS[key] }))} /></Field>
                <Field label="Who operates or pays" info="Decides the GHG Protocol scope: own fleet is Scope 1 (Scope 2 for EV electricity), purchased transport is Scope 3 Category 4, customer-paid delivery is Category 9."><Select value={form.paidBy} onChange={(paidBy) => set({ paidBy })} options={(Object.keys(PAID_BY_LABELS) as PaidBy[]).map((key) => ({ value: key, label: PAID_BY_LABELS[key] }))} /></Field>
                <div className="md:col-span-2"><Field label="Notes"><input className="input" value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Optional" /></Field></div>
              </div>
            )}
          </Step>
        </div>

        {/* On wide screens the result stays in view: the headline and Save stay put while the working scrolls between them. */}
        <aside className="xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100vh-7.5rem)] xl:flex-col xl:self-start" data-tour="result">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-stone-200 bg-white shadow-[var(--shadow-card)] xl:flex xl:min-h-0 xl:flex-col">
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-maroon-800 via-maroon-800 to-maroon-950 px-6 py-6 text-white">
              <svg className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-white/[0.06]" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="12" /></svg>
              <p className="text-[13px] font-semibold text-maroon-100">Well-to-wheel emissions</p>
              {headline ? <p className="mt-2 flex items-baseline gap-2"><span className="num text-[44px] font-bold leading-none tracking-tight">{headline.value}</span><span className="text-lg font-semibold text-maroon-100">{headline.unit}</span></p>
                : <p className="mt-3 text-[15px] text-maroon-100">{calc.error ?? "Enter the details to see the result."}</p>}
              {result && <p className="mt-2 text-[13px] text-maroon-100">{fuelBased ? `${fmt(form.fuelQuantity ?? 0, 2)} ${form.fuelUnit === "l" ? "litres" : form.fuelUnit === "t" ? "tonnes" : form.fuelUnit} of ${form.fuelId === "electricity" ? "electricity" : FUELS[form.fuelId].label}` : `${fmt(result.cargoTonnes, 2)} ton over ${fmt(result.distanceKm, 0)} km`} · {fuelBased ? "fuel-based" : "distance-based"}</p>}
            </div>
            {result && mainLeg && (
              <div className="relative xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <div ref={details} onScroll={checkMore} className="relative grid gap-5 p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
                <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} />
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {([
                    mainLeg.method === "distance"
                      ? ["Emission factor", `${fmt(result.intensityG, 1)} g CO₂e/t-km`]
                      : ["Emission factor", form.fuelUnit === "l" && FUELS[form.fuelId].density ? `${fmt((mainLeg.factor.wtt + mainLeg.factor.ttw) * FUELS[form.fuelId].density!, 2)} kg CO₂e/litre` : `${fmt(mainLeg.factor.wtt + mainLeg.factor.ttw, 2)} ${mainLeg.factor.unit}`],
                    ["Intensity per ton", `${fmt(result.kgPerTonne, 1)} kg CO₂e/ton`],
                    ["Transport activity", result.tonneKm > 0 ? `${fmt(result.tonneKm, 0)} t-km` : "No route given"],
                    ["Distance", result.distanceKm > 0 ? `${fmt(result.distanceKm, 0)} km · ${form.distanceSource === "manual" ? "entered" : "calculated"}` : "–"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-stone-50 p-3"><dt className="text-xs text-grey-600">{label}</dt><dd className="num mt-0.5 font-bold">{value}</dd></div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <span className="badge badge-maroon">{SCOPE_LABELS[scopeKey].short}</span>
                  <span className={cx("badge", result.dataQuality === "primary" ? "badge-ok" : "badge-stone")}>{result.dataQuality === "primary" && <BadgeCheck size={12} aria-hidden="true" />}{result.dataQuality === "primary" ? "Primary data" : result.dataQuality === "modelled" ? "Modelled data" : "Default factors"}</span>
                  {result.legs.some((leg) => leg.uplifts.length) && <span className="badge badge-info">Adjusted</span>}
                </div>
                <p className="text-[12.5px] leading-relaxed text-grey-600"><span className="font-semibold text-grey-800">Factor source:</span> {factorSource(mainLeg)}.</p>
                {[...new Set(result.legs.flatMap((leg) => leg.warnings))].map((warning, i) => <p key={i} className="callout callout-warn !py-2.5 text-[12.5px]"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{warning}</p>)}
                <div ref={basis}><CalculationBasis result={result} legMeta={"legMeta" in built ? built.legMeta : undefined} defaultOpen /></div>
              </div>
              {moreBelow && (
                <button type="button" onClick={() => details.current?.scrollTo({ top: basisBelow ? basis.current!.offsetTop - 12 : details.current.scrollTop + details.current.clientHeight * 0.8, behavior: "smooth" })}
                  className="absolute inset-x-0 bottom-0 hidden justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-2.5 pt-10 xl:flex">
                  <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12.5px] font-semibold text-maroon-700 shadow-sm ring-1 ring-stone-200"><ChevronDown size={14} aria-hidden="true" /> {basisBelow ? "See how this was calculated" : "More"}</span>
                </button>
              )}
              </div>
            )}
            <div className="grid shrink-0 gap-2 border-t border-stone-200 p-4 sm:grid-cols-2">
              <button type="button" className="btn btn-primary sm:col-span-2" disabled={!result} onClick={() => save(false)}><Save size={16} aria-hidden="true" /> {editing ? "Update shipment" : "Save to shipments"}</button>
              {!editing && <button type="button" className="btn btn-secondary" disabled={!result} onClick={() => save(true)}><Plus size={15} aria-hidden="true" /> Save, add another</button>}
              <button type="button" className={cx("btn btn-ghost", editing && "sm:col-span-2")} onClick={() => { setForm(initialForm(settings.businessUnits[0] ?? "Operations")); setEditing(null); setMissing({ ref: false, date: false }); }}><RotateCcw size={15} aria-hidden="true" /> Reset</button>
            </div>
          </div>
          {result && !fuelBased && form.origin && form.destination && hasCoords(form.origin) && hasCoords(form.destination) && (form.mode === "road" || form.mode === "rail") && (
            <Link prefetch={false} href={`/app/compare/?from=${encodeURIComponent(form.origin.label)}&to=${encodeURIComponent(form.destination.label)}&t=${tonnes}`} className="mt-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-dashed border-maroon-300 bg-maroon-50/60 px-4 py-3 text-[13.5px] font-semibold text-maroon-800 transition hover:bg-maroon-50">
              Could another mode be cleaner? Compare door to door <ArrowLeftRight size={16} aria-hidden="true" />
            </Link>
          )}
        </aside>
      </div>

      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title={`${duplicate?.existing.ref} is already saved`} footer={duplicate && <>
        <button type="button" className="btn btn-ghost" onClick={() => setDuplicate(null)}>Cancel</button>
        <button type="button" className="btn btn-secondary" onClick={() => { commit({ ...duplicate.record }, duplicate.again); setDuplicate(null); }}>Keep both</button>
        <button type="button" className="btn btn-primary" onClick={() => { commit(duplicate.record, duplicate.again, duplicate.existing); setDuplicate(null); }}>Update the saved shipment</button>
      </>}>
        {duplicate && (
          <div className="grid gap-3 text-[14px] text-grey-700">
            <p>A shipment with this reference was saved on {formatDate(duplicate.existing.date)}: {duplicate.existing.origin.label} → {duplicate.existing.destination.label}.</p>
            <p>Update it with this calculation, so the reference stays linked to one shipment, or keep both as separate shipments.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
