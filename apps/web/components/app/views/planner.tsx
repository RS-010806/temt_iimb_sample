"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info, RotateCcw, Target } from "lucide-react";
import { INDIA_GRID_KG_PER_KWH } from "@temt/calculator";
import { applyFilters, totals } from "@/lib/analytics";
import { emissionsText, fmt, pct } from "@/lib/format";
import { DEFAULT_LEVERS, runScenario, type Levers } from "@/lib/planner";
import { actions, useSettings } from "@/lib/store";
import { useView } from "@/lib/view-state";
import { Waterfall } from "../charts";
import { EmptyState, KpiTile, PageHeader, Segmented, Select, cx } from "../../ui";

function Slider({ label, value, onChange, min, max, step = 1, unit = "%", hint }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; unit?: string; hint?: string }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between gap-3"><span className="text-[13.5px] font-semibold">{label}</span><span className="num rounded-md bg-maroon-50 px-2 py-0.5 text-[13px] font-bold text-maroon-700">{fmt(value, step < 1 ? 2 : 0)}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--color-maroon-600)]" aria-label={label} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

const GRID_OPTIONS = [
  { value: String(INDIA_GRID_KG_PER_KWH), label: "India grid (CEA)" },
  { value: "0.35", label: "Half renewable" },
  { value: "0.05", label: "Renewable contract" },
];

