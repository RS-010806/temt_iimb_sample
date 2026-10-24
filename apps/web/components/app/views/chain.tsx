"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Anchor, ArrowRight, Building2, ChevronDown, Flag, LoaderCircle, MapPinned, Package, PencilLine, Plane, Plus, Save, Ship, TrainFront, Trash2, Truck, Waves } from "lucide-react";
import { calculateShipment, nearestPort, suggestTradeLane, HUB_TYPES, IWW_VESSELS, MODE_LABELS, ROAD_CLASSES, TEU_LOADS, TRADE_LANES, VESSELS, type HubInput, type HubTypeId, type LegInput, type RoadClassId, type RoadFuel, type TransportMode } from "@temt/calculator";
import { buildRecord } from "@/lib/builders";
import { emissions, emissionsText, fmt, formatDate, todayIso } from "@/lib/format";
import { estimateDistance, hasCoords, measureDistance, nearestAirport, portPlace, type DistanceEstimate, type Place, type PlaceKind } from "@/lib/places";
import { loadStations, nearestStation } from "@/lib/rail";
import { PAID_BY_LABELS, type LegMeta, type PaidBy, type ShipmentRecord } from "@/lib/records";
import { actions, getState, useSettings, useStore } from "@/lib/store";
import { PlaceInput } from "../place-input";
import { StageBar } from "../charts";
import { CalculationBasis, DISTANCE_LABELS } from "../basis";
import { Field, Modal, NumberInput, PageHeader, Segmented, Select, Toggle, cx, useToast } from "../../ui";

/**
 * A transport chain is a list of stops; each pair of neighbouring stops is joined by one leg with its own mode,
 * distance and vehicle (ISO 14083 transport chain elements), and cargo handling at a stop is a hub operation.
 */
type Handling = HubTypeId | "none";
interface Stop {
  id: number;
  place?: Place;
  /** TEMT filled the place in (nearest station, port or airport); choosing a place replaces it. */
  auto?: boolean;
  /** A transfer stop from an example, which TEMT fills in from the route until the user picks a place. */
  suggest?: boolean;
  handling: Handling;
  /** The user chose the handling; until then it follows the modes on either side. */
  handlingEdited?: boolean;
}
interface ChainLeg {
  id: number;
  mode: TransportMode;
  source: "route" | "manual";
  manualKm?: number;
  vehicleClass: RoadClassId;
  fuel: Exclude<RoadFuel, "electric">;
  courierLeg?: "first" | "mid" | "last";
  airService: "unknown" | "belly" | "freighter";
  seaBasis: "lane" | "vessel";
  /** Set once the user picks a lane; until then it follows the route. */
  tradeLane?: string;
  tonnesPerTeu: number;
  vesselId: string;
  iwwVesselId: string;
}
type Estimate = DistanceEstimate | "loading" | undefined;

/** The engine accepts up to 12 legs per shipment. */
const MAX_LEGS = 12;
let counter = 0;
const uid = () => (counter += 1);
const newLeg = (mode: TransportMode, patch: Partial<ChainLeg> = {}): ChainLeg => ({ id: uid(), mode, source: "route", vehicleClass: "gvw-30-50", fuel: "diesel", airService: "unknown", seaBasis: "lane", tonnesPerTeu: 10, vesselId: VESSELS[8]!.id, iwwVesselId: "mv-85-110", ...patch });
const newStop = (patch: Partial<Stop> = {}): Stop => ({ id: uid(), handling: "transshipment", ...patch });
const transfer = () => newStop({ suggest: true });

const EXAMPLES: { id: string; label: string; description: string; modes: TransportMode[]; build: () => { stops: Stop[]; legs: ChainLeg[] } }[] = [
  { id: "blank", label: "Origin to destination", description: "Start with one leg and add stops", modes: ["road"],
    build: () => ({ stops: [newStop(), newStop()], legs: [newLeg("road")] }) },
  { id: "rail", label: "Rail intermodal", description: "Truck to the station, rail, truck to the destination", modes: ["road", "rail", "road"],
    build: () => ({ stops: [newStop(), transfer(), transfer(), newStop()], legs: [newLeg("road"), newLeg("rail"), newLeg("road")] }) },
  { id: "export", label: "Export via port", description: "Trailer to the gateway port, then container ship", modes: ["road", "sea"],
    build: () => ({ stops: [newStop(), transfer(), newStop()], legs: [newLeg("road", { vehicleClass: "trailer-30-60" }), newLeg("sea")] }) },
  { id: "coastal", label: "Coastal shipping", description: "Road to a port, coastal vessel, road from the port", modes: ["road", "sea", "road"],
    build: () => ({ stops: [newStop(), transfer(), transfer(), newStop()], legs: [newLeg("road", { vehicleClass: "trailer-30-60" }), newLeg("sea"), newLeg("road", { vehicleClass: "trailer-30-60" })] }) },
  { id: "air", label: "Air express", description: "Pickup, flight between airports, delivery", modes: ["road", "air", "road"],
    build: () => ({ stops: [newStop(), transfer(), transfer(), newStop()], legs: [newLeg("road", { vehicleClass: "gvw-3.5" }), newLeg("air"), newLeg("road", { vehicleClass: "gvw-3.5" })] }) },
  { id: "courier", label: "Courier / PTL", description: "First mile, hub, line haul, hub, last mile", modes: ["road", "road", "road"],
    build: () => ({ stops: [newStop(), transfer(), transfer(), newStop()], legs: [newLeg("road", { vehicleClass: "gvw-3.5", source: "manual", manualKm: 25, courierLeg: "first" }), newLeg("road", { vehicleClass: "gvw-20-30", courierLeg: "mid" }), newLeg("road", { vehicleClass: "gvw-3.5", source: "manual", manualKm: 25, courierLeg: "last" })] }) },
];

