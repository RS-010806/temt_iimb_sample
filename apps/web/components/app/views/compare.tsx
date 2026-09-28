"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Award, Loader2, Plane, Save, Ship, TrainFront, Truck } from "lucide-react";
import { MODE_LABELS, ROAD_CLASSES, type RoadClassId } from "@temt/calculator";
import { buildAlternatives, buildRecord, type Alternative } from "@/lib/builders";
import { emissions, emissionsText, fmt, pct } from "@/lib/format";
import { resolvePlace, type Place } from "@/lib/places";
import { actions, useSettings } from "@/lib/store";
import { PlaceInput } from "../place-input";
import { StageBar } from "../charts";
import { Field, NumberInput, PageHeader, Select, Toggle, cx, useToast } from "../../ui";

const ICONS = { road: Truck, rail: TrainFront, air: Plane, sea: Ship };
const COLORS = { road: "var(--mode-road)", rail: "var(--mode-rail)", air: "var(--mode-air)", sea: "var(--mode-sea)" };

export function CompareView() {
  const settings = useSettings();
  const toast = useToast();
  const [from, setFrom] = useState<Place | undefined>();
  const [to, setTo] = useState<Place | undefined>();
  const [tonnes, setTonnes] = useState<number | undefined>(20);
  const [vehicle, setVehicle] = useState<RoadClassId | "auto">("auto");
  const [refrigerated, setRefrigerated] = useState(false);
  const [drayage, setDrayage] = useState<number | undefined>(30);
  const [options, setOptions] = useState<Alternative[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get("from"), b = params.get("to"), t = Number(params.get("t"));
    if (t > 0) setTonnes(t);
    if (a) resolvePlace(a).then((place) => place && setFrom(place));
    if (b) resolvePlace(b).then((place) => place && setTo(place));
  }, []);

  useEffect(() => {
    if (!from || !to || !tonnes) { setOptions(null); return; }
    let cancelled = false;
    setBusy(true); setError("");
    buildAlternatives(from, to, tonnes, settings.factorSet, { vehicleClass: vehicle === "auto" ? undefined : vehicle, refrigerated, drayageKm: drayage || 30 })
      .then((result) => { if (!cancelled) setOptions(result); })
      .catch((reason) => { if (!cancelled) { setOptions(null); setError(reason instanceof Error ? reason.message : "Could not compare these places."); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [from, to, tonnes, vehicle, refrigerated, drayage, settings.factorSet]);

  const road = options?.find((option) => option.id === "road");
  const best = options?.find((option) => option.practical);
  const max = Math.max(...(options ?? []).map((option) => option.result.wtwKg), 1);

  const save = (option: Alternative) => {
    if (!from || !to) return;
    actions.addShipments([buildRecord({ origin: from, destination: to, kind: option.input.legs.length > 1 ? "chain" : "single", legs: option.input.legs, legMeta: option.legMeta, hubs: option.input.hubs, source: "compare", notes: option.label })]);
    toast({ tone: "ok", message: `Saved the ${option.label.toLowerCase()} option to shipments.` });
  };

  return (
    <div>
      <PageHeader eyebrow="Compare modes" title="Which way should this freight move?" description="Door-to-door options for the same cargo and route, including road drayage to rail terminals, airports and ports, ranked by well-to-wheel emissions." />
      <section className="card card-pad mb-6 animate-rise" data-tour="compare-form">
        <div className="grid items-end gap-3 lg:grid-cols-[1fr_auto_1fr_160px]">
          <Field label="Origin"><PlaceInput value={from} onChange={setFrom} ariaLabel="Origin" /></Field>
          <button type="button" className="btn btn-ghost btn-icon mb-0.5 justify-self-center" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap origin and destination"><ArrowRightLeft size={17} /></button>
          <Field label="Destination"><PlaceInput value={to} onChange={setTo} ariaLabel="Destination" /></Field>
          <Field label="Cargo"><NumberInput value={tonnes} onChange={setTonnes} suffix="t" ariaLabel="Cargo tonnes" /></Field>
        </div>
        <div className="mt-4 grid gap-4 border-t border-stone-200 pt-4 md:grid-cols-3">
          <Field label="Truck for road legs"><Select value={vehicle} onChange={setVehicle} options={[{ value: "auto", label: "Automatic, fits the cargo" }, ...ROAD_CLASSES.map((item) => ({ value: item.id, label: `${item.label} (${item.gvw})` }))]} /></Field>
          <Field label="Rail drayage each end" hint="Road distance to and from rail terminals"><NumberInput value={drayage} onChange={setDrayage} suffix="km" /></Field>
          <Field label="Temperature control"><div className="flex min-h-[42px] items-center"><Toggle checked={refrigerated} onChange={setRefrigerated} label="Refrigerated cargo" /></div></Field>
        </div>
      </section>

      {error && <p className="callout callout-warn mb-6">{error}</p>}
      {busy && !options && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-56" />)}</div>}
      {!options && !busy && !error && (
        <div className="panel grid place-items-center gap-2 px-6 py-16 text-center">
          <div className="flex gap-3 text-maroon-600">{[Truck, TrainFront, Plane, Ship].map((Icon, i) => <Icon key={i} size={26} aria-hidden="true" />)}</div>
          <p className="mt-2 text-lg font-bold">Choose an origin and destination</p>
          <p className="max-w-md text-sm text-grey-600">TEMT builds road, rail, air and coastal options using the nearest rail terminals, airports and ports, then calculates each one with {settings.factorSet === "glec-india" ? "the GLEC v3.2 comparison set" : "TEMT's India-specific factors"}.</p>
        </div>
      )}
      {options && (
        <div className={cx("grid gap-6", busy && "opacity-60")}>
          {best && road && best.id !== "road" && (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-maroon-800 to-maroon-950 px-6 py-5 text-white animate-rise">
              <Award size={28} className="text-sand" aria-hidden="true" />
              <p className="flex-1 text-[15px]"><strong>{best.label}</strong> is the lowest-emission practical option: <strong>{pct(((road.result.wtwKg - best.result.wtwKg) / road.result.wtwKg) * 100, 0)} below direct road</strong>, saving {emissionsText(road.result.wtwKg - best.result.wtwKg)} on this shipment.</p>
              <button type="button" className="btn btn-light btn-sm" onClick={() => save(best)}><Save size={14} aria-hidden="true" /> Save this option</button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {options.map((option, index) => {
              const Icon = ICONS[option.id];
              const headline = emissions(option.result.wtwKg);
              return (
                <article key={option.id} className={cx("card card-pad relative animate-rise", option === best && "ring-2 ring-maroon-600", !option.practical && "opacity-75")} style={{ animationDelay: `${index * 80}ms` }}>
                  {option === best && <span className="badge absolute right-5 top-5 bg-maroon-600 text-white">Lowest emission</span>}
                  {!option.practical && <span className="badge badge-stone absolute right-5 top-5">Not practical here</span>}
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${COLORS[option.id]} 12%, white)`, color: COLORS[option.id] }}><Icon size={20} aria-hidden="true" /></span><div><h3 className="font-bold">{option.label}</h3><p className="text-[13px] text-grey-600">{option.summary}</p></div></div>
                  <p className="mt-5 flex items-baseline gap-2"><span className="num text-[34px] font-bold leading-none">{headline.value}</span><span className="font-semibold text-grey-600">{headline.unit}</span></p>
                  <div className="mt-3 h-2 rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, (option.result.wtwKg / max) * 100)}%`, background: COLORS[option.id] }} /></div>
                  <div className="mt-4"><StageBar ttw={option.result.ttwKg} wtt={option.result.wttKg} hub={option.result.hubKg} compact /></div>
                  <ol className="mt-4 grid gap-1.5 text-[12.5px]">
                    {option.result.legs.map((leg, i) => (
                      <li key={i} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className="dot" style={{ background: `var(--mode-${leg.mode})` }} /><span className="truncate">{MODE_LABELS[leg.mode]} · {fmt(leg.distanceKm, 0)} km</span></span><span className="num shrink-0 text-grey-700">{emissionsText(leg.wtwKg)}</span></li>
                    ))}
                    {option.result.hubs.length > 0 && <li className="flex items-center justify-between gap-3 text-grey-600"><span>{option.result.hubs.length} terminal handlings</span><span className="num">{emissionsText(option.result.hubKg)}</span></li>}
                  </ol>
                  <p className="mt-3 text-[12px] leading-relaxed text-grey-500">{option.notes[0]}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                    <span className="num text-[13px] text-grey-600">{fmt(option.result.intensityG, 1)} g/t-km · {fmt(option.result.distanceKm, 0)} km</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(option)}><Save size={14} aria-hidden="true" /> Save</button>
                  </div>
                </article>
              );
            })}
          </div>
          {busy && <p className="flex items-center gap-2 text-sm text-grey-600"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Updating…</p>}
          <p className="text-xs text-grey-500">Distances are estimates from TEMT's location data and sea-lane network. Emissions only: check capacity, transit time, service and cost before switching modes.</p>
        </div>
      )}
    </div>
  );
}
