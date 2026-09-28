"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowRightLeft, BadgeCheck, ChevronDown, Fuel, GitBranch, Package, Plane, Plus, RotateCcw, Save, Ship, Snowflake, TrainFront, Truck, Waves, Zap } from "lucide-react";
import { calculateShipment, suggestTradeLane, FACTOR_SETS, HUB_TYPES, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, ROAD_CLASSES, ROAD_FACTORS, SOURCES, TEU_LOADS, TRADE_LANES, VESSELS, type HubInput, type LegInput, type RoadClassId, type RoadFuel, type ShipmentResult } from "@temt/calculator";
import { buildRecord, vehicleForTonnes } from "@/lib/builders";
import { emissions, emissionsText, fmt, todayIso } from "@/lib/format";
import { estimateDistance, hasCoords, type Place, type PlaceKind } from "@/lib/places";
import { DIRECTION_LABELS, PAID_BY_LABELS, SCOPE_LABELS, scopeOf, type Direction, type LegMeta, type PaidBy, type ShipmentRecord } from "@/lib/records";
import { actions, getState, useSettings, useStore } from "@/lib/store";
import { PlaceInput } from "../place-input";
import { StageBar } from "../charts";
import { CalculationBasis } from "../basis";
import { Field, InfoTip, NumberInput, PageHeader, Segmented, Select, Toggle, cx, useToast } from "../../ui";

type CalcMode = "road" | "courier" | "rail" | "air" | "sea" | "iww";
type Method = "distance" | "fuel" | "energy";

const MODES: { id: CalcMode; label: string; icon: typeof Truck; hint: string }[] = [
  { id: "road", label: "Road", icon: Truck, hint: "Full truckload, own or hired trucks, electric vehicles" },
  { id: "courier", label: "Courier / PTL", icon: Package, hint: "Express and part-truckload via carrier hubs" },
  { id: "rail", label: "Rail", icon: TrainFront, hint: "Indian Railways freight, station to station" },
  { id: "air", label: "Air", icon: Plane, hint: "Domestic and international air cargo" },
  { id: "sea", label: "Sea", icon: Ship, hint: "Coastal and international, container or bulk" },
  { id: "iww", label: "Inland waterway", icon: Waves, hint: "Barges and inland vessels" },
];

interface Form {
  mode: CalcMode;
  origin?: Place;
  destination?: Place;
  distanceKm?: number;
  distanceEdited: boolean;
  distanceBasis: "shortest" | "actual";
  tonnes?: number;
  weightUnit: "t" | "kg";
  vehicleClass: RoadClassId;
  vehicleAuto: boolean;
  fuel: RoadFuel;
  refrigerated: boolean;
  method: Method;
  fuelQuantity?: number;
  fuelUnit: "l" | "kg";
  allocationPercent?: number;
  energyKwh?: number;
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
  mode: "road", distanceEdited: false, distanceBasis: "shortest", weightUnit: "t", vehicleClass: "gvw-30-50", vehicleAuto: true, fuel: "diesel", refrigerated: false, method: "distance", fuelUnit: "l",
  firstMileKm: 25, lastMileKm: 25, firstVehicle: "gvw-3.5", midVehicle: "gvw-20-30", lastVehicle: "gvw-3.5", airService: "unknown", seaBasis: "lane", tradeLane: "intra-me-india", containerType: "dry", tonnesPerTeu: 10,
  vesselId: VESSELS[8]!.id, iwwVesselId: "mv-85-110", useCustom: false, customLabel: "Carrier-reported intensity", ref: "", date: todayIso(), businessUnit, commodity: "General cargo", direction: "outbound", paidBy: "company", notes: "",
});

const kindsFor = (mode: CalcMode): PlaceKind[] => (mode === "air" ? ["airport", "city"] : mode === "sea" ? ["port", "city"] : ["city", "pin"]);