const MODE_ICON: Record<TransportMode, typeof Truck> = { road: Truck, rail: TrainFront, air: Plane, sea: Ship, iww: Waves };
const MODE_SHORT: Record<TransportMode, string> = { road: "Road", rail: "Rail", air: "Air", sea: "Sea", iww: "Waterway" };
const HANDLING: { value: Handling; label: string }[] = [
  { value: "container-terminal", label: "Container terminal (rail or port)" },
  { value: "transshipment", label: "Cross-dock or transfer hub" },
  { value: "storage-transshipment", label: "Stored, then transferred" },
  { value: "warehouse", label: "Warehouse storage" },
  { value: "liquid-bulk", label: "Liquid bulk terminal" },
  { value: "none", label: "No handling: cargo stays on board" },
];
const COURIER_LEG = { first: "Courier first mile", mid: "Courier line haul", last: "Courier last mile" } as const;

/** Handling TEMT suggests from the modes either side of a stop: a container terminal where rail or sea meets, otherwise a transfer hub. */
const suggestedHandling = (before?: TransportMode, after?: TransportMode): Handling => ([before, after].some((mode) => mode === "rail" || mode === "sea") ? "container-terminal" : "transshipment");
const kindsFor = (modes: TransportMode[]): PlaceKind[] => modes.includes("air") ? ["airport", "city", "pin"] : modes.includes("sea") ? ["port", "city", "pin"] : modes.includes("rail") ? ["station", "city", "pin"] : ["city", "pin"];
const placeholderFor = (modes: TransportMode[]) => modes.includes("air") ? "Airport, code or city" : modes.includes("sea") ? "Port or city" : modes.includes("rail") ? "Station, code or city" : "City or PIN code";
const stopName = (index: number, count: number) => (index === 0 ? "Origin" : index === count - 1 ? "Destination" : `Stop ${index}`);
const placeKey = (place?: Place) => (hasCoords(place) ? `${place.kind}:${place.code ?? ""}:${place.lat.toFixed(4)},${place.lon.toFixed(4)}` : "");
const shortLabel = (place?: Place) => place?.label.replace(/^\d{6} · /, "") ?? "";

/** Where a transfer stop most likely is: the nearest port, major airport or well-connected station to the anchor, else the anchor city. */
async function suggestPlace(anchor: Place & { lat: number; lon: number }, modes: TransportMode[]): Promise<Place> {
  const abroad = !!anchor.country && anchor.country !== "IN";
  if (modes.includes("sea")) return portPlace(nearestPort(anchor, abroad ? undefined : "IN").id) ?? anchor;
  if (modes.includes("air")) return nearestAirport(anchor, !abroad);
  if (modes.includes("rail") && !abroad) {
    const station = nearestStation(await loadStations(), anchor);
    return { label: `${station.name} (${station.code})`, kind: "station", code: station.code, lat: station.lat, lon: station.lon, state: station.state, country: "IN" };
  }
  return { ...anchor, label: shortLabel(anchor).replace(/ \([A-Z0-9]{3,5}\)$/, "") };
}

/** Distance for every leg from its two stops: rail over the Indian Railways network (loaded on demand), other modes estimated. */
function useLegEstimates(stops: Stop[], legs: ChainLeg[]): Estimate[] {
  const [rail, setRail] = useState<Record<string, DistanceEstimate | null>>({});
  const keys = legs.map((_, i) => { const a = placeKey(stops[i]?.place), b = placeKey(stops[i + 1]?.place); return a && b ? `${a}>${b}` : ""; });
  const pending = legs.map((leg, i) => (leg.mode === "rail" && keys[i] && !(keys[i]! in rail) ? keys[i] : "")).filter(Boolean).join("|");
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    legs.forEach((leg, i) => {
      const key = keys[i];
      if (leg.mode !== "rail" || !key || key in rail) return;
      measureDistance("rail", stops[i]!.place, stops[i + 1]!.place)
        .then((estimate) => { if (!cancelled) setRail((current) => ({ ...current, [key]: estimate ?? null })); }, () => { if (!cancelled) setRail((current) => ({ ...current, [key]: null })); });
    });
    return () => { cancelled = true; };
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  return legs.map((leg, i) => {
    const key = keys[i];
    if (!key) return undefined;
    const from = stops[i]!.place, to = stops[i + 1]!.place;
    if (leg.mode !== "rail") return estimateDistance(leg.mode, from, to);
    return key in rail ? rail[key] ?? estimateDistance("rail", from, to) : "loading";
  });
}

