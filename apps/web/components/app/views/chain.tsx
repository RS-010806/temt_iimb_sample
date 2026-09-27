"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Anchor, Building2, Package, Plane, Plus, Save, Ship, TrainFront, Trash2, Truck, Waves, Warehouse } from "lucide-react";
import { calculateShipment, HUB_TYPES, IWW_VESSELS, MODE_LABELS, ROAD_CLASSES, TRADE_LANES, VESSELS, type HubCondition, type HubInput, type HubTypeId, type LegInput, type RoadClassId, type RoadFuel, type ShipmentResult, type TransportMode } from "@temt/calculator";
import { buildRecord } from "@/lib/builders";
import { emissions, emissionsText, fmt, todayIso } from "@/lib/format";
import { estimateDistance, type Place, type PlaceKind } from "@/lib/places";
import { PAID_BY_LABELS, type LegMeta, type PaidBy, type ShipmentRecord } from "@/lib/records";
import { actions, getState, useSettings } from "@/lib/store";
import { PlaceInput } from "../place-input";
import { StageBar } from "../charts";
import { Field, NumberInput, PageHeader, Select, Toggle, cx, useToast } from "../../ui";

interface Stop { place?: Place; hub: { type: HubTypeId; condition: HubCondition } | null }
interface ChainLeg {
  mode: TransportMode;
  distanceKm?: number;
  edited: boolean;
  vehicleClass: RoadClassId;
  fuel: RoadFuel;
  courierLeg?: "first" | "mid" | "last";
  airService: "unknown" | "belly" | "freighter";
  seaBasis: "lane" | "vessel";
  tradeLane: string;
  containerType: "dry" | "reefer";
  tonnesPerTeu: number;
  vesselId: string;
  iwwVesselId: string;
}

const leg = (mode: TransportMode, patch: Partial<ChainLeg> = {}): ChainLeg => ({ mode, edited: false, vehicleClass: "gvw-30-50", fuel: "diesel", airService: "unknown", seaBasis: "lane", tradeLane: "intra-me-india", containerType: "dry", tonnesPerTeu: 10, vesselId: VESSELS[8]!.id, iwwVesselId: "mv-85-110", ...patch });
const terminal = (type: HubTypeId = "container-terminal"): Stop => ({ hub: { type, condition: "ambient" } });

const TEMPLATES: { id: string; label: string; icon: typeof Truck; description: string; stops: Stop[]; legs: ChainLeg[] }[] = [
  { id: "rail", label: "Rail intermodal", icon: TrainFront, description: "Truck to rail terminal, rail line haul, truck to destination", stops: [{ hub: null }, terminal(), terminal(), { hub: null }], legs: [leg("road", { distanceKm: 30, edited: true }), leg("rail"), leg("road", { distanceKm: 30, edited: true })] },
  { id: "export", label: "Export via port", icon: Ship, description: "Factory to gateway port by trailer, then container ship", stops: [{ hub: null }, terminal(), { hub: null }], legs: [leg("road", { vehicleClass: "trailer-30-60" }), leg("sea", { tradeLane: "europe-me-india" })] },
  { id: "coastal", label: "Coastal shipping", icon: Anchor, description: "Road to port, coastal container vessel, road to depot", stops: [{ hub: null }, terminal(), terminal(), { hub: null }], legs: [leg("road", { vehicleClass: "trailer-30-60" }), leg("sea"), leg("road", { vehicleClass: "trailer-30-60" })] },
  { id: "air", label: "Air express", icon: Plane, description: "Pickup, airport handling, flight, delivery", stops: [{ hub: null }, terminal("transshipment"), terminal("transshipment"), { hub: null }], legs: [leg("road", { vehicleClass: "gvw-3.5", distanceKm: 30, edited: true }), leg("air"), leg("road", { vehicleClass: "gvw-3.5", distanceKm: 30, edited: true })] },
  { id: "courier", label: "Courier / PTL", icon: Package, description: "First mile, hub, line haul, hub, last mile", stops: [{ hub: null }, terminal("transshipment"), terminal("transshipment"), { hub: null }], legs: [leg("road", { vehicleClass: "gvw-3.5", distanceKm: 25, edited: true, courierLeg: "first" }), leg("road", { vehicleClass: "gvw-20-30", courierLeg: "mid" }), leg("road", { vehicleClass: "gvw-3.5", distanceKm: 25, edited: true, courierLeg: "last" })] },
];

