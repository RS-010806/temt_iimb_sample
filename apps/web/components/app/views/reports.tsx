"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Braces, FileArchive, FileSpreadsheet, FileText, FileType2, Loader2, Printer, Sheet } from "lucide-react";
import { EXPORT_FORMATS, exportReport, type ExportFormat } from "@/lib/exports";
import { buildReportModel, generatedLabel, type ReportModel } from "@/lib/report-model";
import { emissionsText, fmt, pct } from "@/lib/format";
import { MODE_COLORS } from "@/lib/records";
import { useSettings, useStore } from "@/lib/store";
import { useView } from "@/lib/view-state";
import { BarList, MonthlyChart, StageBar } from "../charts";
import { FilterBar } from "./dashboard";
import { EmptyState, PageHeader, cx, useToast } from "../../ui";

const ICONS: Record<ExportFormat, typeof FileText> = { pdf: FileText, xlsx: FileSpreadsheet, docx: FileType2, csv: Sheet, json: Braces, powerbi: FileArchive };

function ReportSection({ n, title, children, kicker }: { n: number; title: string; children: ReactNode; kicker?: string }) {
  return (
    <section className="border-t border-stone-200 px-6 py-8 md:px-10 print:break-inside-avoid">
      <p className="eyebrow">{String(n).padStart(2, "0")}{kicker ? ` · ${kicker}` : ""}</p>
      <h2 className="display mt-1.5 text-[26px] text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BucketTable({ rows, label }: { rows: ReportModel["byLane"]; label: string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>{label}</th><th className="right">t CO₂e</th><th className="right">Share</th><th className="right">Tonne-km</th><th className="right">g/t-km</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><td className="font-semibold">{row.label}</td><td className="right num">{fmt(row.wtwKg / 1000, 2)}</td><td className="right num">{pct(row.share)}</td><td className="right num">{fmt(row.tonneKm, 0)}</td><td className="right num">{row.tonneKm ? fmt((row.wtwKg / row.tonneKm) * 1000, 1) : "–"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function ReportsView() {
  const { fy, businessUnit, rows: all } = useView();
  const settings = useSettings();
  const hydrated = useStore((state) => state.hydrated);
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const model = useMemo(() => buildReportModel(all, settings, { fy, businessUnit }), [all, settings, fy, businessUnit]);
  const t = model.totals;
  const change = model.previous ? ((t.wtwKg - model.previous.totals.wtwKg) / model.previous.totals.wtwKg) * 100 : undefined;

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try { await exportReport(format, model); toast({ tone: "ok", message: `${EXPORT_FORMATS.find((item) => item.id === format)!.label} downloaded.` }); }
    catch (error) { toast({ tone: "warn", message: error instanceof Error ? error.message : "Export failed." }); }
    finally { setBusy(null); }
  };

  if (hydrated && !all.length) return <div><PageHeader eyebrow="Reports" title="Reports and exports" /><EmptyState icon={<FileText size={26} />} title="Nothing to report yet" body="Add or import shipments, or load a sample workspace, to generate reports." actions={<Link prefetch={false} href="/app/" className="btn btn-primary">Go to overview</Link>} /></div>;

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Reports and exports" description="Read the report here, then take it anywhere. PDF, Excel and Word include the methodology and BRSR mapping; CSV, JSON and Power BI carry the same leg-level figures."
        actions={<><FilterBar /><button type="button" className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print</button></>} />

      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:hidden" data-tour="export-panel">
        {EXPORT_FORMATS.map((format, index) => {
          const Icon = ICONS[format.id];
          return (
            <button key={format.id} type="button" onClick={() => run(format.id)} disabled={busy !== null || !t.shipments}
              className="group flex items-start gap-4 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-maroon-300 disabled:opacity-60 animate-rise" style={{ animationDelay: `${index * 50}ms` }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-maroon-50 text-maroon-600 transition group-hover:bg-maroon-600 group-hover:text-white">{busy === format.id ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}</span>
              <span><span className="block font-bold">{format.label}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-grey-600">{format.description}</span></span>
            </button>
          );
        })}
      </section>

      <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[var(--shadow-card)] print:border-0 print:shadow-none" aria-label="Freight emissions report">
        <header className="relative overflow-hidden bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 px-6 py-10 text-white md:px-10">
          <svg className="pointer-events-none absolute right-6 top-6 h-40 w-64 text-maroon-300/40" viewBox="0 0 260 160" aria-hidden="true"><path d="M10 140C60 130 70 80 120 70s90-10 130-60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" /><circle cx="10" cy="140" r="5" fill="white" /><circle cx="250" cy="10" r="5" fill="#e39a55" /></svg>
          <p className="eyebrow eyebrow-light">TEMT · Transportation Emission Measurement Tool</p>
          <h1 className="display mt-3 text-[36px] md:text-[44px]">Freight emissions report</h1>
          <p className="mt-2 text-lg text-maroon-100">{model.organisation} · {model.period}{businessUnit !== "all" ? ` · ${businessUnit}` : ""}</p>
          <p className="mt-1 text-[13px] text-maroon-200">{generatedLabel(model)}</p>
          {model.sampleShipments > 0 && <p className="mt-3 inline-flex rounded-md bg-sand px-2.5 py-1 text-[12px] font-bold text-maroon-950">Sample data · {model.sampleShipments} synthetic shipments for demonstration</p>}
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["Total, well-to-wheel", emissionsText(t.wtwKg), change !== undefined ? `${change <= 0 ? "▼" : "▲"} ${pct(Math.abs(change))} vs ${model.previous!.period}` : `${fmt(t.shipments)} shipments`],
              ["Emission intensity", `${fmt(t.intensityG, 1)} g/t-km`, `${fmt(t.kgPerTonne, 1)} kg CO₂e per tonne`],
              ["Transport activity", `${fmt(t.tonneKm / 1e6, 2)} M t-km`, `${fmt(t.tonnes, 0)} t across ${fmt(t.legs)} legs`],
              ["Data basis", `${pct(model.byQuality.find((item) => item.key === "primary")?.share ?? 0, 0)} primary`, "Remainder uses published defaults"]].map(([label, value, sub]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur"><p className="text-xs text-maroon-200">{label}</p><p className="num mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-maroon-100">{sub}</p></div>
            ))}
          </div>
        </header>

        <ReportSection n={1} title="Executive summary" kicker="What the data says">
          <div className="grid gap-6 lg:grid-cols-2">
            <ul className="grid gap-3">
              {model.insights.map((item) => <li key={item.id} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-maroon-600" aria-hidden="true" /><p className="text-[14.5px] leading-relaxed"><strong>{item.title}.</strong> {item.body}</p></li>)}
            </ul>
            {model.previous ? (
              <div className="table-wrap self-start">
                <table className="table"><thead><tr><th /><th className="right">{model.previous.period}</th><th className="right">{model.period}</th><th className="right">Change</th></tr></thead>
                  <tbody>
                    <tr><td className="font-semibold">Total t CO₂e</td><td className="right num">{fmt(model.previous.totals.wtwKg / 1000, 1)}</td><td className="right num">{fmt(t.wtwKg / 1000, 1)}</td><td className={cx("right num font-bold", change! <= 0 ? "text-ok" : "text-maroon-700")}>{change! > 0 ? "+" : ""}{pct(change!)}</td></tr>
                    <tr><td className="font-semibold">Intensity g/t-km</td><td className="right num">{fmt(model.previous.totals.intensityG, 1)}</td><td className="right num">{fmt(t.intensityG, 1)}</td><td className="right num">{pct(((t.intensityG - model.previous.totals.intensityG) / (model.previous.totals.intensityG || 1)) * 100)}</td></tr>
                    <tr><td className="font-semibold">Shipments</td><td className="right num">{fmt(model.previous.totals.shipments)}</td><td className="right num">{fmt(t.shipments)}</td><td className="right num">{pct(((t.shipments - model.previous.totals.shipments) / (model.previous.totals.shipments || 1)) * 100)}</td></tr>
                  </tbody></table>
              </div>
            ) : <p className="panel p-4 text-[13.5px] text-grey-600">Add shipments for the previous financial year to see year-on-year change.</p>}
          </div>
        </ReportSection>

        <ReportSection n={2} title="Emissions profile" kicker="Monthly and by life-cycle stage">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2"><MonthlyChart data={model.byMonth} height={280} /></div>
            <div className="grid content-start gap-6"><div><p className="mb-3 text-sm font-bold">Life-cycle split</p><StageBar ttw={t.ttwKg} wtt={t.wttKg} hub={t.hubKg} /></div>
              <div><p className="mb-3 text-sm font-bold">By transport mode</p><BarList items={model.byMode.map((item) => ({ key: item.key, label: item.label, value: item.wtwKg, share: item.share, color: MODE_COLORS[item.key as keyof typeof MODE_COLORS] }))} /></div></div>
          </div>
        </ReportSection>

        <ReportSection n={3} title="Where emissions arise" kicker="Scope, business unit, lane and vehicle">
          <div className="grid gap-6 lg:grid-cols-2">
            <div><p className="mb-2 text-sm font-bold">GHG Protocol scopes</p><BucketTable rows={model.byScope} label="Scope" /></div>
            <div><p className="mb-2 text-sm font-bold">Business units</p><BucketTable rows={model.byBusinessUnit} label="Business unit" /></div>
            <div><p className="mb-2 text-sm font-bold">Top lanes</p><BucketTable rows={model.byLane.slice(0, 8)} label="Lane" /></div>
            <div><p className="mb-2 text-sm font-bold">Road vehicle classes</p><BucketTable rows={model.byVehicle.slice(0, 8)} label="Vehicle and fuel" /></div>
          </div>
        </ReportSection>

        <ReportSection n={4} title="Reduction opportunities" kicker="Recalculated with the same engine">
          <div className="grid gap-3 md:grid-cols-2">
            {model.opportunities.map((item) => (
              <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-5">
                <div className="flex items-start justify-between gap-3"><p className="font-bold">{item.title}</p>{item.savingKg > 0 && <span className="num shrink-0 font-bold text-maroon-700">−{emissionsText(item.savingKg)}</span>}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-grey-700">{item.body}</p>
              </div>
            ))}
            {!model.opportunities.length && <p className="text-sm text-grey-600">No large opportunities found for this selection.</p>}
          </div>
          <Link prefetch={false} href="/app/planner/" className="btn btn-secondary btn-sm mt-4 print:hidden">Model them in the reduction planner</Link>
        </ReportSection>

        <ReportSection n={5} title="BRSR mapping" kicker="SEBI Business Responsibility and Sustainability Report">
          <div className="table-wrap"><table className="table"><thead><tr><th>Indicator</th><th>Value</th><th>Note</th></tr></thead>
            <tbody>{model.brsr.map((item) => <tr key={item.indicator}><td className="font-semibold">{item.indicator}</td><td className="num whitespace-nowrap font-bold">{item.value}</td><td className="text-[13px] text-grey-600">{item.note}</td></tr>)}</tbody></table></div>
          {!settings.organisation.revenueCrore && <p className="mt-3 text-[13px] text-grey-600 print:hidden">Add annual revenue in <Link href="/app/settings/" className="font-semibold text-maroon-700 underline">Settings</Link> to include intensity per ₹ crore.</p>}
        </ReportSection>

        <ReportSection n={6} title="Methodology and factors" kicker="Transparent by design">
          <p className="font-semibold">{model.factorSet.label}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-grey-700">{model.factorSet.description}</p>
          <ul className="mt-4 grid gap-2 text-[13.5px] leading-relaxed text-grey-700">{model.notes.map((note) => <li key={note} className="flex gap-2"><span aria-hidden="true">•</span>{note}</li>)}</ul>
          <div className="table-wrap mt-5"><table className="table"><thead><tr><th>Factor</th><th className="right">WTT</th><th className="right">TTW</th><th>Unit</th><th>Source</th><th className="right">Legs</th></tr></thead>
            <tbody>{model.factorsUsed.slice(0, 20).map((item) => <tr key={`${item.factor}${item.wtt}`}><td>{item.factor}</td><td className="right num">{fmt(item.wtt, 5)}</td><td className="right num">{fmt(item.ttw, 5)}</td><td className="whitespace-nowrap text-[12px]">{item.unit}</td><td className="text-[12px] text-grey-600">{item.source} · {item.ref}</td><td className="right num">{item.legs}</td></tr>)}</tbody></table></div>
          <p className="mt-5 text-sm font-bold">Sources</p>
          <ul className="mt-2 grid gap-1.5 text-[13px] text-grey-700">{model.sources.map((source) => <li key={source.url}>{source.publisher} ({source.year}). <a className="text-maroon-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
        </ReportSection>
      </article>
    </div>
  );
}