export function PlannerView() {
  const { rows: all, years, businessUnit } = useView();
  const settings = useSettings();
  const [baseYear, setBaseYear] = useState<string>("");
  const [levers, setLevers] = useState<Levers>(DEFAULT_LEVERS);
  const set = (patch: Partial<Levers>) => setLevers((current) => ({ ...current, ...patch }));
  const fy = baseYear || years[0] || "all";
  const rows = useMemo(() => applyFilters(all, { fy, businessUnit }), [all, fy, businessUnit]);
  const scenario = useMemo(() => runScenario(rows, settings.factorSet, levers), [rows, settings.factorSet, levers]);
  // The target is measured from the configured base year; fall back to the selected baseline if that year has no data.
  const baseYearKg = useMemo(() => totals(applyFilters(all, { fy: settings.target.baseYear, businessUnit })).wtwKg, [all, settings.target.baseYear, businessUnit]);
  const targetKg = (baseYearKg || scenario.baselineKg) * (1 - settings.target.reductionPercent / 100);
  const reduction = scenario.baselineKg ? ((scenario.baselineKg - scenario.resultKg) / scenario.baselineKg) * 100 : 0;
  const steps = [
    { label: "Baseline", value: scenario.baselineKg / 1000, kind: "total" as const },
    ...scenario.steps.map((step) => ({ label: step.label, value: step.deltaKg / 1000, kind: "delta" as const })),
    { label: "With levers", value: scenario.resultKg / 1000, kind: "result" as const },
  ];

  if (!all.length) return <div><PageHeader eyebrow="Reduction planner" title="Plan your pathway" /><EmptyState icon={<Target size={26} />} title="Add shipments to plan reductions" body="The planner recalculates your own shipments under each lever. Load a sample workspace or add your data first." actions={<Link prefetch={false} href="/app/" className="btn btn-primary">Go to overview</Link>} /></div>;

  return (
    <div>
      <PageHeader eyebrow="Reduction planner" title="Plan your pathway to target" description="Pull the levers and see the effect on your own shipments, recalculated leg by leg with the active factor set."
        actions={<><Select ariaLabel="Baseline year" value={fy} onChange={setBaseYear} className="!w-auto !min-h-[38px] text-[13px] font-semibold" options={years.map((year) => ({ value: year, label: `Baseline ${year}` }))} /><button type="button" className="btn btn-secondary" onClick={() => setLevers(DEFAULT_LEVERS)}><RotateCcw size={15} aria-hidden="true" /> Reset levers</button></>} />
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={`Baseline, ${fy}`} value={emissionsText(scenario.baselineKg).split(" ")[0]} unit={emissionsText(scenario.baselineKg).split(" ").slice(1).join(" ")} />
        <KpiTile accent label="With these levers" value={emissionsText(scenario.resultKg).split(" ")[0]} unit={emissionsText(scenario.resultKg).split(" ").slice(1).join(" ")} sub={`${reduction >= 0 ? "▼" : "▲"} ${pct(Math.abs(reduction))} vs baseline`} />
        <KpiTile label={`Target: −${settings.target.reductionPercent}% vs ${baseYearKg ? settings.target.baseYear : fy} by ${settings.target.targetYear}`} value={<span className={cx(scenario.resultKg <= targetKg ? "text-ok" : "text-maroon-700")}>{scenario.resultKg <= targetKg ? "Reached" : "Gap"}</span>} sub={scenario.resultKg <= targetKg ? `${emissionsText(targetKg - scenario.resultKg)} headroom` : `${emissionsText(scenario.resultKg - targetKg)} still to find`} />
        <KpiTile label="Legs affected" value={fmt(scenario.affectedLegs)} sub={`of ${fmt(scenario.totalLegs)} legs in ${fy}`} />
      </section>
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="card card-pad grid content-start gap-6 xl:sticky xl:top-24 xl:self-start" data-tour="levers">
          <div><p className="eyebrow">Levers</p><p className="mt-1 text-[13px] text-grey-600">Each lever applies to eligible legs only, so they add up without double counting.</p></div>
          <Slider label="Move long road hauls to rail" value={levers.railShift} onChange={(railShift) => set({ railShift })} min={0} max={100} step={5} hint={`Road legs of ${levers.railMinKm}+ km with 8 t or more; 30 km drayage each end.`} />
          <Slider label="Minimum distance for rail" value={levers.railMinKm} onChange={(railMinKm) => set({ railMinKm })} min={200} max={1200} step={50} unit=" km" />
          <Slider label="Move short air legs to road" value={levers.airToRoad} onChange={(airToRoad) => set({ airToRoad })} min={0} max={100} step={5} hint="Air legs up to 2,500 km moved to an intermediate truck." />
          <Slider label="Consolidate into larger trucks" value={levers.consolidate} onChange={(consolidate) => set({ consolidate })} min={0} max={100} step={5} hint="Long hauls (250 km+) in trucks of 12 t GVW or less." />
          <Slider label="Electrify short road legs" value={levers.evShare} onChange={(evShare) => set({ evShare })} min={0} max={100} step={5} hint={`Road legs up to ${levers.evMaxKm} km in trucks above 3.5 t GVW.`} />
          <div className="grid gap-2">
            <span className="text-[13.5px] font-semibold">Electricity for charging</span>
            <Segmented ariaLabel="Electricity source" size="sm" value={String(levers.evGrid)} onChange={(value) => set({ evGrid: Number(value) })} options={GRID_OPTIONS} />
          </div>
          <Slider label="Better truck loading" value={levers.loadFactorGain} onChange={(loadFactorGain) => set({ loadFactorGain })} min={0} max={15} step={1} unit=" pts" hint="Percentage-point increase in average load factor on remaining road legs." />
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[13px] font-semibold">Target</p>
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <input type="number" min={1} max={100} className="input !min-h-[34px] !w-20" value={settings.target.reductionPercent} onChange={(event) => actions.updateSettings({ target: { ...settings.target, reductionPercent: Math.min(100, Math.max(1, Number(event.target.value) || 1)) } })} aria-label="Reduction target percent" />
              <span>% below</span>
              <Select ariaLabel="Target base year" value={settings.target.baseYear} onChange={(baseYear) => actions.updateSettings({ target: { ...settings.target, baseYear } })} className="!min-h-[34px] !w-auto !py-1 text-[13px]" options={[...new Set([settings.target.baseYear, ...years])].map((year) => ({ value: year, label: year }))} />
            </div>
          </div>
        </aside>
        <div className="grid content-start gap-6">
          <section className="card card-pad">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="card-title">Emissions bridge</h2><p className="card-subtitle">t CO₂e, from baseline through each lever to the scenario</p></div>
              <div className="flex gap-3 text-xs text-grey-700"><span className="flex items-center gap-1.5"><span className="dot bg-ok" />Reduction</span><span className="flex items-center gap-1.5"><span className="dot bg-maroon-600" />Increase</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-ok" />Target</span></div></div>
            <Waterfall steps={steps} target={targetKg / 1000} height={340} />
          </section>
          <section className="card card-pad">
            <h2 className="card-title mb-3">Lever by lever</h2>
            <div className="table-wrap"><table className="table"><thead><tr><th>Lever</th><th className="right">Legs</th><th className="right">Change</th><th className="right">Share of baseline</th></tr></thead>
              <tbody>{scenario.steps.map((step) => <tr key={step.id}><td className="font-semibold">{step.label}</td><td className="right num">{fmt(step.legs)}</td><td className={cx("right num font-bold", step.deltaKg < 0 ? "text-ok" : step.deltaKg > 0 ? "text-maroon-700" : "")}>{step.deltaKg > 0 ? "+" : ""}{emissionsText(step.deltaKg)}</td><td className="right num">{scenario.baselineKg ? pct((step.deltaKg / scenario.baselineKg) * 100) : "–"}</td></tr>)}</tbody></table></div>
            <ul className="mt-4 grid gap-2">{scenario.notes.map((note) => <li key={note} className="flex gap-2 text-[13px] leading-relaxed text-grey-700"><Info size={15} className="mt-0.5 shrink-0 text-maroon-600" aria-hidden="true" />{note}</li>)}</ul>
          </section>
        </div>
      </div>
    </div>
  );
}
