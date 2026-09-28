"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Plane, Save, Ship, TrainFront, Truck } from "lucide-react";
import { buildAlternatives, buildRecord, type Alternative } from "@/lib/builders";
import { emissions, emissionsText, fmt, pct } from "@/lib/format";
import type { Place } from "@/lib/places";
import { actions, useSettings } from "@/lib/store";
import { PlaceInput } from "./place-input";
import { StageBar } from "./charts";
import { NumberInput, cx, useToast } from "../ui";

const ICONS = { road: Truck, rail: TrainFront, air: Plane, sea: Ship };
const COLORS = { road: "var(--mode-road)", rail: "var(--mode-rail)", air: "var(--mode-air)", sea: "var(--mode-sea)" };

/** Compact, fully working calculator: route + weight in, door-to-door options out, one click to save. */
export function QuickCalc({ tone = "card" }: { tone?: "card" | "hero" }) {
  const settings = useSettings();
  const toast = useToast();
  const [from, setFrom] = useState<Place | undefined>();
  const [to, setTo] = useState<Place | undefined>();
  const [tonnes, setTonnes] = useState<number | undefined>(10);
  const [options, setOptions] = useState<Alternative[] | null>(null);
  const [selected, setSelected] = useState<Alternative["id"]>("road");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to || !tonnes) { setOptions(null); return; }
    let cancelled = false;
    setBusy(true); setError("");
    buildAlternatives(from, to, tonnes, settings.factorSet)
      .then((result) => { if (!cancelled) { setOptions(result); setSelected((current) => (result.some((option) => option.id === current) ? current : "road")); } })
      .catch((reason) => { if (!cancelled) { setOptions(null); setError(reason instanceof Error ? reason.message : "Could not calculate this route."); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [from, to, tonnes, settings.factorSet]);

  const chosen = options?.find((option) => option.id === selected) ?? options?.find((option) => option.id === "road");
  const road = options?.find((option) => option.id === "road");
  const max = Math.max(...(options ?? []).map((option) => option.result.wtwKg), 1);
  const headline = chosen ? emissions(chosen.result.wtwKg) : null;

  const save = () => {
    if (!chosen || !from || !to) return;
    const record = buildRecord({ origin: from, destination: to, kind: chosen.input.legs.length > 1 ? "chain" : "single", legs: chosen.input.legs, legMeta: chosen.legMeta, hubs: chosen.input.hubs, source: "manual", notes: `Quick calculate: ${chosen.label}` });
    actions.addShipments([record]);
    toast({ tone: "ok", message: `Saved ${record.ref}: ${emissionsText(chosen.result.wtwKg)}. Your dashboard now includes it.` });
  };

  return (
    <div className={cx("flex h-full flex-col", tone === "card" ? "card card-pad" : "rounded-2xl bg-white p-5 text-ink shadow-2xl")} data-tour="quick-calc">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="card-title">Quick calculate</h2><p className="card-subtitle">Door-to-door, with TEMT's India-specific factors</p></div>
        <Link prefetch={false} href="/app/calculate/" className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-maroon-700 hover:underline">Full calculator</Link>
      </div>
      <div className="mt-4 grid gap-2.5">
        <PlaceInput value={from} onChange={setFrom} ariaLabel="Quick calculate origin" placeholder="From: city or PIN code" />
        <PlaceInput value={to} onChange={setTo} ariaLabel="Quick calculate destination" placeholder="To: city or PIN code" />
        <NumberInput value={tonnes} onChange={setTonnes} suffix="t" ariaLabel="Cargo weight in tonnes" placeholder="Cargo weight" />
      </div>
      {error && <p className="mt-3 text-[13px] text-maroon-700">{error}</p>}
      {!options && !busy && !error && <p className="mt-4 text-[13px] leading-relaxed text-grey-600">Pick two places to compare road, rail, air and coastal options for this cargo.</p>}
      {busy && !options && <p className="mt-4 flex items-center gap-2 text-[13px] text-grey-600"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Calculating…</p>}
      {options && chosen && headline && (
        <div className={cx("mt-4 grid gap-3 animate-fade", busy && "opacity-60")}>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Option">
            {options.map((option) => {
              const Icon = ICONS[option.id];
              return (
                <button key={option.id} type="button" role="radio" aria-checked={option.id === chosen.id} onClick={() => setSelected(option.id)} title={option.label}
                  className={cx("grid place-items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-semibold transition", option.id === chosen.id ? "border-maroon-600 bg-maroon-50 text-maroon-800" : "border-stone-200 text-grey-600 hover:border-maroon-300", !option.practical && "opacity-60")}>
                  <Icon size={15} aria-hidden="true" style={{ color: COLORS[option.id] }} />{option.id === "sea" ? "Coastal" : option.id[0]!.toUpperCase() + option.id.slice(1)}
                </button>
              );
            })}
          </div>
          <div className="rounded-xl bg-gradient-to-br from-maroon-800 to-maroon-950 p-4 text-white">
            <p className="text-[12px] text-maroon-200">{chosen.label}{!chosen.practical && " · not practical for this pair"}</p>
            <p className="mt-1 flex items-baseline gap-1.5"><span className="num text-[30px] font-bold leading-none">{headline.value}</span><span className="text-sm text-maroon-100">{headline.unit}</span></p>
            <p className="num mt-1 text-[12px] text-maroon-100">{fmt(chosen.result.distanceKm, 0)} km · {fmt(chosen.result.intensityG, 1)} g/t-km{road && chosen.id !== "road" ? ` · ${chosen.result.wtwKg <= road.result.wtwKg ? `${pct(((road.result.wtwKg - chosen.result.wtwKg) / road.result.wtwKg) * 100, 0)} below` : `${pct(((chosen.result.wtwKg - road.result.wtwKg) / road.result.wtwKg) * 100, 0)} above`} road` : ""}</p>
          </div>
          <StageBar ttw={chosen.result.ttwKg} wtt={chosen.result.wttKg} hub={chosen.result.hubKg} compact />
          <ul className="grid gap-1.5" aria-label="All options">
            {options.map((option) => (
              <li key={option.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-[12px]">
                <span className="font-semibold text-grey-700">{option.id === "sea" ? "Coastal" : option.id[0]!.toUpperCase() + option.id.slice(1)}</span>
                <span className="h-1.5 rounded-full bg-stone-100"><span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, (option.result.wtwKg / max) * 100)}%`, background: COLORS[option.id] }} /></span>
                <span className="num text-right text-grey-700">{emissionsText(option.result.wtwKg)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}><Save size={14} aria-hidden="true" /> Save</button>
            <Link prefetch={false} href={`/app/compare/?from=${encodeURIComponent(from!.label)}&to=${encodeURIComponent(to!.label)}&t=${tonnes}`} className="btn btn-secondary btn-sm">Details <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
