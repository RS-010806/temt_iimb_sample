"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Calculator, Factory, FileDown, Gauge, Lightbulb, Package, Route, Sparkles, Target, Upload } from "lucide-react";
import { applyFilters, byBusinessUnit, byLane, byMode, byMonth, byQuality, byScope, fyProgress, insights, opportunities, previousPeriod, totals } from "@/lib/analytics";
import { emissions, emissionsText, fmt, formatDate, pct } from "@/lib/format";
import { MODE_COLORS } from "@/lib/records";
import { makeSampleWorkspace, SAMPLE_SECTORS, type SampleSector } from "@/lib/sample-data";
import { actions, useSettings, useStore } from "@/lib/store";
import { setView, useView } from "@/lib/view-state";
import { BarList, MonthlyChart, StageBar } from "../charts";
import { QuickCalc } from "../quick-calc";
import { AnimatedNumber, KpiTile, PageHeader, Select, cx, useToast } from "../../ui";
import { startTour } from "../../copilot/tour";

export function FilterBar() {
  const { fy, businessUnit, years } = useView();
  const settings = useSettings();
  const units = [...new Set([...settings.businessUnits, ...useStore((state) => state.shipments).map((row) => row.businessUnit)])].filter(Boolean).sort();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select ariaLabel="Financial year" value={fy} onChange={(value) => setView({ fy: value })} className="!w-auto !min-h-[38px] !py-1.5 text-[13px] font-semibold" options={[...years.map((year) => ({ value: year, label: year })), { value: "all", label: "All periods" }]} />
      <Select ariaLabel="Business unit" value={businessUnit} onChange={(value) => setView({ businessUnit: value })} className="!w-auto !min-h-[38px] !py-1.5 text-[13px] font-semibold" options={[{ value: "all", label: "All business units" }, ...units.map((unit) => ({ value: unit, label: unit }))]} />
    </div>
  );
}

function EmptyDashboard() {
  const toast = useToast();
  const load = (sector: SampleSector) => {
    const records = makeSampleWorkspace(sector);
    actions.replaceAll(records, `Sample workspace: ${SAMPLE_SECTORS[sector].label}`);
    actions.updateSettings({ onboarded: true, organisation: { name: SAMPLE_SECTORS[sector].company }, businessUnits: SAMPLE_SECTORS[sector].units });
    toast({ tone: "ok", message: `Loaded ${records.length} sample shipments.` });
  };
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 p-8 text-white md:p-12 animate-rise">
        <svg className="absolute -right-10 -top-10 h-72 w-72 text-white/[0.05]" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="30" /></svg>
        <p className="eyebrow eyebrow-light">Welcome to TEMT</p>
        <h1 className="display mt-3 max-w-2xl text-[38px] md:text-[48px]">Measure your freight emissions in minutes.</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-maroon-100">Calculate one shipment, upload a year of data or explore a realistic sample. Everything stays private in this browser.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link prefetch={false} href="/app/calculate/" className="btn btn-light btn-lg"><Calculator size={18} aria-hidden="true" /> Calculate a shipment</Link>
          <Link prefetch={false} href="/app/import/" className="btn btn-outline-light btn-lg"><Upload size={18} aria-hidden="true" /> Import a file</Link>
          <button type="button" className="btn btn-outline-light btn-lg" onClick={() => { load("fmcg"); setTimeout(() => startTour(), 400); }}><Sparkles size={18} aria-hidden="true" /> Take the tour</button>
        </div>
      </section>
      <QuickCalc />
      </div>
      <section className="grid gap-4 md:grid-cols-4">
        {(Object.keys(SAMPLE_SECTORS) as SampleSector[]).map((sector, index) => (
          <button key={sector} type="button" onClick={() => load(sector)} className="card card-pad text-left transition hover:-translate-y-0.5 hover:border-maroon-300 animate-rise" style={{ animationDelay: `${index * 70}ms` }}>
            <p className="eyebrow">Sample workspace</p>
            <p className="mt-2 text-lg font-bold">{SAMPLE_SECTORS[sector].label}</p>
            <p className="mt-1 text-sm text-grey-600">{SAMPLE_SECTORS[sector].description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-maroon-700">Load <ArrowRight size={14} aria-hidden="true" /></span>
          </button>
        ))}
      </section>
    </div>
  );
}