function Section({ n, title, children, dataTour, aside }: { n: number; title: string; children: ReactNode; dataTour?: string; aside?: ReactNode }) {
  return (
    <section className="card card-pad animate-rise" data-tour={dataTour}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-[15px] font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-maroon-600 text-xs text-white">{n}</span>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function buildInput(form: Form, tonnes: number | undefined): { legs: LegInput[]; hubs: HubInput[]; legMeta: LegMeta[] } | { error: string } {
  if (!tonnes || tonnes <= 0) return { error: "Enter the cargo weight." };
  const distance = form.distanceKm;
  const meta: LegMeta = { from: form.origin, to: form.destination, distanceMethod: form.distanceEdited ? "user" : form.mode === "air" ? "great-circle" : form.mode === "sea" ? "sea-route" : form.mode === "rail" ? "rail-estimate" : "road-estimate" };
  const custom = form.useCustom && form.customTtw !== undefined ? { customFactor: { label: form.customLabel || "Carrier-reported intensity", wtt: form.customWtt ?? 0, ttw: form.customTtw } } : {};
  if (form.mode === "courier") {
    if (!distance) return { error: "Choose origin and destination, or enter the line-haul distance." };
    const legs: LegInput[] = [
      { mode: "road", tonnes, distanceKm: form.firstMileKm || 1, vehicleClass: form.firstVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "first" },
      { mode: "road", tonnes, distanceKm: distance, vehicleClass: form.midVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "mid" },
      { mode: "road", tonnes, distanceKm: form.lastMileKm || 1, vehicleClass: form.lastVehicle, fuel: "diesel", refrigerated: form.refrigerated, courierLeg: "last" },
    ];
    return { legs, hubs: [{ type: "transshipment", tonnes, label: "Origin hub" }, { type: "transshipment", tonnes, label: "Destination hub" }], legMeta: [{ from: form.origin, distanceMethod: "user" }, { distanceMethod: meta.distanceMethod }, { to: form.destination, distanceMethod: "user" }] };
  }
  let leg: LegInput;
  if (form.mode === "road") {
    leg = { mode: "road", tonnes, distanceKm: distance, vehicleClass: form.vehicleClass, fuel: form.fuel, refrigerated: form.refrigerated, ...custom };
    if (form.fuel === "electric" || form.method === "energy") leg = { ...leg, fuel: "electric", method: "energy", energyKwh: form.energyKwh, gridKgPerKwh: form.gridFactor, allocationShare: form.allocationPercent ? form.allocationPercent / 100 : undefined, customFactor: undefined };
    else if (form.method === "fuel") leg = { ...leg, method: "fuel", fuelId: form.fuel === "cng" ? "cng" : form.fuel === "petrol" ? "petrol" : "diesel", fuelQuantity: form.fuelQuantity, fuelUnit: form.fuel === "cng" ? "kg" : form.fuelUnit, allocationShare: form.allocationPercent ? form.allocationPercent / 100 : undefined, customFactor: undefined };
    else if (!distance) return { error: "Choose origin and destination, or enter the distance." };
  } else {
    if (!distance) return { error: "Choose origin and destination, or enter the distance." };
    if (form.mode === "rail") leg = { mode: "rail", tonnes, distanceKm: distance, ...custom };
    else if (form.mode === "air") leg = { mode: "air", tonnes, distanceKm: distance, airService: form.airService, airScope: form.origin?.country && form.destination?.country && (form.origin.country !== "IN" || form.destination.country !== "IN") ? "international" : "domestic", ...custom };
    else if (form.mode === "sea") leg = { mode: "sea", tonnes, distanceKm: distance, distanceBasis: form.distanceEdited ? form.distanceBasis : "shortest", seaBasis: form.seaBasis, tradeLane: form.tradeLane, containerType: form.containerType, tonnesPerTeu: form.tonnesPerTeu, vesselId: form.vesselId, ...custom };
    else leg = { mode: "iww", tonnes, distanceKm: distance, iwwVesselId: form.iwwVesselId, ...custom };
  }
  return { legs: [leg], hubs: [], legMeta: [meta] };
}

export function CalculateView() {
  const settings = useSettings();
  const shipments = useStore((state) => state.shipments);
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => initialForm(settings.businessUnits[0] ?? "Operations"));
  const [editing, setEditing] = useState<ShipmentRecord | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const tonnes = form.tonnes === undefined ? undefined : form.weightUnit === "kg" ? form.tonnes / 1000 : form.tonnes;

  // Deep links: ?mode=, ?from=&to=&t= from the Copilot and Compare, and ?edit=<id> from the ledger.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") as CalcMode | null;
    if (mode && MODES.some((item) => item.id === mode)) set({ mode });
    const t = Number(params.get("t"));
    if (t > 0) set({ tonnes: t });
    const edit = params.get("edit");
    if (edit) {
      const record = getState().shipments.find((item) => item.id === edit);
      if (record && (record.kind === "single" || record.kind === "courier")) {
        const leg = record.kind === "courier" ? record.input.legs[1]! : record.input.legs[0]!;
        setEditing(record);
        setShowDetails(true);
        setForm((current) => ({
          ...current, mode: record.kind === "courier" ? "courier" : (leg.mode as CalcMode), origin: record.origin, destination: record.destination, distanceKm: leg.distanceKm, distanceEdited: true, tonnes: leg.tonnes, weightUnit: "t",
          vehicleClass: leg.vehicleClass ?? current.vehicleClass, vehicleAuto: false, fuel: leg.fuel ?? "diesel", refrigerated: !!leg.refrigerated, method: leg.method ?? "distance", fuelQuantity: leg.fuelQuantity, fuelUnit: leg.fuelUnit === "kg" ? "kg" : "l",
          energyKwh: leg.energyKwh, gridFactor: leg.gridKgPerKwh, airService: leg.airService ?? "unknown", seaBasis: leg.seaBasis ?? "lane", tradeLane: leg.tradeLane ?? current.tradeLane, tradeLaneEdited: true, containerType: leg.containerType ?? "dry",
          tonnesPerTeu: leg.tonnesPerTeu ?? 10, vesselId: leg.vesselId ?? current.vesselId, iwwVesselId: leg.iwwVesselId ?? current.iwwVesselId, useCustom: !!leg.customFactor, customWtt: leg.customFactor?.wtt, customTtw: leg.customFactor?.ttw,
          firstMileKm: record.kind === "courier" ? record.input.legs[0]!.distanceKm : current.firstMileKm, lastMileKm: record.kind === "courier" ? record.input.legs[2]!.distanceKm : current.lastMileKm,
          ref: record.ref, date: record.date, businessUnit: record.businessUnit, commodity: record.commodity, direction: record.direction, paidBy: record.paidBy, notes: record.notes ?? "",
        }));
      } else if (record) router.replace(`/app/chain/?edit=${record.id}`);
    }
  }, [router]);

  // Auto distance whenever the route or mode changes (unless the user typed a distance).
  useEffect(() => {
    if (form.distanceEdited) return;
    const estimate = estimateDistance(form.mode === "courier" ? "road" : form.mode, form.origin, form.destination);
    set({ distanceKm: estimate ? Math.round(estimate.km) : undefined });
  }, [form.origin, form.destination, form.mode, form.distanceEdited]);

  // Suggest a truck class that fits the cargo until the user picks one.
  // Before paint, so the result never flashes an intermediate truck class while the weight is typed.
  useLayoutEffect(() => { if (form.vehicleAuto && tonnes) set({ vehicleClass: vehicleForTonnes(tonnes) }); }, [tonnes, form.vehicleAuto]);
  // Container voyages use the trade lane that matches the route until the user picks one.
  useEffect(() => {
    if (form.mode !== "sea" || form.tradeLaneEdited || !form.origin?.country || !form.destination?.country) return;
    const lane = suggestTradeLane(form.origin.country, form.destination.country);
    if (lane !== form.tradeLane) set({ tradeLane: lane });
  }, [form.mode, form.origin, form.destination, form.tradeLaneEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimate = useMemo(() => estimateDistance(form.mode === "courier" ? "road" : form.mode, form.origin, form.destination), [form.origin, form.destination, form.mode]);
  const built = useMemo(() => buildInput(form, tonnes), [form, tonnes]);
  const calc = useMemo<{ result?: ShipmentResult; error?: string }>(() => {
    if ("error" in built) return { error: built.error };
    try { return { result: calculateShipment({ legs: built.legs, hubs: built.hubs }, settings.factorSet) }; } catch (error) { return { error: error instanceof Error ? error.message : "Calculation failed." }; }
  }, [built, settings.factorSet]);

  const availableFuels = (["diesel", "cng", "petrol"] as const).filter((fuel) => ROAD_FACTORS[settings.factorSet][form.vehicleClass]?.[fuel] || ROAD_FACTORS["glec-india"][form.vehicleClass]?.[fuel] || ROAD_FACTORS["temt"][form.vehicleClass]?.[fuel]);
  const result = calc.result;
  const headline = result ? emissions(result.wtwKg) : null;

  const save = (again: boolean) => {
    if (!result || "error" in built || !form.origin || !form.destination) { toast({ tone: "warn", message: "Add an origin and destination to save this shipment." }); return; }
    const record = buildRecord({ ref: form.ref, date: form.date, businessUnit: form.businessUnit, commodity: form.commodity, origin: form.origin, destination: form.destination, direction: form.direction, paidBy: form.paidBy, kind: form.mode === "courier" ? "courier" : "single", legs: built.legs, legMeta: built.legMeta, hubs: built.hubs, source: "manual", notes: form.notes || undefined });
    if (editing) {
      actions.updateShipment(editing.id, { ...record, id: editing.id, createdAt: editing.createdAt, ref: form.ref || editing.ref, source: editing.source });
      toast({ tone: "ok", message: `Updated ${form.ref || editing.ref}.` });
      router.push("/app/shipments/");
      return;
    }
    actions.addShipments([record]);
    toast({ tone: "ok", message: `Saved ${record.ref}: ${emissionsText(result.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
    if (again) set({ origin: undefined, destination: undefined, distanceKm: undefined, distanceEdited: false, tonnes: undefined, ref: "", fuelQuantity: undefined, energyKwh: undefined });
  };

  const vehicle = ROAD_CLASSES.find((item) => item.id === form.vehicleClass)!;
  const scopeKey = scopeOf({ paidBy: form.paidBy }, result?.legs[0]?.method);

  return (
    <div>
      <PageHeader eyebrow={editing ? `Editing ${editing.ref}` : "Calculate"} title={editing ? "Edit shipment" : "Calculate a shipment"} description="Pick a mode, enter the route and cargo. The result updates as you type, with its basis traced to published sources."
        actions={<><Link prefetch={false} href="/app/compare/" className="btn btn-secondary"><ArrowLeftRight size={16} aria-hidden="true" /> Compare modes</Link><Link prefetch={false} href="/app/chain/" className="btn btn-secondary"><GitBranch size={16} aria-hidden="true" /> Multimodal chain</Link></>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-5">
          <Section n={1} title="Transport mode" dataTour="mode-picker">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Transport mode">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const active = form.mode === mode.id;
                return (
                  <button key={mode.id} type="button" role="radio" aria-checked={active} title={mode.hint} onClick={() => set({ mode: mode.id, origin: mode.id === "air" || mode.id === "sea" || form.mode === "air" || form.mode === "sea" ? undefined : form.origin, destination: mode.id === "air" || mode.id === "sea" || form.mode === "air" || form.mode === "sea" ? undefined : form.destination, distanceEdited: false })}
                    className={cx("group flex flex-col items-center gap-2 rounded-xl border px-2 py-3.5 text-center text-[13px] font-semibold transition", active ? "border-maroon-600 bg-maroon-50 text-maroon-800 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 bg-white text-grey-700 hover:border-maroon-300")}>
                    <Icon size={22} aria-hidden="true" className={active ? "text-maroon-600" : "text-grey-500 group-hover:text-maroon-600"} />{mode.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[13px] text-grey-600">{MODES.find((mode) => mode.id === form.mode)!.hint}.</p>
          </Section>

          <Section n={2} title="Route and distance" dataTour="route">
            <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
              <Field label="Origin" htmlFor="origin"><PlaceInput id="origin" value={form.origin} onChange={(origin) => set({ origin, distanceEdited: false })} kinds={kindsFor(form.mode)} placeholder={form.mode === "air" ? "Airport, city or IATA code" : form.mode === "sea" ? "Port or city" : "City or PIN code"} /></Field>
              <button type="button" className="btn btn-ghost btn-icon mb-0.5 justify-self-center" onClick={() => set({ origin: form.destination, destination: form.origin })} aria-label="Swap origin and destination"><ArrowRightLeft size={17} /></button>
              <Field label="Destination" htmlFor="destination"><PlaceInput id="destination" value={form.destination} onChange={(destination) => set({ destination, distanceEdited: false })} kinds={kindsFor(form.mode)} placeholder={form.mode === "air" ? "Airport, city or IATA code" : form.mode === "sea" ? "Port or city" : "City or PIN code"} /></Field>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label={form.mode === "courier" ? "Line-haul distance (hub to hub)" : form.mode === "air" ? "Flight distance (great-circle)" : "Distance"} htmlFor="distance"
                hint={form.distanceEdited ? <button type="button" className="font-semibold text-maroon-700 hover:underline" onClick={() => set({ distanceEdited: false })}>Use the estimate instead</button> : estimate?.note ?? "Pick both places to estimate, or type the actual distance."}>
                <NumberInput id="distance" value={form.distanceKm} suffix="km" onChange={(distanceKm) => set({ distanceKm, distanceEdited: true })} placeholder="e.g. 1,420" />
              </Field>
              {form.mode === "sea" && form.distanceEdited && (
                <Field label="Distance basis" info="Non-container sea factors assume the shortest feasible route and include a distance adjustment. If you enter the distance the ship actually sailed, the adjustment is skipped.">
                  <Segmented ariaLabel="Distance basis" value={form.distanceBasis} onChange={(distanceBasis) => set({ distanceBasis })} options={[{ value: "shortest", label: "Shortest route" }, { value: "actual", label: "Actual sailed" }]} />
                </Field>
              )}
              {form.origin && form.destination && !hasCoords(form.origin) && !form.distanceKm && <p className="callout callout-warn md:col-span-2"><AlertTriangle size={16} aria-hidden="true" /> Custom locations have no coordinates. Enter the distance manually.</p>}
            </div>
            {form.mode === "courier" && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="First mile (pickup to carrier hub)"><NumberInput value={form.firstMileKm} suffix="km" onChange={(firstMileKm) => set({ firstMileKm })} /></Field>
                <Field label="Last mile (carrier hub to delivery)"><NumberInput value={form.lastMileKm} suffix="km" onChange={(lastMileKm) => set({ lastMileKm })} /></Field>
              </div>
            )}
          </Section>

          <Section n={3} title="Cargo" aside={<Segmented ariaLabel="Weight unit" size="sm" value={form.weightUnit} onChange={(weightUnit) => set({ weightUnit, tonnes: form.tonnes === undefined ? undefined : weightUnit === "kg" ? form.tonnes * (form.weightUnit === "t" ? 1000 : 1) : form.tonnes / (form.weightUnit === "kg" ? 1000 : 1) })} options={[{ value: "t", label: "Tonnes" }, { value: "kg", label: "kg" }]} />}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Cargo weight" htmlFor="tonnes" hint="Actual weight carried for this shipment (not vehicle capacity)."><NumberInput id="tonnes" value={form.tonnes} suffix={form.weightUnit} onChange={(value) => set({ tonnes: value })} placeholder={form.weightUnit === "t" ? "e.g. 18" : "e.g. 750"} /></Field>
              <Field label="Temperature control" htmlFor="reefer"><div className="flex min-h-[42px] items-center"><Toggle checked={form.refrigerated} onChange={(refrigerated) => set({ refrigerated, containerType: refrigerated ? "reefer" : "dry" })} label={<span className="inline-flex items-center gap-1.5"><Snowflake size={14} aria-hidden="true" /> Refrigerated</span>} description={form.mode === "road" || form.mode === "courier" ? "Applies TEMT's refrigeration uplift" : form.mode === "sea" ? "Uses reefer container values" : "No effect for this mode"} /></div></Field>
            </div>
          </Section>

          <Section n={4} title={form.mode === "road" ? "Vehicle and method" : form.mode === "courier" ? "Carrier vehicles" : form.mode === "sea" ? "Vessel or container" : form.mode === "air" ? "Aircraft" : form.mode === "iww" ? "Inland vessel" : "Service"}>
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
                {tonnes && tonnes > vehicle.payloadMaxT && <p className="callout callout-info"><Truck size={16} aria-hidden="true" /> {fmt(tonnes, 1)} t exceeds one {vehicle.label.toLowerCase()}'s payload. That's fine: emissions scale with tonne-km, so multiple trucks are covered.</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Fuel or energy">
                    <Segmented ariaLabel="Fuel" value={form.fuel} onChange={(fuel) => set({ fuel, method: fuel === "electric" ? "energy" : form.method === "energy" ? "distance" : form.method })}
                      options={[...availableFuels.map((fuel) => ({ value: fuel as RoadFuel, label: fuel === "cng" ? "CNG" : fuel[0]!.toUpperCase() + fuel.slice(1), icon: <Fuel size={13} aria-hidden="true" /> })), { value: "electric" as RoadFuel, label: "Electric", icon: <Zap size={13} aria-hidden="true" /> }]} />
                  </Field>
                  {form.fuel !== "electric" && (
                    <Field label="Calculation method" info="Distance-based uses published default factors. Fuel-based uses the fuel you actually bought, which counts as primary data under ISO 14083.">
                      <Segmented ariaLabel="Method" value={form.method === "energy" ? "distance" : form.method} onChange={(method) => set({ method })} options={[{ value: "distance", label: "Distance-based" }, { value: "fuel", label: "Fuel-based" }]} />
                    </Field>
                  )}
                </div>
                {form.method === "fuel" && form.fuel !== "electric" && (
                  <div className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-3">
                    <Field label="Fuel used"><NumberInput value={form.fuelQuantity} suffix={form.fuel === "cng" ? "kg" : form.fuelUnit} onChange={(fuelQuantity) => set({ fuelQuantity })} placeholder="e.g. 315" /></Field>
                    {form.fuel !== "cng" && <Field label="Unit"><Segmented ariaLabel="Fuel unit" value={form.fuelUnit} onChange={(fuelUnit) => set({ fuelUnit })} options={[{ value: "l", label: "Litres" }, { value: "kg", label: "kg" }]} /></Field>}
                    <Field label="Share for this cargo" hint="For shared trucks, e.g. 40%. Leave blank for 100%."><NumberInput value={form.allocationPercent} suffix="%" onChange={(allocationPercent) => set({ allocationPercent })} placeholder="100" /></Field>
                  </div>
                )}
                {form.fuel === "electric" && (
                  <div className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-3">
                    <Field label="Electricity used" hint={form.vehicleClass === "gvw-3.5" ? "Required for light EVs." : "Blank uses an estimate from international data."}><NumberInput value={form.energyKwh} suffix="kWh" onChange={(energyKwh) => set({ energyKwh })} placeholder="From charging logs" /></Field>
                    <Field label="Electricity factor" hint={`Blank uses CEA V21.0 grid average (${INDIA_GRID_KG_PER_KWH}). Enter your renewable contract's factor.`}><NumberInput value={form.gridFactor} suffix="kg/kWh" onChange={(gridFactor) => set({ gridFactor })} placeholder={String(INDIA_GRID_KG_PER_KWH)} /></Field>
                    <Field label="Share for this cargo"><NumberInput value={form.allocationPercent} suffix="%" onChange={(allocationPercent) => set({ allocationPercent })} placeholder="100" /></Field>
                  </div>
                )}
              </div>
            )}
            {form.mode === "courier" && (
              <div className="grid gap-3 md:grid-cols-3">
                {([["firstVehicle", "First-mile vehicle"], ["midVehicle", "Line-haul vehicle"], ["lastVehicle", "Last-mile vehicle"]] as const).map(([key, label]) => (
                  <Field key={key} label={label}><Select value={form[key]} onChange={(value) => set({ [key]: value } as Partial<Form>)} options={ROAD_CLASSES.map((item) => ({ value: item.id, label: `${item.label} (${item.gvw})` }))} /></Field>
                ))}
                <p className="text-[13px] text-grey-600 md:col-span-3">Includes two hub transshipments ({settings.factorSet === "temt" ? "TEMT courier hub default" : `${HUB_TYPES.transshipment.ambient} kg CO₂e per tonne each, GLEC Table 3`}).{settings.factorSet === "temt" && " Each leg uses TEMT's courier defaults."}</p>
              </div>
            )}
            {form.mode === "rail" && <p className="text-[14px] text-grey-700">Indian Railways average for mixed diesel and electric traction ({FACTOR_SETS[settings.factorSet].short}). For door-to-door rail with road drayage, use <Link href="/app/compare/" className="font-semibold text-maroon-700 underline">Compare modes</Link> or the <Link href="/app/chain/" className="font-semibold text-maroon-700 underline">chain builder</Link>.</p>}
            {form.mode === "air" && (
              <Field label="Aircraft type" info="Belly cargo travels in passenger aircraft; freighters carry only cargo. If you don't know, use unknown: a weighted mix.">
                <Segmented ariaLabel="Aircraft type" value={form.airService} onChange={(airService) => set({ airService })} options={[{ value: "unknown", label: "Unknown mix" }, { value: "belly", label: "Belly hold" }, { value: "freighter", label: "Freighter" }]} />
              </Field>
            )}
            {form.mode === "sea" && (
              <div className="grid gap-4">
                <Segmented ariaLabel="Sea calculation basis" value={form.seaBasis} onChange={(seaBasis) => set({ seaBasis })} options={[{ value: "lane", label: "Container by trade lane" }, { value: "vessel", label: "Vessel type and size" }]} />
                {form.seaBasis === "lane" ? (
                  <div className="grid gap-3 md:grid-cols-3">
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
            {form.mode !== "courier" && !(form.mode === "road" && form.method !== "distance") && form.fuel !== "electric" && (
              <div className="mt-5 border-t border-stone-200 pt-4">
                <Toggle checked={form.useCustom} onChange={(useCustom) => set({ useCustom })} label="Use a carrier-specific intensity" description="Primary data from your carrier or telematics, in kg CO₂e per tonne-km." />
                {form.useCustom && (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Field label="Label"><input className="input" value={form.customLabel} onChange={(event) => set({ customLabel: event.target.value })} /></Field>
                    <Field label="Tank-to-wheel"><NumberInput value={form.customTtw} suffix="kg/t-km" onChange={(customTtw) => set({ customTtw })} /></Field>
                    <Field label="Well-to-tank"><NumberInput value={form.customWtt} suffix="kg/t-km" onChange={(customWtt) => set({ customWtt })} /></Field>
                  </div>
                )}
              </div>
            )}
          </Section>

          <section className="card animate-rise">
            <button type="button" className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails}>
              <span className="flex items-center gap-3 text-[15px] font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-maroon-600 text-xs text-white">5</span>Reporting details <span className="text-xs font-normal text-grey-500">Date, business unit, scope</span></span>
              <ChevronDown size={18} className={cx("text-grey-500 transition", showDetails && "rotate-180")} aria-hidden="true" />
            </button>
            {showDetails && (
              <div className="grid gap-3 border-t border-stone-200 px-6 py-5 md:grid-cols-3">
                <Field label="Reference" hint="LR, invoice or e-way bill number"><input className="input" value={form.ref} placeholder="Auto" onChange={(event) => set({ ref: event.target.value })} /></Field>
                <Field label="Dispatch date"><input type="date" className="input" value={form.date} onChange={(event) => set({ date: event.target.value })} /></Field>
                <Field label="Business unit"><input className="input" list="bu-list" value={form.businessUnit} onChange={(event) => set({ businessUnit: event.target.value })} /><datalist id="bu-list">{[...new Set([...settings.businessUnits, ...shipments.map((row) => row.businessUnit)])].map((unit) => <option key={unit} value={unit} />)}</datalist></Field>
                <Field label="Commodity"><input className="input" value={form.commodity} onChange={(event) => set({ commodity: event.target.value })} /></Field>
                <Field label="Direction"><Select value={form.direction} onChange={(direction) => set({ direction })} options={(Object.keys(DIRECTION_LABELS) as Direction[]).map((key) => ({ value: key, label: DIRECTION_LABELS[key] }))} /></Field>
                <Field label="Who operates or pays" info="Decides the GHG Protocol scope: own fleet is Scope 1 (Scope 2 for EV electricity), purchased transport is Scope 3 Category 4, customer-paid delivery is Category 9."><Select value={form.paidBy} onChange={(paidBy) => set({ paidBy })} options={(Object.keys(PAID_BY_LABELS) as PaidBy[]).map((key) => ({ value: key, label: PAID_BY_LABELS[key] }))} /></Field>
                <Field label="Notes"><input className="input md:col-span-3" value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Optional" /></Field>
              </div>
            )}
          </section>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start" data-tour="result">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-stone-200 bg-white shadow-[var(--shadow-card)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-maroon-800 via-maroon-800 to-maroon-950 px-6 py-6 text-white">
              <svg className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-white/[0.06]" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="12" /></svg>
              <p className="text-[13px] font-semibold text-maroon-100">Well-to-wheel emissions</p>
              {headline ? <p className="mt-2 flex items-baseline gap-2"><span className="num text-[44px] font-bold leading-none tracking-tight">{headline.value}</span><span className="text-lg font-semibold text-maroon-100">{headline.unit}</span></p>
                : <p className="mt-3 text-[15px] text-maroon-100">{calc.error ?? "Enter the details to see the result."}</p>}
              {result && <p className="mt-2 text-[13px] text-maroon-100">{fmt(result.cargoTonnes, 2)} t over {fmt(result.distanceKm, 0)} km · {FACTOR_SETS[settings.factorSet].short}</p>}
            </div>
            {result && (
              <div className="grid gap-5 p-6">
                <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} />
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {[["Intensity", `${fmt(result.intensityG, 1)} g/t-km`], ["Per tonne", `${fmt(result.kgPerTonne, 2)} kg CO₂e`], ["Transport work", `${fmt(result.tonneKm, 0)} t-km`], ["Legs and hubs", `${result.legs.length} · ${result.hubs.length}`]].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-stone-50 p-3"><dt className="text-xs text-grey-600">{label}</dt><dd className="num mt-0.5 font-bold">{value}</dd></div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <span className="badge badge-maroon">{SCOPE_LABELS[scopeKey].short}</span>
                  <span className={cx("badge", result.dataQuality === "primary" ? "badge-ok" : "badge-stone")}>{result.dataQuality === "primary" && <BadgeCheck size={12} aria-hidden="true" />}{result.dataQuality === "primary" ? "Primary data" : result.dataQuality === "modelled" ? "Modelled data" : "Default factors"}</span>
                  {result.legs.some((leg) => leg.uplifts.length) && <span className="badge badge-info">Adjusted</span>}
                </div>
                <p className="text-[12.5px] text-grey-600">{result.legs[form.mode === "courier" ? 1 : 0]!.factor.label} · {SOURCES[result.legs[form.mode === "courier" ? 1 : 0]!.factor.source].publisher}</p>
                {[...new Set(result.legs.flatMap((leg) => leg.warnings))].map((warning, i) => <p key={i} className="callout callout-warn !py-2.5 text-[12.5px]"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{warning}</p>)}
                <CalculationBasis result={result} legMeta={"legMeta" in built ? built.legMeta : undefined} />
              </div>
            )}
            <div className="grid gap-2 border-t border-stone-200 p-4 sm:grid-cols-2">
              <button type="button" className="btn btn-primary sm:col-span-2" disabled={!result} onClick={() => save(false)}><Save size={16} aria-hidden="true" /> {editing ? "Update shipment" : "Save to shipments"}</button>
              {!editing && <button type="button" className="btn btn-secondary" disabled={!result} onClick={() => save(true)}><Plus size={15} aria-hidden="true" /> Save, add another</button>}
              <button type="button" className={cx("btn btn-ghost", editing && "sm:col-span-2")} onClick={() => { setForm(initialForm(settings.businessUnits[0] ?? "Operations")); setEditing(null); }}><RotateCcw size={15} aria-hidden="true" /> Reset</button>
            </div>
          </div>
          {result && form.origin && form.destination && hasCoords(form.origin) && hasCoords(form.destination) && (form.mode === "road" || form.mode === "rail") && (
            <Link prefetch={false} href={`/app/compare/?from=${encodeURIComponent(form.origin.label)}&to=${encodeURIComponent(form.destination.label)}&t=${tonnes}`} className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-maroon-300 bg-maroon-50/60 px-4 py-3 text-[13.5px] font-semibold text-maroon-800 transition hover:bg-maroon-50">
              Could another mode be cleaner? Compare door to door <ArrowLeftRight size={16} aria-hidden="true" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