/** Route ribbon: every stop and leg, with a button on each leg to add a stop there. */
function RouteDiagram({ stops, legs, kms, kgs, handling, canAdd, onAdd }: { stops: Stop[]; legs: ChainLeg[]; kms: (number | undefined)[]; kgs: (number | undefined)[]; handling: Handling[]; canAdd: boolean; onAdd: (leg: number) => void }) {
  const count = stops.length;
  return (
    <div className="overflow-x-auto rounded-2xl bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 px-5 pb-5 pt-6" data-tour="chain-canvas">
      <ol className="flex w-full min-w-max items-start" aria-label="Route">
        {stops.map((stop, i) => {
          const edge = i === 0 || i === count - 1;
          const Icon = i === 0 ? Building2 : i === count - 1 ? Flag : stop.place?.kind === "station" ? TrainFront : stop.place?.kind === "port" ? Anchor : stop.place?.kind === "airport" ? Plane : Package;
          const leg = legs[i];
          const LegIcon = leg ? MODE_ICON[leg.mode] : Truck;
          return (
            <Fragment key={stop.id}>
              <li className="flex w-24 shrink-0 flex-col items-center text-center">
                <span className={cx("grid h-12 w-12 place-items-center rounded-full border-2 bg-maroon-950 text-white shadow-lg", edge ? "border-white" : handling[i] !== "none" ? "border-sand" : "border-maroon-300")}><Icon size={edge ? 20 : 18} aria-hidden="true" /></span>
                <span className="mt-2 text-[10.5px] font-semibold uppercase tracking-wider text-maroon-200">{stopName(i, count)}</span>
                <span className="line-clamp-2 text-[12px] font-semibold text-white">{shortLabel(stop.place) || "Not chosen"}</span>
                {!edge && handling[i] !== "none" && <span className="mt-0.5 text-[10.5px] leading-tight text-sand">{HUB_TYPES[handling[i] as HubTypeId].label}</span>}
              </li>
              {leg && (
                <li className="relative flex min-w-[120px] flex-1 flex-col items-center pt-[23px]">
                  <span className="chain-flow h-0.5 w-full" style={{ ["--flow" as string]: `var(--mode-${leg.mode})` }} aria-hidden="true" />
                  <button type="button" onClick={() => onAdd(i)} disabled={!canAdd} title={canAdd ? "Add a stop on this leg" : `A chain can have up to ${MAX_LEGS} legs`}
                    className="absolute left-1/2 top-[13px] grid h-[22px] w-[22px] -translate-x-1/2 place-items-center rounded-full border border-white/40 bg-maroon-900 text-white transition hover:scale-110 hover:border-white hover:bg-maroon-700 disabled:opacity-30"
                    aria-label={`Add a stop between ${shortLabel(stops[i]?.place) || stopName(i, count)} and ${shortLabel(stops[i + 1]?.place) || stopName(i + 1, count)}`}>
                    <Plus size={13} aria-hidden="true" />
                  </button>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"><LegIcon size={12} aria-hidden="true" />{MODE_SHORT[leg.mode]}{kms[i] ? ` · ${fmt(kms[i]!, 0)} km` : ""}</span>
                  {kgs[i] !== undefined && <span className="num mt-1 text-[11px] text-maroon-200">{emissionsText(kgs[i]!)}</span>}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function AddStopButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? `A chain can have up to ${MAX_LEGS} legs` : undefined}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 py-2 text-[13px] font-semibold text-maroon-700 transition hover:border-maroon-400 hover:bg-maroon-50 disabled:cursor-not-allowed disabled:opacity-50">
      <Plus size={15} aria-hidden="true" /> {children}
    </button>
  );
}

export function ChainView() {
  const settings = useSettings();
  const shipments = useStore((state) => state.shipments);
  const toast = useToast();
  const router = useRouter();
  const [example, setExample] = useState("blank");
  const [stops, setStops] = useState<Stop[]>(() => EXAMPLES[0]!.build().stops);
  const [legs, setLegs] = useState<ChainLeg[]>(() => EXAMPLES[0]!.build().legs);
  const [weight, setWeight] = useState<number | undefined>(24);
  const [weightUnit, setWeightUnit] = useState<"ton" | "kg">("ton");
  const [refrigerated, setRefrigerated] = useState(false);
  const [details, setDetails] = useState({ ref: "", date: todayIso(), businessUnit: settings.businessUnits[0] ?? "Operations", commodity: "General cargo", paidBy: "company" as PaidBy });
  const [showMore, setShowMore] = useState(false);
  const [missing, setMissing] = useState({ ref: false, date: false });
  const [editing, setEditing] = useState<ShipmentRecord | null>(null);
  const [duplicate, setDuplicate] = useState<{ existing: ShipmentRecord; record: ShipmentRecord } | null>(null);
  const [focusStop, setFocusStop] = useState<number | null>(null);

  // Open a saved chain for editing.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    const record = id ? getState().shipments.find((item) => item.id === id) : undefined;
    if (!record) return;
    setEditing(record);
    setExample("custom");
    const places = [record.origin, ...record.input.legs.slice(0, -1).map((_, i) => record.legMeta[i]?.to ?? record.legMeta[i + 1]?.from), record.destination];
    // Hubs are labelled with their stop's place; match them back to the stops.
    const hubs = [...(record.input.hubs ?? [])];
    const intermediate = places.length - 2;
    setStops(places.map((place, i) => {
      if (i === 0 || i === places.length - 1) return newStop({ place });
      const at = hubs.findIndex((hub) => !!place && !!hub.label?.startsWith(place.label));
      const hub = at >= 0 ? hubs.splice(at, 1)[0] : hubs.length === intermediate ? hubs[i - 1] : undefined;
      return newStop({ place, handling: hub?.type ?? "none", handlingEdited: true });
    }));
    setLegs(record.input.legs.map((item, i) => newLeg(item.mode, {
      source: (record.legMeta[i]?.distanceMethod ?? "user") === "user" ? "manual" : "route", manualKm: item.distanceKm,
      vehicleClass: item.vehicleClass ?? "gvw-30-50", fuel: item.fuel === "petrol" || item.fuel === "cng" ? item.fuel : "diesel", courierLeg: item.courierLeg,
      airService: item.airService ?? "unknown", seaBasis: item.seaBasis ?? "lane", tradeLane: item.tradeLane, tonnesPerTeu: item.tonnesPerTeu ?? 10,
      vesselId: item.vesselId ?? VESSELS[8]!.id, iwwVesselId: item.iwwVesselId ?? "mv-85-110",
    })));
    setWeight(record.input.legs[0]?.tonnes);
    setRefrigerated(record.input.legs.some((item) => item.refrigerated));
    setDetails({ ref: record.ref, date: record.date, businessUnit: record.businessUnit, commodity: record.commodity, paidBy: record.paidBy });
  }, []);

  // Fill an example's transfer stops from the route until the user picks a place.
  const origin = stops[0]?.place, destination = stops[stops.length - 1]?.place;
  const modeKey = legs.map((item) => item.mode).join();
  const suggestKey = stops.map((stop) => (stop.suggest && (!stop.place || stop.auto) ? "1" : "0")).join("");
  useEffect(() => {
    if (!suggestKey.includes("1") || (!hasCoords(origin) && !hasCoords(destination))) return;
    let cancelled = false;
    void Promise.all(stops.map(async (stop, i) => {
      if (!stop.suggest || (stop.place && !stop.auto)) return undefined;
      const anchor = i <= (stops.length - 1) / 2 ? origin : destination;
      if (!hasCoords(anchor)) return undefined;
      const place = await suggestPlace(anchor, [legs[i - 1]?.mode, legs[i]?.mode].filter(Boolean) as TransportMode[]).catch(() => undefined);
      return place && placeKey(place) !== placeKey(stop.place) ? [stop.id, place] as const : undefined;
    })).then((found) => {
      const byId = new Map(found.filter((item) => !!item));
      if (cancelled || !byId.size) return;
      setStops((current) => current.map((stop) => (byId.has(stop.id) && stop.suggest && (!stop.place || stop.auto) ? { ...stop, place: byId.get(stop.id), auto: true } : stop)));
    });
    return () => { cancelled = true; };
  }, [placeKey(origin), placeKey(destination), modeKey, suggestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Put the cursor in a stop that was just added.
  useEffect(() => {
    if (focusStop === null) return;
    const input = document.getElementById(`stop-${focusStop}`);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
    setFocusStop(null);
  }, [focusStop]);

  const estimates = useLegEstimates(stops, legs);
  const handling = stops.map((stop, i) => (i === 0 || i === stops.length - 1 ? "none" : stop.handlingEdited ? stop.handling : suggestedHandling(legs[i - 1]?.mode, legs[i]?.mode)));
  const kms = legs.map((item, i) => { const estimate = estimates[i]; return item.source === "manual" ? item.manualKm : typeof estimate === "object" ? Math.max(1, Math.round(estimate.km)) : undefined; });
  const tonnes = weight === undefined ? undefined : weightUnit === "kg" ? weight / 1000 : weight;
  const canAdd = legs.length < MAX_LEGS;

  const setLeg = (index: number, patch: Partial<ChainLeg>) => setLegs((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const setStop = (index: number, patch: Partial<Stop>) => setStops((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const applyExample = (id: string) => {
    const found = EXAMPLES.find((item) => item.id === id);
    if (!found || id === example) return;
    const next = found.build();
    next.stops[0]!.place = origin;
    next.stops[next.stops.length - 1]!.place = destination;
    // Switching replaces the stops in between; offer to undo if any of them were chosen by hand.
    const previous = { stops, legs, example };
    if (stops.slice(1, -1).some((stop) => stop.place && !stop.auto)) toast({ tone: "info", message: `Switched to ${found.label}. Your stops in between were replaced.`, action: { label: "Undo", onClick: () => { setStops(previous.stops); setLegs(previous.legs); setExample(previous.example); } } });
    setStops(next.stops);
    setLegs(next.legs);
    setExample(id);
  };
  /** Split a leg with a new stop: both halves keep the leg's mode and vehicle, and distances are recalculated. */
  const addStop = (legIndex: number) => {
    if (!canAdd) return;
    const split = legs[legIndex]!;
    const stop = newStop();
    setStops((current) => [...current.slice(0, legIndex + 1), stop, ...current.slice(legIndex + 1)]);
    setLegs((current) => [...current.slice(0, legIndex), { ...split, source: "route", manualKm: undefined }, newLeg(split.mode, { vehicleClass: split.vehicleClass, fuel: split.fuel, airService: split.airService, seaBasis: split.seaBasis, vesselId: split.vesselId, iwwVesselId: split.iwwVesselId }), ...current.slice(legIndex + 1)]);
    setExample("custom");
    setFocusStop(stop.id);
  };
  /** Remove a stop and join its two legs, keeping the main-haul mode. */
  const removeStop = (index: number) => {
    if (index === 0 || index === stops.length - 1) return;
    const before = legs[index - 1]!, after = legs[index]!;
    const keep = before.mode === "road" && after.mode !== "road" ? after : before;
    setStops((current) => current.filter((_, i) => i !== index));
    setLegs((current) => [...current.slice(0, index - 1), { ...keep, source: "route", manualKm: undefined }, ...current.slice(index + 1)]);
    setExample("custom");
  };

  // Calculate the whole chain.
  let error: string | undefined;
  let calculation: { result: ReturnType<typeof calculateShipment>; inputs: LegInput[]; hubs: HubInput[]; legMeta: LegMeta[] } | undefined;
  const waiting = legs.findIndex((item, i) => item.source === "route" && estimates[i] === "loading");
  const gap = legs.findIndex((_, i) => !kms[i]);
  if (!tonnes) error = "Enter the cargo weight.";
  else if (waiting >= 0) error = `Finding the rail route for leg ${waiting + 1}…`;
  else if (gap >= 0) error = `Leg ${gap + 1} needs a distance: choose both of its stops, or enter the distance manually.`;
  else {
    const inputs: LegInput[] = legs.map((item, i) => {
      const from = stops[i]?.place, to = stops[i + 1]?.place;
      const base: LegInput = { mode: item.mode, tonnes, distanceKm: kms[i] };
      if (item.mode === "road") return { ...base, vehicleClass: item.vehicleClass, fuel: item.fuel, refrigerated, courierLeg: item.courierLeg };
      if (item.mode === "air") return { ...base, airService: item.airService, airScope: from?.country && to?.country && (from.country !== "IN" || to.country !== "IN") ? "international" : "domestic" };
      if (item.mode === "sea") return { ...base, seaBasis: item.seaBasis, tradeLane: item.tradeLane ?? suggestTradeLane(from?.country, to?.country), containerType: refrigerated ? "reefer" : "dry", tonnesPerTeu: item.tonnesPerTeu, vesselId: item.vesselId };
      if (item.mode === "iww") return { ...base, iwwVesselId: item.iwwVesselId };
      return base;
    });
    const hubs: HubInput[] = stops.flatMap((stop, i) => {
      const type = handling[i]!;
      if (type === "none") return [];
      const perTeu = [legs[i - 1], legs[i]].find((item) => item?.mode === "sea")?.tonnesPerTeu ?? 20;
      return [{ type, condition: refrigerated ? "mixed" : "ambient", tonnes, containers: HUB_TYPES[type].unit === "container" ? Math.max(1, Math.ceil(tonnes / perTeu)) : undefined, label: stop.place ? `${shortLabel(stop.place)} ${HUB_TYPES[type].label.toLowerCase()}` : HUB_TYPES[type].label }];
    });
    const legMeta: LegMeta[] = legs.map((item, i) => { const estimate = estimates[i]; return { from: stops[i]?.place, to: stops[i + 1]?.place, distanceMethod: item.source === "manual" || typeof estimate !== "object" ? "user" : estimate.method }; });
    try { calculation = { result: calculateShipment({ legs: inputs, hubs }, settings.factorSet), inputs, hubs, legMeta }; } catch (failure) { error = failure instanceof Error ? failure.message : "Calculation failed."; }
  }
  const result = calculation?.result;
  const headline = result ? emissions(result.wtwKg) : null;

  const commit = (record: ShipmentRecord, replace?: ShipmentRecord) => {
    if (replace) {
      actions.updateShipment(replace.id, { ...record, id: replace.id, createdAt: replace.createdAt, source: replace.source });
      toast({ tone: "ok", message: `Updated ${record.ref}: ${emissionsText(result!.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
      if (editing) router.push("/app/shipments/");
      return;
    }
    actions.addShipments([record]);
    toast({ tone: "ok", message: `Saved ${record.ref}: ${emissionsText(result!.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
  };
  const save = () => {
    if (!calculation) return;
    if (!origin || !destination) { toast({ tone: "warn", message: "Choose the origin and destination to save this chain." }); return; }
    // The transport document number and dispatch date are what make a saved shipment traceable.
    const gaps = { ref: !details.ref.trim(), date: !details.date };
    if (gaps.ref || gaps.date) {
      setMissing(gaps);
      requestAnimationFrame(() => { const field = document.getElementById(gaps.ref ? "chain-reference" : "chain-date"); field?.scrollIntoView({ block: "center" }); field?.focus({ preventScroll: true }); });
      return;
    }
    const courier = example === "courier" && legs.every((item) => item.courierLeg);
    const record = buildRecord({ ...details, ref: details.ref.trim(), origin, destination, kind: courier ? "courier" : legs.length === 1 ? "single" : "chain", legs: calculation.inputs, legMeta: calculation.legMeta, hubs: calculation.hubs, source: "chain", notes: EXAMPLES.find((item) => item.id === example && item.id !== "blank")?.label });
    if (editing) { commit(record, editing); return; }
    const existing = shipments.find((item) => item.ref.trim().toLowerCase() === record.ref.toLowerCase());
    if (existing) { setDuplicate({ existing, record }); return; }
    commit(record);
  };

  const between = stops.length - 2;
  return (
    <div>
      <PageHeader eyebrow={editing ? `Editing ${editing.ref}` : "Transport chain"} title="Shipments with several stops"
        description="Add a stop wherever the cargo changes vehicle or mode, such as a rail terminal, port, airport or hub. Each leg between two stops has its own mode and distance, and handling at the stops counts too, as ISO 14083 requires." />

      {!editing && (
        <section className="card card-pad mb-5" aria-labelledby="start-from">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="start-from" className="text-[15px] font-bold">Start from</h2>
            <p className="text-[13px] text-grey-600">Examples fill in typical stops. Add, remove or change any stop afterwards.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Start from">
            {EXAMPLES.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={example === item.id} onClick={() => applyExample(item.id)}
                className={cx("flex flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition", example === item.id ? "border-maroon-600 bg-maroon-50 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 bg-white hover:border-maroon-300")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold text-ink">{item.label}</span>
                  <span className="flex items-center gap-0.5 text-grey-500" aria-hidden="true">
                    {item.modes.map((mode, i) => { const Icon = MODE_ICON[mode]; return <Fragment key={i}>{i > 0 && <ArrowRight size={11} />}<Icon size={14} style={{ color: `var(--mode-${mode})` }} /></Fragment>; })}
                  </span>
                </span>
                <span className="hidden text-[12.5px] leading-snug text-grey-600 sm:block">{item.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <RouteDiagram stops={stops} legs={legs} kms={kms} kgs={legs.map((_, i) => result?.legs[i]?.wtwKg)} handling={handling} canAdd={canAdd} onAdd={addStop} />
      <p className="mt-2 text-[12.5px] text-grey-600">{stops.length} stops: origin, {between === 0 ? "no stops" : between === 1 ? "1 stop" : `${between} stops`} in between and destination · {legs.length} {legs.length === 1 ? "leg" : "legs"} (up to {MAX_LEGS}). Use <Plus size={12} className="inline align-[-1px]" aria-label="the plus button" /> on any leg to add a stop there.</p>

      <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3">
          <section className="card card-pad grid items-start gap-4 md:grid-cols-2" aria-label="Cargo">
            <Field label="Cargo weight" htmlFor="chain-weight" hint="The same cargo travels on every leg.">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1"><NumberInput id="chain-weight" value={weight} onChange={setWeight} placeholder={weightUnit === "ton" ? "e.g. 24" : "e.g. 750"} /></div>
                <Segmented ariaLabel="Weight unit" value={weightUnit} onChange={(unit) => { if (weight !== undefined && unit !== weightUnit) setWeight(unit === "kg" ? weight * 1000 : weight / 1000); setWeightUnit(unit); }} options={[{ value: "ton", label: "TON" }, { value: "kg", label: "KG" }]} />
              </div>
            </Field>
            <Field label="Temperature control" hint="Applies to the trucks, containers and handling at every stop.">
              <div className="flex min-h-[42px] items-center"><Toggle checked={refrigerated} onChange={setRefrigerated} label="Refrigerated" /></div>
            </Field>
          </section>

          {stops.map((stop, index) => {
            const edge = index === 0 || index === stops.length - 1;
            const modes = [legs[index - 1]?.mode, legs[index]?.mode].filter(Boolean) as TransportMode[];
            const item = legs[index];
            return (
              <Fragment key={stop.id}>
                <section className="card card-pad animate-rise">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2.5 text-[14.5px] font-bold">
                      <span className={cx("grid h-7 w-7 place-items-center rounded-full text-white", edge ? "bg-maroon-700" : "bg-maroon-500")}>{index === 0 ? <Building2 size={14} aria-hidden="true" /> : index === stops.length - 1 ? <Flag size={14} aria-hidden="true" /> : <span className="num text-[12px]">{index}</span>}</span>
                      {stopName(index, stops.length)}
                      {!edge && <span className="hidden text-[12.5px] font-normal text-grey-500 sm:inline">where the cargo changes vehicle or mode</span>}
                    </h2>
                    {!edge && <button type="button" className="btn btn-ghost btn-sm text-grey-600" onClick={() => removeStop(index)} aria-label={`Remove stop ${index}`}><Trash2 size={15} aria-hidden="true" /> Remove</button>}
                  </div>
                  <div className={cx("grid items-start gap-3", !edge && "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
                    <Field label="Place" htmlFor={`stop-${stop.id}`} hint={stop.auto ? `Suggested: the nearest ${modes.includes("sea") ? "port" : modes.includes("air") ? "major airport" : modes.includes("rail") ? "well-connected station" : "hub"} to the ${index <= (stops.length - 1) / 2 ? "origin" : "destination"}. Change it if the cargo uses another.` : undefined}>
                      <PlaceInput id={`stop-${stop.id}`} ariaLabel={stopName(index, stops.length)} value={stop.place} onChange={(place) => setStop(index, { place, auto: false, suggest: false })} kinds={kindsFor(modes)} placeholder={placeholderFor(modes)} />
                    </Field>
                    {!edge && (
                      <Field label="Handling at this stop" hint={stop.handlingEdited ? undefined : `Suggested for ${modes.map((mode) => MODE_SHORT[mode].toLowerCase()).join(" to ")}`} info="Loading, unloading and any storage here count as a hub operation under ISO 14083. TEMT uses the GLEC default for the type chosen; temperature-controlled values apply when the cargo is refrigerated.">
                        <Select ariaLabel={`Handling at stop ${index}`} value={handling[index] as Handling} onChange={(value) => setStop(index, { handling: value, handlingEdited: true })} options={HANDLING} />
                      </Field>
                    )}
                  </div>
                </section>
                {item && (
                  <LegEditor index={index} leg={item} from={stops[index]?.place} to={stops[index + 1]?.place} fromName={stopName(index, stops.length)} toName={stopName(index + 1, stops.length)} estimate={estimates[index]} kg={result?.legs[index]?.wtwKg}
                    onChange={(patch) => setLeg(index, patch)} onAdd={() => addStop(index)} canAdd={canAdd} />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* On wide screens the total and Save stay in view while the breakdown scrolls between them. */}
        <aside className="min-w-0 xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100vh-7.5rem)] xl:flex-col xl:self-start" data-tour="chain-result">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-stone-200 bg-white shadow-[var(--shadow-card)] xl:flex xl:min-h-0 xl:flex-col">
            <div className="shrink-0 bg-gradient-to-br from-maroon-800 to-maroon-950 px-6 py-5 text-white">
              <p className="text-[13px] font-semibold text-maroon-100">Chain total, well-to-wheel</p>
              {headline ? <p className="mt-2 flex items-baseline gap-2"><span className="num text-[40px] font-bold leading-none">{headline.value}</span><span className="text-lg text-maroon-100">{headline.unit}</span></p>
                : <p className="mt-2 flex items-start gap-2 text-sm text-maroon-100">{waiting >= 0 && <LoaderCircle size={15} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />}{error}</p>}
              {result && <p className="mt-2 text-[13px] text-maroon-100">{fmt(tonnes!, 2)} ton over {fmt(result.distanceKm, 0)} km · {legs.length} {legs.length === 1 ? "leg" : "legs"}, {calculation!.hubs.length} {calculation!.hubs.length === 1 ? "hub" : "hubs"}</p>}
            </div>
            {result && (
              <div className="grid gap-4 p-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
                <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} />
                <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                  <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-grey-600">Emission factor, chain average</dt><dd className="num mt-0.5 font-bold">{fmt(result.intensityG, 1)} g CO₂e/t-km</dd></div>
                  <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-grey-600">Intensity per ton</dt><dd className="num mt-0.5 font-bold">{fmt(result.kgPerTonne, 1)} kg CO₂e/ton</dd></div>
                </dl>
                <ul className="grid gap-2 text-[13px]" aria-label="Emissions by leg and stop">
                  {result.legs.map((item, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-start gap-2"><span className="dot mt-1.5 shrink-0" style={{ background: `var(--mode-${item.mode})` }} /><span className="min-w-0"><span className="font-semibold text-ink">Leg {i + 1} · {MODE_LABELS[item.mode]}</span><span className="block truncate text-[12px] text-grey-500">{shortLabel(stops[i]?.place) || stopName(i, stops.length)} → {shortLabel(stops[i + 1]?.place) || stopName(i + 1, stops.length)}</span></span></span>
                      <span className="num shrink-0 font-semibold">{emissionsText(item.wtwKg)}</span>
                    </li>
                  ))}
                  {result.hubs.map((hub, i) => <li key={`h${i}`} className="flex items-center justify-between gap-3 text-grey-600"><span className="flex min-w-0 items-center gap-2"><span className="dot shrink-0" style={{ background: "var(--stage-hub)" }} /><span className="min-w-0 truncate" title={hub.label}>{hub.label}</span></span><span className="num shrink-0">{emissionsText(hub.wtwKg)}</span></li>)}
                </ul>
                <CalculationBasis result={result} legMeta={calculation!.legMeta} size="sm" />
              </div>
            )}
            <div className="grid shrink-0 gap-3 border-t border-stone-200 p-4">
              <div className="grid grid-cols-2 items-start gap-2">
                <Field label="LR / RR / AWB / B/L no." htmlFor="chain-reference" required error={missing.ref ? "Enter the reference to save." : undefined}>
                  <input id="chain-reference" className="input" required aria-invalid={missing.ref} placeholder="e.g. LR-20481" value={details.ref} onChange={(event) => { setDetails({ ...details, ref: event.target.value }); setMissing((current) => ({ ...current, ref: false })); }} />
                </Field>
                <Field label="Dispatch date" htmlFor="chain-date" required error={missing.date ? "Enter the date to save." : undefined}>
                  <input id="chain-date" className="input" type="date" required aria-invalid={missing.date} value={details.date} onChange={(event) => { setDetails({ ...details, date: event.target.value }); setMissing((current) => ({ ...current, date: false })); }} />
                </Field>
              </div>
              <button type="button" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-maroon-700" onClick={() => setShowMore(!showMore)} aria-expanded={showMore}>
                <ChevronDown size={14} className={cx("transition", showMore && "rotate-180")} aria-hidden="true" /> More details (optional)
              </button>
              {showMore && (
                <div className="grid gap-2 animate-fade">
                  <Field label="Business unit"><input className="input" value={details.businessUnit} onChange={(event) => setDetails({ ...details, businessUnit: event.target.value })} /></Field>
                  <Field label="Commodity"><input className="input" value={details.commodity} onChange={(event) => setDetails({ ...details, commodity: event.target.value })} /></Field>
                  <Field label="Who operates or pays" info="Decides the GHG Protocol scope: own fleet is Scope 1, purchased transport is Scope 3 Category 4, customer-paid delivery is Category 9."><Select value={details.paidBy} onChange={(paidBy) => setDetails({ ...details, paidBy })} options={(Object.keys(PAID_BY_LABELS) as PaidBy[]).map((key) => ({ value: key, label: PAID_BY_LABELS[key] }))} /></Field>
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={save} disabled={!result}><Save size={16} aria-hidden="true" /> {editing ? "Update chain" : "Save chain as a shipment"}</button>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title={`${duplicate?.existing.ref} is already saved`} footer={duplicate && <>
        <button type="button" className="btn btn-ghost" onClick={() => setDuplicate(null)}>Cancel</button>
        <button type="button" className="btn btn-secondary" onClick={() => { commit(duplicate.record); setDuplicate(null); }}>Keep both</button>
        <button type="button" className="btn btn-primary" onClick={() => { commit(duplicate.record, duplicate.existing); setDuplicate(null); }}>Update the saved shipment</button>
      </>}>
        {duplicate && (
          <div className="grid gap-3 text-[14px] text-grey-700">
            <p>A shipment with this reference was saved on {formatDate(duplicate.existing.date)}: {duplicate.existing.origin.label} → {duplicate.existing.destination.label}.</p>
            <p>Update it with this chain, so the reference stays linked to one shipment, or keep both as separate shipments.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** One leg: its mode, its distance (calculated from the stops or entered), and only the options that mode needs. */
function LegEditor({ index, leg, from, to, fromName, toName, estimate, kg, onChange, onAdd, canAdd }: { index: number; leg: ChainLeg; from?: Place; to?: Place; fromName: string; toName: string; estimate: Estimate; kg?: number; onChange: (patch: Partial<ChainLeg>) => void; onAdd: () => void; canAdd: boolean }) {
  const Icon = MODE_ICON[leg.mode];
  const lane = leg.tradeLane ?? suggestTradeLane(from?.country, to?.country);
  return (
    <div className="ml-[1.375rem] border-l-2 border-dashed pl-5" style={{ borderColor: `var(--mode-${leg.mode})` }}>
      <section className="panel grid gap-4 p-4" aria-label={`Leg ${index + 1}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-bold">
            <Icon size={15} aria-hidden="true" style={{ color: `var(--mode-${leg.mode})` }} />
            Leg {index + 1}
            <span className="min-w-0 truncate font-normal text-grey-600">{shortLabel(from) || fromName} → {shortLabel(to) || toName}</span>
            {leg.courierLeg && <span className="badge badge-stone font-semibold">{COURIER_LEG[leg.courierLeg]}</span>}
          </p>
          {kg !== undefined && <p className="num text-[13px] font-semibold">{emissionsText(kg)}</p>}
        </div>

        <Segmented ariaLabel={`Leg ${index + 1} mode`} value={leg.mode} onChange={(mode) => onChange({ mode, courierLeg: undefined })}
          options={(Object.keys(MODE_ICON) as TransportMode[]).map((mode) => { const ModeIcon = MODE_ICON[mode]; return { value: mode, label: MODE_SHORT[mode], icon: <ModeIcon size={13} aria-hidden="true" /> }; })} />

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">Distance</p>
            <Segmented size="sm" ariaLabel={`Leg ${index + 1} distance source`} value={leg.source} onChange={(source) => onChange(source === "manual" ? { source, manualKm: leg.manualKm ?? (typeof estimate === "object" ? Math.round(estimate.km) : undefined) } : { source })}
              options={[{ value: "route", label: "Calculate from stops", icon: <MapPinned size={12} aria-hidden="true" /> }, { value: "manual", label: "Enter manually", icon: <PencilLine size={12} aria-hidden="true" /> }]} />
          </div>
          {leg.source === "manual" ? (
            <div className="max-w-[260px]"><NumberInput ariaLabel={`Leg ${index + 1} distance in km`} value={leg.manualKm} onChange={(manualKm) => onChange({ manualKm })} suffix="km" placeholder="From a trip sheet or invoice" /></div>
          ) : estimate === "loading" ? (
            <p className="flex items-center gap-2 text-[13px] text-grey-600"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Finding the rail route…</p>
          ) : estimate ? (
            <p className="text-[13px] leading-relaxed text-grey-700"><span className="num font-bold text-ink">{fmt(Math.max(1, estimate.km), 0)} km</span> · {DISTANCE_LABELS[estimate.method]}</p>
          ) : (
            <p className="flex items-start gap-2 text-[13px] text-grey-600"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />Choose both stops to calculate the distance, or enter it manually.</p>
          )}
        </div>

        {leg.mode === "road" && (
          <div className="grid items-start gap-3 md:grid-cols-2">
            <Field label="Truck type"><Select ariaLabel={`Leg ${index + 1} truck type`} value={leg.vehicleClass} onChange={(vehicleClass) => onChange({ vehicleClass })} options={ROAD_CLASSES.map((road) => ({ value: road.id, label: `${road.label} (${road.gvw})` }))} /></Field>
            <Field label="Fuel"><Segmented ariaLabel={`Leg ${index + 1} fuel`} value={leg.fuel} onChange={(fuel) => onChange({ fuel })} options={[{ value: "diesel", label: "Diesel" }, { value: "cng", label: "CNG" }, { value: "petrol", label: "Petrol" }]} /></Field>
          </div>
        )}
        {leg.mode === "air" && (
          <Field label="Aircraft" info="Belly cargo flies in passenger aircraft; freighters carry only cargo. If you don't know, keep the mix.">
            <Segmented ariaLabel={`Leg ${index + 1} aircraft`} value={leg.airService} onChange={(airService) => onChange({ airService })} options={[{ value: "unknown", label: "Don't know (mix)" }, { value: "belly", label: "Belly hold" }, { value: "freighter", label: "Freighter" }]} />
          </Field>
        )}
        {leg.mode === "sea" && (
          <div className="grid items-start gap-3 md:grid-cols-2">
            <Field label="Shipped as"><Segmented ariaLabel={`Leg ${index + 1} sea basis`} value={leg.seaBasis} onChange={(seaBasis) => onChange({ seaBasis })} options={[{ value: "lane", label: "Container" }, { value: "vessel", label: "Bulk, tanker or other vessel" }]} /></Field>
            {leg.seaBasis === "lane" ? <>
              <Field label="Trade lane" hint={leg.tradeLane ? undefined : "Suggested from the ports"}><Select ariaLabel={`Leg ${index + 1} trade lane`} value={lane} onChange={(tradeLane) => onChange({ tradeLane })} options={TRADE_LANES.map((item) => ({ value: item.id, label: item.label }))} /></Field>
              <Field label="Cargo per container (TEU)"><Select ariaLabel={`Leg ${index + 1} cargo per TEU`} value={String(leg.tonnesPerTeu)} onChange={(value) => onChange({ tonnesPerTeu: Number(value) })} options={TEU_LOADS.map((item) => ({ value: String(item.tonnes), label: `${item.label}, ${fmt(item.tonnes, 1)} t per TEU` }))} /></Field>
            </> : <Field label="Vessel type and size"><Select ariaLabel={`Leg ${index + 1} vessel`} value={leg.vesselId} onChange={(vesselId) => onChange({ vesselId })} options={VESSELS.map((vessel) => ({ value: vessel.id, label: `${vessel.type}, ${vessel.size}` }))} /></Field>}
          </div>
        )}
        {leg.mode === "iww" && (
          <Field label="Inland vessel"><Select ariaLabel={`Leg ${index + 1} vessel`} value={leg.iwwVesselId} onChange={(iwwVesselId) => onChange({ iwwVesselId })} options={IWW_VESSELS.map((vessel) => ({ value: vessel.id, label: vessel.label }))} /></Field>
        )}
      </section>
      <div className="py-2.5"><AddStopButton onClick={onAdd} disabled={!canAdd}>Add a stop on this leg</AddStopButton></div>
    </div>
  );
}