export function DashboardView() {
  const { fy, businessUnit, rows: all } = useView();
  const settings = useSettings();
  const hydrated = useStore((state) => state.hydrated);
  const toast = useToast();
  const rows = useMemo(() => applyFilters(all, { fy, businessUnit }), [all, fy, businessUnit]);
  const data = useMemo(() => {
    const t = totals(rows);
    const prior = previousPeriod(all, fy, { businessUnit });
    return { t, prev: prior?.totals.shipments ? prior.totals : undefined, prevFy: prior?.label, prevShort: prior?.short, modes: byMode(rows), months: byMonth(rows, fy), units: byBusinessUnit(rows), lanes: byLane(rows).slice(0, 6), scopes: byScope(rows), quality: byQuality(rows), insights: insights(rows), opportunities: opportunities(rows, settings.factorSet).slice(0, 3), recent: [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) };
  }, [rows, all, fy, businessUnit, settings.factorSet]);

  if (!hydrated) return <div className="grid gap-4"><div className="skeleton h-24" /><div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32" />)}</div><div className="skeleton h-80" /></div>;
  if (!all.length) return <EmptyDashboard />;
  const { t, prev } = data;
  const change = prev ? ((t.wtwKg - prev.wtwKg) / prev.wtwKg) * 100 : undefined;
  const intensityChange = prev?.intensityG ? ((t.intensityG - prev.intensityG) / prev.intensityG) * 100 : undefined;
  const headline = emissions(t.wtwKg);
  const baselineRows = applyFilters(all, { fy: settings.target.baseYear, businessUnit });
  const baseline = totals(baselineRows).wtwKg;
  const targetYear = Number(settings.target.targetYear.slice(3, 7)), baseYear = Number(settings.target.baseYear.slice(3, 7)), thisYear = Number(fy.slice(3, 7));
  const annualBudget = baseline && Number.isFinite(thisYear) && targetYear > baseYear ? baseline * (1 - (settings.target.reductionPercent / 100) * Math.min(1, Math.max(0, (thisYear - baseYear) / (targetYear - baseYear)))) : undefined;
  // While the year is running, compare with the share of the annual budget used so far.
  const progress = fy !== "all" ? fyProgress(fy) : { ongoing: false, fraction: 1 };
  const expected = annualBudget !== undefined ? annualBudget * (progress.ongoing ? progress.fraction : 1) : undefined;
  const sampleRows = all.filter((row) => row.source === "sample");

  return (
    <div className="grid gap-6">
      {sampleRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f0dfb5] bg-[#fdf6e8] px-4 py-3 text-[13.5px] text-[#6b4a06] animate-fade" role="status">
          <span className="badge bg-[#e39a55] text-maroon-950">Sample data</span>
          <p className="flex-1">This workspace includes {fmt(sampleRows.length)} synthetic sample shipments for exploring TEMT. {settings.organisation.name && !settings.organisation.name.startsWith("Sample") ? `They are not ${settings.organisation.name}'s actual freight.` : "They are not any company's actual freight."}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const removed = actions.removeShipments(sampleRows.map((row) => row.id)); toast({ tone: "info", message: `Removed ${removed.length} sample shipments.`, action: { label: "Undo", onClick: () => actions.restoreShipments(removed) } }); }}>Remove sample shipments</button>
        </div>
      )}
      <PageHeader eyebrow={`Overview · ${fy === "all" ? "All periods" : fy}${progress.ongoing ? " to date" : ""}`} title={<>{settings.organisation.name || "Your"} freight footprint</>}
        description="Well-to-wheel emissions from every shipment in your workspace, calculated with TEMT's India-specific emission factors."
        actions={<><FilterBar /><Link prefetch={false} href="/app/reports/" className="btn btn-secondary"><FileDown size={16} aria-hidden="true" /> Report</Link><Link prefetch={false} href="/app/calculate/" className="btn btn-primary"><Calculator size={16} aria-hidden="true" /> Calculate</Link></>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile accent dataTour="kpi-total" label="Total emissions, well-to-wheel" value={<AnimatedNumber value={Number(headline.value.replace(/,/g, ""))} format={(v) => fmt(v, headline.unit.startsWith("t") ? 1 : 0)} />} unit={headline.unit}
          icon={<Factory size={16} />} sub={change !== undefined ? <span className="inline-flex items-center gap-1">{change <= 0 ? <ArrowDownRight size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}{pct(Math.abs(change))} {change <= 0 ? "lower" : "higher"} than {data.prevFy}</span> : `${fmt(t.shipments)} shipments`} />
        <KpiTile label="Emission intensity" value={<AnimatedNumber value={t.intensityG} format={(v) => fmt(v, 1)} />} unit="g CO₂e/t-km" icon={<Gauge size={16} />}
          sub={intensityChange !== undefined ? `${intensityChange <= 0 ? "▼" : "▲"} ${pct(Math.abs(intensityChange))} vs ${data.prevShort}` : `${fmt(t.kgPerTonne, 1)} kg CO₂e per tonne shipped`} />
        <KpiTile label="Shipments" value={<AnimatedNumber value={t.shipments} format={(v) => fmt(v)} />} unit={`· ${fmt(t.legs)} legs`} icon={<Package size={16} />} sub={`${fmt(t.tonnes, 0)} t cargo · ${fmt(t.tonneKm / 1e6, 2)} million t-km`} />
        <KpiTile label={expected ? `Target path (${settings.target.reductionPercent}% by ${settings.target.targetYear})` : "Per tonne shipped"} icon={<Target size={16} />}
          value={expected ? <span className={cx(t.wtwKg <= expected ? "text-ok" : "text-maroon-700")}>{t.wtwKg <= expected ? "On track" : "Behind"}</span> : <AnimatedNumber value={t.kgPerTonne} format={(v) => fmt(v, 1)} />} unit={expected ? undefined : "kg CO₂e/t"}
          sub={expected ? `${progress.ongoing ? "Budget to date" : "Budget"} ${emissionsText(expected)} · actual ${emissionsText(t.wtwKg)}` : settings.carbonPriceInrPerTonne ? `Internal carbon cost ₹${fmt((t.wtwKg / 1000) * settings.carbonPriceInrPerTonne)}` : "Set a target in Settings"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card card-pad xl:col-span-2" data-tour="monthly">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="card-title">Monthly emissions</h2><p className="card-subtitle">t CO₂e, stacked by life-cycle stage</p></div>
            <div className="flex gap-3 text-xs text-grey-700"><span className="flex items-center gap-1.5"><span className="dot" style={{ background: "var(--stage-ttw)" }} />Tank-to-wheel</span><span className="flex items-center gap-1.5"><span className="dot" style={{ background: "var(--stage-wtt)" }} />Well-to-tank</span>{t.hubKg > 0 && <span className="flex items-center gap-1.5"><span className="dot" style={{ background: "var(--stage-hub)" }} />Hubs</span>}</div></div>
          <MonthlyChart data={data.months} height={340} target={annualBudget ? annualBudget / 12 : undefined} />
        </div>
        <QuickCalc />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <h2 className="card-title">Life-cycle split</h2><p className="card-subtitle mb-4">ISO 14083 well-to-wheel components</p>
          <StageBar ttw={t.ttwKg} wtt={t.wttKg} hub={t.hubKg} />
        </div>
        <div className="card card-pad">
          <h2 className="card-title">GHG Protocol scopes</h2><p className="card-subtitle mb-4">Who operates or pays for the transport</p>
          <BarList items={data.scopes.map((item) => ({ key: item.key, label: item.label, value: item.wtwKg, share: item.share, color: item.key === "cat4" ? "var(--color-maroon-600)" : item.key === "cat9" ? "var(--color-maroon-300)" : item.key === "scope1" ? "var(--mode-air)" : "var(--mode-rail)" }))} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card card-pad" data-tour="mode-breakdown">
          <h2 className="card-title">By transport mode</h2><p className="card-subtitle mb-4">Hover for tonne-km and intensity</p>
          <BarList items={data.modes.map((item) => ({ key: item.key, label: item.label, value: item.wtwKg, share: item.share, color: MODE_COLORS[item.key as keyof typeof MODE_COLORS],
            detail: item.tonneKm ? <><p className="font-semibold text-ink">{item.label}</p><p>{fmt(item.tonneKm / 1e6, 2)} million t-km · {fmt((item.wtwKg / item.tonneKm) * 1000, 1)} g/t-km</p><p>{fmt(item.count)} legs</p></> : <p>{fmt(item.count)} hub operations</p> }))} />
        </div>
        <div className="card card-pad">
          <h2 className="card-title">By business unit</h2><p className="card-subtitle mb-4">Share of total</p>
          <BarList items={data.units.map((item, index) => ({ key: item.key, label: item.label, value: item.wtwKg, share: item.share, color: ["#b12322", "#2a72c4", "#bb7a08", "#0e9a88", "#7048b0", "#4f9420"][index % 6]! }))} />
        </div>
        <div className="card card-pad">
          <h2 className="card-title">Heaviest lanes</h2><p className="card-subtitle mb-3">Origin to destination</p>
          <ul className="divide-y divide-stone-200">
            {data.lanes.map((lane, index) => (
              <li key={lane.key} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-maroon-50 text-[11px] font-bold text-maroon-700">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{lane.label}</span><span className="text-xs text-grey-500">{lane.count} shipments · {fmt(lane.tonneKm ? (lane.wtwKg / lane.tonneKm) * 1000 : 0, 1)} g/t-km</span></span>
                <span className="num shrink-0 font-semibold">{emissionsText(lane.wtwKg)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5" data-tour="insights">
        <div className="card card-pad lg:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="card-title flex items-center gap-2"><Lightbulb size={16} className="text-maroon-600" aria-hidden="true" /> Reduction opportunities</h2><p className="card-subtitle">Recalculated with the same engine and factor set</p></div><Link prefetch={false} href="/app/planner/" className="btn btn-secondary btn-sm">Open planner <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="grid gap-3">
            {data.opportunities.length ? data.opportunities.map((item) => (
              <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-start justify-between gap-4"><p className="font-semibold">{item.title}</p>{item.savingKg > 0 && <span className="num shrink-0 rounded-full bg-maroon-600 px-2.5 py-0.5 text-xs font-bold text-white">−{emissionsText(item.savingKg)}</span>}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-grey-600">{item.body}</p>
              </div>
            )) : <p className="text-sm text-grey-600">No large opportunities found in this selection.</p>}
          </div>
        </div>
        <div className="grid gap-4 lg:col-span-2">
          <div className="card card-pad">
            <h2 className="card-title mb-3">What the data says</h2>
            <ul className="grid gap-3">
              {data.insights.map((item) => (
                <li key={item.id} className="flex gap-3"><span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.tone === "warn" ? "bg-amber-500" : item.tone === "ok" ? "bg-emerald-600" : item.tone === "info" ? "bg-sky-600" : "bg-maroon-600")} aria-hidden="true" /><div><p className="text-[13.5px] font-semibold">{item.title}</p><p className="text-[13px] text-grey-600">{item.body}</p></div></li>
              ))}
            </ul>
          </div>
          <div className="card card-pad">
            <h2 className="card-title">Data quality</h2><p className="card-subtitle mb-4">Share of emissions by data basis</p>
            <BarList items={data.quality.map((item) => ({ key: item.key, label: item.key === "primary" ? "Primary data" : item.key === "modelled" ? "Modelled" : "Default factors", value: item.wtwKg, share: item.share, color: item.key === "primary" ? "#1f7a45" : item.key === "modelled" ? "#bb7a08" : "#807c78" }))} />
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <div className="mb-3 flex items-center justify-between"><h2 className="card-title">Recent shipments</h2><Link prefetch={false} href="/app/shipments/" className="text-sm font-semibold text-maroon-700 hover:underline">View all</Link></div>
        <div className="table-wrap !border-0">
          <table className="table">
            <thead><tr><th>Reference</th><th>Date</th><th>Route</th><th>Modes</th><th className="right">Cargo</th><th className="right">Emissions</th></tr></thead>
            <tbody>
              {data.recent.map((row) => (
                <tr key={row.id}>
                  <td className="mono text-[12.5px]">{row.ref}</td><td className="whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="max-w-[280px] truncate">{row.origin.label} → {row.destination.label}</td>
                  <td><span className="flex gap-1">{[...new Set(row.input.legs.map((leg) => leg.mode))].map((mode) => <span key={mode} className="dot" style={{ background: MODE_COLORS[mode] }} title={mode} />)}</span></td>
                  <td className="right num">{fmt(row.result?.cargoTonnes ?? 0, 1)} t</td><td className="right num font-semibold">{row.result ? emissionsText(row.result.wtwKg) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
