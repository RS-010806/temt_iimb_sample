"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, GitBranch, Loader2, Package, Plane, Ship, TrainFront, Truck, UploadCloud, Waves, XCircle } from "lucide-react";
import { emissionsText, fmt } from "@/lib/format";
import { FORMAT_LABELS, IMPORT_TEMPLATES, parseImport, templateCsv, templateXlsx, type ImportFormat, type ImportRow, type TemplateId } from "@/lib/import";
import { DIRECTION_LABELS, type Direction } from "@/lib/records";
import { actions, useSettings, useStore } from "@/lib/store";
import { downloadBlob } from "@/lib/exports/common";
import { Field, NumberInput, PageHeader, Segmented, Select, Toggle, cx, useToast } from "../../ui";

const TEMPLATE_ICON: Record<TemplateId, typeof Truck> = { road: Truck, courier: Package, rail: TrainFront, air: Plane, sea: Ship, iww: Waves, temt: GitBranch };

export function ImportView() {
  const settings = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [businessUnit, setBusinessUnit] = useState(settings.businessUnits[0] ?? "Operations");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [defaultTonnes, setDefaultTonnes] = useState<number | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ format: ImportFormat; rows: ImportRow[] } | null>(null);
  const [filter, setFilter] = useState<"all" | "ok" | "warning" | "error">("all");
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [updateMatches, setUpdateMatches] = useState(true);
  const shipments = useStore((state) => state.shipments);

  const read = async (next: File | null = file) => {
    if (!next) return;
    setFile(next); setBusy(true); setError(""); setResult(null); setDone(null);
    try { setResult(await parseImport(next, { businessUnit, direction, defaultTonnes, factorSet: settings.factorSet })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the file."); }
    finally { setBusy(false); }
  };

  const counts = result ? { ok: result.rows.filter((row) => row.status === "ok").length, warning: result.rows.filter((row) => row.status === "warning").length, error: result.rows.filter((row) => row.status === "error").length } : null;
  const importable = result?.rows.filter((row) => row.record) ?? [];
  const total = importable.reduce((sum, row) => sum + (row.summary.kg ?? 0), 0);
  const visible = (result?.rows ?? []).filter((row) => filter === "all" || row.status === filter);

  // Rows whose reference (LR, RR, AWB, B/L) is already saved update that shipment instead of adding a second one.
  const saved = new Map(shipments.map((item) => [item.ref.trim().toLowerCase(), item]));
  const matchOf = (row: ImportRow) => (row.record && row.summary.refInFile ? saved.get(row.summary.ref.trim().toLowerCase()) : undefined);
  const matches = importable.filter((row) => matchOf(row)).length;

  const commit = () => {
    let updated = 0;
    const added = [];
    for (const row of importable) {
      const existing = updateMatches ? matchOf(row) : undefined;
      if (existing) { actions.updateShipment(existing.id, { ...row.record!, id: existing.id, createdAt: existing.createdAt }); updated += 1; } else added.push(row.record!);
    }
    if (added.length) actions.addShipments(added, `${added.length} shipments from ${file?.name}`);
    setDone(importable.length);
    toast({ tone: "ok", message: `Imported ${fmt(added.length)} new ${added.length === 1 ? "shipment" : "shipments"}${updated ? ` and updated ${fmt(updated)} with ${updated === 1 ? "a matching reference" : "matching references"}` : ""} (${emissionsText(total)}).` });
  };

  const errorReport = async () => {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.unparse(result!.rows.filter((row) => row.status !== "ok").map((row) => ({ line: row.line, status: row.status, reference: row.summary.ref, route: row.summary.route, messages: row.messages.join(" | ") })), { escapeFormulae: true });
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv" }), `temt-import-issues-${file?.name.replace(/\.[^.]+$/, "")}.csv`);
  };

  return (
    <div>
      <PageHeader eyebrow="Bulk import" title="Bring a year of freight in one go" description="Download the template for the way you ship, fill it in and upload it. Every row is located, validated and calculated before anything is saved." />
      <section className="card card-pad mb-6" aria-labelledby="templates-heading">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="templates-heading" className="card-title">1. Download the template for your mode</h2>
          <p className="text-[13px] text-grey-600">Each has only the columns that mode needs, with instructions and drop-down lists.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {IMPORT_TEMPLATES.map((template) => {
            const Icon = TEMPLATE_ICON[template.id];
            return (
              <li key={template.id} className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3.5">
                <p className="flex items-center gap-2 text-[14px] font-bold text-ink"><Icon size={16} className="shrink-0 text-maroon-600" aria-hidden="true" />{template.label}</p>
                <p className="flex-1 text-[12.5px] leading-snug text-grey-600">{template.summary}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" aria-label={`Download the ${template.label} template as Excel`} onClick={async () => downloadBlob(new Blob([await templateXlsx(template.id)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${template.file}.xlsx`)}><Download size={14} aria-hidden="true" /> Excel</button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Download the ${template.label} template as CSV`} onClick={async () => downloadBlob(new Blob([await templateCsv(template.id)], { type: "text/csv" }), `${template.file}.csv`)}><Download size={14} aria-hidden="true" /> CSV</button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12.5px] text-grey-600">Also recognised automatically: bulk files exported from earlier TEMT versions, and GST e-way bill JSON (PIN codes, declared distance and item weights).</p>
      </section>

      <section className="card card-pad mb-6">
        <h2 className="card-title mb-4">2. Defaults for rows that leave them blank</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Business unit"><input className="input" value={businessUnit} onChange={(event) => setBusinessUnit(event.target.value)} /></Field>
          <Field label="Direction"><Select value={direction} onChange={setDirection} options={(Object.keys(DIRECTION_LABELS) as Direction[]).map((key) => ({ value: key, label: DIRECTION_LABELS[key] }))} /></Field>
          <Field label="Default weight" hint="Used when an e-way bill has no mass units"><NumberInput value={defaultTonnes} onChange={setDefaultTonnes} suffix="TON" placeholder="Optional" /></Field>
        </div>
      </section>

      <div data-tour="import-drop" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); read(event.dataTransfer.files[0] ?? null); }}
        className={cx("grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition", dragging ? "border-maroon-500 bg-maroon-50" : "border-stone-300 bg-white")}>
        {busy ? <Loader2 size={34} className="animate-spin text-maroon-600" aria-hidden="true" /> : <UploadCloud size={36} className="text-maroon-600" aria-hidden="true" />}
        <p className="text-lg font-bold">{busy ? `Reading ${file?.name}…` : "3. Drop the filled template (CSV or Excel), an earlier TEMT file or e-way bill JSON"}</p>
        <p className="text-sm text-grey-600">Up to 5,000 rows per file. Nothing is saved until you confirm.</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>Choose file</button>
          {file && !busy && <button type="button" className="btn btn-secondary" onClick={() => read()}>Re-read with these defaults</button>}
        </div>
        <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,.json,text/csv,application/json" onChange={(event) => read(event.target.files?.[0] ?? null)} aria-label="Choose a file to import" />
      </div>

      {error && <p className="callout callout-warn mt-6"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}

      {result && counts && (
        <section className="mt-6 grid gap-4 animate-rise">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">{FORMAT_LABELS[result.format]}</p>
              <h2 className="text-xl font-bold">{fmt(result.rows.length)} {result.rows.length === 1 ? "shipment" : "shipments"} read from {file?.name}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(counts.warning > 0 || counts.error > 0) && <button type="button" className="btn btn-secondary" onClick={errorReport}><Download size={15} aria-hidden="true" /> Issue report</button>}
              {done === null ? <button type="button" className="btn btn-primary" onClick={commit} disabled={!importable.length}><CheckCircle2 size={16} aria-hidden="true" /> Import {fmt(importable.length)} shipments · {emissionsText(total)}</button>
                : <Link prefetch={false} href="/app/" className="btn btn-primary">Imported {fmt(done)}. View overview</Link>}
            </div>
          </div>
          {matches > 0 && done === null && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <Toggle checked={updateMatches} onChange={setUpdateMatches} label={`${fmt(matches)} ${matches === 1 ? "reference is" : "references are"} already saved`}
                description={updateMatches ? "These rows will update the saved shipments with the same reference, so each LR, RR or AWB stays one shipment." : "These rows will be added as separate shipments."} />
            </div>
          )}
          <Segmented ariaLabel="Filter rows" value={filter} onChange={setFilter} options={[{ value: "all", label: `All ${result.rows.length}` }, { value: "ok", label: `Ready ${counts.ok}`, icon: <CheckCircle2 size={13} className="text-ok" aria-hidden="true" /> }, { value: "warning", label: `Check ${counts.warning}`, icon: <AlertTriangle size={13} className="text-warn" aria-hidden="true" /> }, { value: "error", label: `Errors ${counts.error}`, icon: <XCircle size={13} className="text-maroon-600" aria-hidden="true" /> }]} />
          <div className="table-wrap max-h-[560px] overflow-y-auto">
            <table className="table">
              <thead><tr><th>Line</th><th>Status</th><th>Reference</th><th>Date</th><th>Route</th><th>Mode</th><th className="right">Cargo</th><th className="right">km</th><th className="right">Emissions</th><th>Notes</th></tr></thead>
              <tbody>
                {visible.slice(0, 500).map((row) => (
                  <tr key={row.line} className={row.status === "error" ? "bg-maroon-50/40" : undefined}>
                    <td className="num text-grey-500">{row.line}</td>
                    <td>{row.status === "ok" ? <span className="badge badge-ok">Ready</span> : row.status === "warning" ? <span className="badge badge-warn">Check</span> : <span className="badge badge-maroon">Error</span>}</td>
                    <td className="mono text-[12px]">{row.summary.ref || <span className="font-sans text-grey-400">None</span>}{matchOf(row) && updateMatches && <span className="badge badge-info ml-1.5 font-sans">Updates saved</span>}</td><td className="whitespace-nowrap">{row.summary.date}</td>
                    <td className="max-w-[240px] truncate" title={row.summary.route}>{row.summary.route}</td><td className="whitespace-nowrap capitalize">{row.summary.mode}</td>
                    <td className="right num">{row.summary.tonnes !== undefined ? fmt(row.summary.tonnes, 2) : "–"}</td><td className="right num">{row.summary.km ? fmt(row.summary.km, 0) : "–"}</td>
                    <td className="right num font-semibold">{row.summary.kg !== undefined ? emissionsText(row.summary.kg) : "–"}</td>
                    <td className="min-w-[240px] max-w-[360px] text-[12px] text-grey-600">{row.messages.slice(0, 2).join(" ")}{row.messages.length > 2 ? ` (+${row.messages.length - 2})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length > 500 && <p className="text-xs text-grey-500">Showing the first 500 rows of {fmt(visible.length)}.</p>}
        </section>
      )}
    </div>
  );
}