const MODE_ICON: Record<TransportMode, typeof Truck> = { road: Truck, rail: TrainFront, air: Plane, sea: Ship, iww: Waves };
const kinds = (modes: TransportMode[]): PlaceKind[] => modes.includes("air") ? ["airport", "city", "pin"] : modes.includes("sea") ? ["port", "city", "pin"] : ["city", "pin"];

function ChainDiagram({ stops, legs, result }: { stops: Stop[]; legs: ChainLeg[]; result?: ShipmentResult }) {
  const n = stops.length;
  return (
    <div className="relative overflow-x-auto rounded-2xl bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 px-6 py-8" data-tour="chain-canvas">
      <div className="relative flex min-w-[640px] items-start justify-between">
        {stops.map((stop, index) => (
          <div key={index} className="relative z-10 flex w-28 flex-col items-center text-center">
            <div className={cx("grid h-12 w-12 place-items-center rounded-full border-2 bg-maroon-950 text-white shadow-lg", index === 0 || index === n - 1 ? "border-white" : stop.hub ? "border-sand" : "border-maroon-300")}>
              {index === 0 ? <Building2 size={20} aria-hidden="true" /> : index === n - 1 ? <Warehouse size={20} aria-hidden="true" /> : stop.hub?.type === "container-terminal" ? <Anchor size={18} aria-hidden="true" /> : <Package size={18} aria-hidden="true" />}
            </div>
            <p className="mt-2 line-clamp-2 text-[12px] font-semibold text-white">{stop.place?.label ?? (index === 0 ? "Origin" : index === n - 1 ? "Destination" : `Stop ${index}`)}</p>
            {stop.hub && <p className="mt-0.5 text-[10.5px] text-sand">{HUB_TYPES[stop.hub.type].label}</p>}
          </div>
        ))}
        <svg className="pointer-events-none absolute left-14 right-14 top-6 h-2" preserveAspectRatio="none" viewBox="0 0 100 2" aria-hidden="true">
          {legs.map((item, index) => {
            const x1 = (index / legs.length) * 100, x2 = ((index + 1) / legs.length) * 100;
            return <line key={index} x1={x1} x2={x2} y1="1" y2="1" stroke={`var(--mode-${item.mode})`} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="6 5" style={{ animation: "chain-flow 1.2s linear infinite" }} />;
          })}
        </svg>
        <div className="pointer-events-none absolute left-14 right-14 top-11 flex">
          {legs.map((item, index) => {
            const Icon = MODE_ICON[item.mode];
            const kg = result?.legs[index]?.wtwKg;
            return (
              <div key={index} className="flex flex-1 flex-col items-center">
                <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur"><Icon size={12} aria-hidden="true" />{MODE_LABELS[item.mode]}{item.distanceKm ? ` · ${fmt(item.distanceKm, 0)} km` : ""}</span>
                {kg !== undefined && <span className="num mt-1 text-[11px] text-maroon-200">{emissionsText(kg)}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes chain-flow{to{stroke-dashoffset:-22}}`}</style>
    </div>
  );
}

export function ChainView() {
  const settings = useSettings();
  const toast = useToast();
  const router = useRouter();
  const [template, setTemplate] = useState("rail");
  const [stops, setStops] = useState<Stop[]>(TEMPLATES[0]!.stops.map((stop) => ({ ...stop })));
  const [legs, setLegs] = useState<ChainLeg[]>(TEMPLATES[0]!.legs.map((item) => ({ ...item })));
  const [tonnes, setTonnes] = useState<number | undefined>(24);
  const [refrigerated, setRefrigerated] = useState(false);
  const [details, setDetails] = useState({ ref: "", date: todayIso(), businessUnit: settings.businessUnits[0] ?? "Operations", commodity: "General cargo", paidBy: "company" as PaidBy });
  const [editing, setEditing] = useState<ShipmentRecord | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    const record = id ? getState().shipments.find((item) => item.id === id) : undefined;
    if (!record) return;
    setEditing(record);
    setTemplate("custom");
    const hubs = record.input.hubs ?? [];
    setStops([{ place: record.origin, hub: null }, ...record.input.legs.slice(0, -1).map((_, i) => ({ place: record.legMeta[i]?.to ?? record.legMeta[i + 1]?.from, hub: hubs[i] ? { type: hubs[i]!.type, condition: hubs[i]!.condition ?? "ambient" } : null })), { place: record.destination, hub: null }]);
    setLegs(record.input.legs.map((item) => leg(item.mode, { distanceKm: item.distanceKm, edited: true, vehicleClass: item.vehicleClass ?? "gvw-30-50", fuel: item.fuel ?? "diesel", courierLeg: item.courierLeg, airService: item.airService ?? "unknown", seaBasis: item.seaBasis ?? "lane", tradeLane: item.tradeLane ?? "intra-me-india", containerType: item.containerType ?? "dry", tonnesPerTeu: item.tonnesPerTeu ?? 10, vesselId: item.vesselId ?? VESSELS[8]!.id, iwwVesselId: item.iwwVesselId ?? "mv-85-110" })));
    setTonnes(record.input.legs[0]?.tonnes);
    setRefrigerated(record.input.legs.some((item) => item.refrigerated));
    setDetails({ ref: record.ref, date: record.date, businessUnit: record.businessUnit, commodity: record.commodity, paidBy: record.paidBy });
  }, []);

  const applyTemplate = (id: string) => {
    const found = TEMPLATES.find((item) => item.id === id);
    setTemplate(id);
    if (!found) return;
    setStops(found.stops.map((stop, i) => ({ ...stop, place: i === 0 ? stops[0]?.place : i === found.stops.length - 1 ? stops[stops.length - 1]?.place : undefined })));
    setLegs(found.legs.map((item) => ({ ...item })));
  };

  // Keep estimated distances current as stops change.
  useEffect(() => {
    setLegs((current) => current.map((item, i) => {
      if (item.edited) return item;
      const estimate = estimateDistance(item.mode, stops[i]?.place, stops[i + 1]?.place);
      return { ...item, distanceKm: estimate ? Math.round(estimate.km) : undefined };
    }));
  }, [stops, legs.map((item) => `${item.mode}${item.edited}`).join()]);

  const setLeg = (index: number, patch: Partial<ChainLeg>) => setLegs((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const setStop = (index: number, patch: Partial<Stop>) => setStops((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const addStop = () => { setStops((current) => [...current.slice(0, -1), { hub: { type: "transshipment", condition: "ambient" } }, current[current.length - 1]!]); setLegs((current) => [...current, leg("road")]); setTemplate("custom"); };
  const removeStop = (index: number) => { if (stops.length <= 2) return; setStops((current) => current.filter((_, i) => i !== index)); setLegs((current) => current.filter((_, i) => i !== Math.min(index, current.length - 1))); setTemplate("custom"); };

  const built = useMemo(() => {
    if (!tonnes) return { error: "Enter the cargo weight." };
    const inputs: LegInput[] = legs.map((item) => ({
      mode: item.mode, tonnes, distanceKm: item.distanceKm, refrigerated: item.mode === "road" ? refrigerated : undefined,
      ...(item.mode === "road" ? { vehicleClass: item.vehicleClass, fuel: item.fuel === "electric" ? "diesel" : item.fuel, courierLeg: item.courierLeg } : {}),
      ...(item.mode === "air" ? { airService: item.airService } : {}),
      ...(item.mode === "sea" ? { seaBasis: item.seaBasis, tradeLane: item.tradeLane, containerType: refrigerated ? "reefer" : item.containerType, tonnesPerTeu: item.tonnesPerTeu, vesselId: item.vesselId } : {}),
      ...(item.mode === "iww" ? { iwwVesselId: item.iwwVesselId } : {}),
    }));
    const missing = inputs.findIndex((item) => !item.distanceKm);
    if (missing >= 0) return { error: `Leg ${missing + 1} needs a distance: choose both stops or type it.` };
    const hubs: HubInput[] = stops.slice(1, -1).flatMap((stop) => stop.hub ? [{ type: stop.hub.type, condition: stop.hub.condition, tonnes, containers: HUB_TYPES[stop.hub.type].unit === "container" ? Math.max(1, Math.ceil(tonnes / (legs.find((item) => item.mode === "sea")?.tonnesPerTeu ?? 20))) : undefined, label: stop.place?.label ? `${stop.place.label} ${HUB_TYPES[stop.hub.type].label.toLowerCase()}` : HUB_TYPES[stop.hub.type].label }] : []);
    const legMeta: LegMeta[] = legs.map((item, i) => ({ from: stops[i]?.place, to: stops[i + 1]?.place, distanceMethod: item.edited ? "user" : item.mode === "air" ? "great-circle" : item.mode === "sea" ? "sea-route" : item.mode === "rail" ? "rail-estimate" : "road-estimate" }));
    try { return { result: calculateShipment({ legs: inputs, hubs }, settings.factorSet), inputs, hubs, legMeta }; } catch (error) { return { error: error instanceof Error ? error.message : "Calculation failed." }; }
  }, [legs, stops, tonnes, refrigerated, settings.factorSet]);

  const result = "result" in built ? built.result : undefined;
  const headline = result ? emissions(result.wtwKg) : null;

  const save = () => {
    if (!("result" in built) || !built.result) return;
    const origin = stops[0]?.place, destination = stops[stops.length - 1]?.place;
    if (!origin || !destination) { toast({ tone: "warn", message: "Choose the origin and final destination to save." }); return; }
    const record = buildRecord({ ...details, origin, destination, kind: template === "courier" ? "courier" : "chain", legs: built.inputs!, legMeta: built.legMeta!, hubs: built.hubs, source: "chain", notes: TEMPLATES.find((item) => item.id === template)?.label });
    if (editing) { actions.updateShipment(editing.id, { ...record, id: editing.id, createdAt: editing.createdAt, ref: details.ref || editing.ref, source: editing.source }); toast({ tone: "ok", message: "Chain updated." }); router.push("/app/shipments/"); return; }
    actions.addShipments([record]);
    toast({ tone: "ok", message: `Saved ${record.ref}: ${emissionsText(built.result.wtwKg)}.`, action: { label: "View", onClick: () => router.push("/app/shipments/") } });
  };

  return (
    <div>
      <PageHeader eyebrow={editing ? `Editing ${editing.ref}` : "Transport chain"} title="Build a multimodal chain" description="Combine legs and hubs exactly as ISO 14083 describes a transport chain. Start from a template, then adjust any stop or leg." />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TEMPLATES.map((item) => { const Icon = item.icon; return (
          <button key={item.id} type="button" onClick={() => applyTemplate(item.id)} title={item.description} className={cx("flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition", template === item.id ? "border-maroon-600 bg-maroon-50 text-maroon-800" : "border-stone-200 bg-white text-grey-700 hover:border-maroon-300")}><Icon size={16} aria-hidden="true" />{item.label}</button>
        ); })}
        {template === "custom" && <span className="flex shrink-0 items-center rounded-xl border border-dashed border-stone-300 px-3.5 py-2.5 text-[13px] font-semibold text-grey-600">Custom chain</span>}
      </div>
      <ChainDiagram stops={stops} legs={legs} result={result} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="card card-pad grid gap-4 md:grid-cols-3">
            <Field label="Cargo weight"><NumberInput value={tonnes} onChange={setTonnes} suffix="t" /></Field>
            <Field label="Temperature control"><div className="flex min-h-[42px] items-center"><Toggle checked={refrigerated} onChange={setRefrigerated} label="Refrigerated" /></div></Field>
            <Field label="Who operates or pays"><Select value={details.paidBy} onChange={(paidBy) => setDetails({ ...details, paidBy })} options={(Object.keys(PAID_BY_LABELS) as PaidBy[]).map((key) => ({ value: key, label: PAID_BY_LABELS[key] }))} /></Field>
          </div>
          {stops.map((stop, index) => (
            <div key={index} className="grid gap-4">
              <div className="card card-pad animate-rise">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1"><Field label={index === 0 ? "Origin" : index === stops.length - 1 ? "Final destination" : `Stop ${index}`}><PlaceInput value={stop.place} onChange={(place) => setStop(index, { place })} kinds={kinds([legs[index - 1]?.mode, legs[index]?.mode].filter(Boolean) as TransportMode[])} ariaLabel={`Stop ${index + 1}`} /></Field></div>
                  {index > 0 && index < stops.length - 1 && (
                    <>
                      <Field label="Hub operation"><Select value={stop.hub?.type ?? "none"} onChange={(value) => setStop(index, { hub: value === "none" ? null : { type: value as HubTypeId, condition: stop.hub?.condition ?? "ambient" } })} options={[{ value: "none", label: "No handling" }, ...(Object.keys(HUB_TYPES) as HubTypeId[]).map((key) => ({ value: key, label: HUB_TYPES[key].label }))]} /></Field>
                      {stop.hub && <Field label="Conditions"><Select value={stop.hub.condition} onChange={(condition) => setStop(index, { hub: { ...stop.hub!, condition } })} options={[{ value: "ambient", label: "Ambient" }, { value: "mixed", label: stop.hub.type === "container-terminal" ? "Temperature-controlled" : "Mixed / cold" }]} /></Field>}
                      <button type="button" className="btn btn-ghost btn-icon mb-0.5" onClick={() => removeStop(index)} aria-label={`Remove stop ${index}`}><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              </div>
              {index < legs.length && (() => {
                const item = legs[index]!;
                const Icon = MODE_ICON[item.mode];
                return (
                  <div className="ml-6 border-l-2 border-dashed pl-6" style={{ borderColor: `var(--mode-${item.mode})` }}>
                    <div className="panel grid gap-3 p-4 md:grid-cols-4">
                      <Field label={<span className="flex items-center gap-1.5"><Icon size={14} aria-hidden="true" style={{ color: `var(--mode-${item.mode})` }} /> Leg {index + 1} mode</span>}>
                        <Select value={item.mode} onChange={(mode) => setLeg(index, { mode, edited: false, courierLeg: undefined })} options={(Object.keys(MODE_LABELS) as TransportMode[]).map((key) => ({ value: key, label: MODE_LABELS[key] }))} />
                      </Field>
                      <Field label="Distance" hint={item.edited ? <button type="button" className="font-semibold text-maroon-700" onClick={() => setLeg(index, { edited: false })}>Estimate from stops</button> : "Estimated from stops"}><NumberInput value={item.distanceKm} onChange={(distanceKm) => setLeg(index, { distanceKm, edited: true })} suffix="km" /></Field>
                      {item.mode === "road" && <>
                        <Field label="Truck"><Select value={item.vehicleClass} onChange={(vehicleClass) => setLeg(index, { vehicleClass })} options={ROAD_CLASSES.map((road) => ({ value: road.id, label: `${road.label} (${road.gvw})` }))} /></Field>
                        <Field label="Fuel"><Select value={item.fuel} onChange={(fuel) => setLeg(index, { fuel })} options={[{ value: "diesel", label: "Diesel" }, { value: "cng", label: "CNG" }, { value: "petrol", label: "Petrol" }]} /></Field>
                      </>}
                      {item.mode === "air" && <Field label="Aircraft"><Select value={item.airService} onChange={(airService) => setLeg(index, { airService })} options={[{ value: "unknown", label: "Unknown mix" }, { value: "belly", label: "Belly hold" }, { value: "freighter", label: "Freighter" }]} /></Field>}
                      {item.mode === "sea" && <>
                        <Field label="Basis"><Select value={item.seaBasis} onChange={(seaBasis) => setLeg(index, { seaBasis })} options={[{ value: "lane", label: "Container, trade lane" }, { value: "vessel", label: "Vessel type" }]} /></Field>
                        {item.seaBasis === "lane" ? <Field label="Trade lane"><Select value={item.tradeLane} onChange={(tradeLane) => setLeg(index, { tradeLane })} options={TRADE_LANES.map((lane) => ({ value: lane.id, label: lane.label }))} /></Field>
                          : <Field label="Vessel"><Select value={item.vesselId} onChange={(vesselId) => setLeg(index, { vesselId })} options={VESSELS.map((vessel) => ({ value: vessel.id, label: `${vessel.type}, ${vessel.size}` }))} /></Field>}
                      </>}
                      {item.mode === "iww" && <Field label="Vessel"><Select value={item.iwwVesselId} onChange={(iwwVesselId) => setLeg(index, { iwwVesselId })} options={IWW_VESSELS.map((vessel) => ({ value: vessel.id, label: vessel.label }))} /></Field>}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
          <button type="button" className="btn btn-secondary justify-self-start" onClick={addStop}><Plus size={16} aria-hidden="true" /> Add a stop before the destination</button>
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-stone-200 bg-white shadow-[var(--shadow-card)]">
            <div className="bg-gradient-to-br from-maroon-800 to-maroon-950 px-6 py-5 text-white">
              <p className="text-[13px] font-semibold text-maroon-100">Chain total, well-to-wheel</p>
              {headline ? <p className="mt-2 flex items-baseline gap-2"><span className="num text-[40px] font-bold leading-none">{headline.value}</span><span className="text-lg text-maroon-100">{headline.unit}</span></p> : <p className="mt-2 text-sm text-maroon-100">{"error" in built ? built.error : ""}</p>}
            </div>
            {result && (
              <div className="grid gap-4 p-5">
                <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} />
                <ul className="grid gap-2 text-[13px]">
                  {result.legs.map((item, i) => <li key={i} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="dot" style={{ background: `var(--mode-${item.mode})` }} />Leg {i + 1} · {MODE_LABELS[item.mode]}</span><span className="num font-semibold">{emissionsText(item.wtwKg)}</span></li>)}
                  {result.hubs.map((hub, i) => <li key={`h${i}`} className="flex items-center justify-between gap-3 text-grey-600"><span className="truncate">{hub.label}</span><span className="num">{emissionsText(hub.wtwKg)}</span></li>)}
                </ul>
                <p className="num rounded-lg bg-stone-50 px-3 py-2 text-[12.5px] text-grey-700">{fmt(result.distanceKm, 0)} km · {fmt(result.intensityG, 1)} g/t-km · {fmt(result.kgPerTonne, 2)} kg per tonne</p>
              </div>
            )}
            <div className="grid gap-3 border-t border-stone-200 p-4">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Reference" value={details.ref} onChange={(event) => setDetails({ ...details, ref: event.target.value })} aria-label="Reference" />
                <input className="input" type="date" value={details.date} onChange={(event) => setDetails({ ...details, date: event.target.value })} aria-label="Dispatch date" />
              </div>
              <input className="input" value={details.businessUnit} onChange={(event) => setDetails({ ...details, businessUnit: event.target.value })} aria-label="Business unit" placeholder="Business unit" />
              <button type="button" className="btn btn-primary" onClick={save} disabled={!result}><Save size={16} aria-hidden="true" /> {editing ? "Update chain" : "Save chain as a shipment"}</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
