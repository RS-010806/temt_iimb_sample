"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileJson, FileSpreadsheet, History, Loader2, UploadCloud, XCircle } from "lucide-react";
import { emissionsText, fmt } from "@/lib/format";
import { FORMAT_LABELS, parseImport, templateCsv, templateXlsx, type ImportFormat, type ImportRow } from "@/lib/import";
import { DIRECTION_LABELS, PAID_BY_LABELS, type Direction, type PaidBy } from "@/lib/records";
import { actions, useSettings } from "@/lib/store";
import { downloadBlob } from "@/lib/exports/common";
import { Field, NumberInput, PageHeader, Segmented, Select, cx, useToast } from "../../ui";

export function ImportView() {
  const settings = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [businessUnit, setBusinessUnit] = useState(settings.businessUnits[0] ?? "Operations");
  const [paidBy, setPaidBy] = useState<PaidBy>("company");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [defaultTonnes, setDefaultTonnes] = useState<number | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ format: ImportFormat; rows: ImportRow[] } | null>(null);
  const [filter, setFilter] = useState<"all" | "ok" | "warning" | "error">("all");
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const read = async (next: File | null = file) => {
    if (!next) return;
    setFile(next); setBusy(true); setError(""); setResult(null); setDone(null);
    try { setResult(await parseImport(next, { businessUnit, paidBy, direction, defaultTonnes, factorSet: settings.factorSet })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the file."); }
    finally { setBusy(false); }
  };

  const counts = result ? { ok: result.rows.filter((row) => row.status === "ok").length, warning: result.rows.filter((row) => row.status === "warning").length, error: result.rows.filter((row) => row.status === "error").length } : null;
  const importable = result?.rows.filter((row) => row.record) ?? [];
  const total = importable.reduce((sum, row) => sum + (row.summary.kg ?? 0), 0);
  const visible = (result?.rows ?? []).filter((row) => filter === "all" || row.status === filter);

  const commit = () => {
    const records = importable.map((row) => row.record!);
    actions.addShipments(records, `${records.length} shipments from ${file?.name}`);
    setDone(records.length);
    toast({ tone: "ok", message: `Imported ${fmt(records.length)} shipments (${emissionsText(total)}).` });
  };

  const errorReport = async () => {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.unparse(result!.rows.filter((row) => row.status !== "ok").map((row) => ({ line: row.line, status: row.status, reference: row.summary.ref, route: row.summary.route, messages: row.messages.join(" | ") })), { escapeFormulae: true });
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv" }), `temt-import-issues-${file?.name.replace(/\.[^.]+$/, "")}.csv`);
  };

  return (
    <div>
      <PageHeader eyebrow="Bulk import" title="Bring a year of freight in one go" description="Upload the TEMT template, bulk files from earlier TEMT versions or e-way bill exports. Every row is located, validated and calculated before anything is saved." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card card-pad animate-rise">
          <FileSpreadsheet size={22} className="text-maroon-600" aria-hidden="true" />
          <h2 className="mt-3 font-bold">TEMT template</h2>
          <p className="mt-1 text-[13px] text-grey-600">One row per shipment leg. Distances optional: cities and PIN codes are enough. Includes examples and an instructions sheet.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={async () => downloadBlob(new Blob([await templateXlsx()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "TEMT-import-template.xlsx")}><Download size={14} aria-hidden="true" /> Excel</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={async () => downloadBlob(new Blob([await templateCsv()], { type: "text/csv" }), "TEMT-import-template.csv")}><Download size={14} aria-hidden="true" /> CSV</button>
          </div>
        </div>
        <div className="card card-pad animate-rise" style={{ animationDelay: "60ms" }}>
          <History size={22} className="text-maroon-600" aria-hidden="true" />
          <h2 className="mt-3 font-bold">Earlier TEMT files</h2>
          <p className="mt-1 text-[13px] text-grey-600">Detected automatically: point to point, courier / PTL, railway, air, coastal and international water bulk templates, exactly as exported from earlier TEMT versions.</p>
        </div>
        <div className="card card-pad animate-rise" style={{ animationDelay: "120ms" }}>
          <FileJson size={22} className="text-maroon-600" aria-hidden="true" />
          <h2 className="mt-3 font-bold">E-way bill JSON</h2>
          <p className="mt-1 text-[13px] text-grey-600">Reads PIN codes, declared distance, mode, date and item weights (KGS, QTL, MTS, TON) from GST e-way bill exports.</p>
        </div>
      </div>

      <section className="card card-pad mb-6">
        <h2 className="card-title mb-4">Defaults for rows that don't say</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Business unit"><input className="input" value={businessUnit} onChange={(event) => setBusinessUnit(event.target.value)} /></Field>
          <Field label="Who operates or pays"><Select value={paidBy} onChange={setPaidBy} options={(Object.keys(PAID_BY_LABELS) as PaidBy[]).map((key) => ({ value: key, label: PAID_BY_LABELS[key] }))} /></Field>
          <Field label="Direction"><Select value={direction} onChange={setDirection} options={(Object.keys(DIRECTION_LABELS) as Direction[]).map((key) => ({ value: key, label: DIRECTION_LABELS[key] }))} /></Field>
          <Field label="Default weight" hint="Used when an e-way bill has no mass units"><NumberInput value={defaultTonnes} onChange={setDefaultTonnes} suffix="t" placeholder="Optional" /></Field>
        </div>
      </section>

      <div data-tour="import-drop" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); read(event.dataTransfer.files[0] ?? null); }}
        className={cx("grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition", dragging ? "border-maroon-500 bg-maroon-50" : "border-stone-300 bg-white")}>
        {busy ? <Loader2 size={34} className="animate-spin text-maroon-600" aria-hidden="true" /> : <UploadCloud size={36} className="text-maroon-600" aria-hidden="true" />}
        <p className="text-lg font-bold">{busy ? `Reading ${file?.name}…` : "Drop a CSV, Excel (.xlsx) or e-way bill JSON file"}</p>
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
              <h2 className="text-xl font-bold">{fmt(result.rows.length)} {result.format === "temt" ? "shipments" : "rows"} read from {file?.name}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(counts.warning > 0 || counts.error > 0) && <button type="button" className="btn btn-secondary" onClick={errorReport}><Download size={15} aria-hidden="true" /> Issue report</button>}
              {done === null ? <button type="button" className="btn btn-primary" onClick={commit} disabled={!importable.length}><CheckCircle2 size={16} aria-hidden="true" /> Import {fmt(importable.length)} shipments · {emissionsText(total)}</button>
                : <Link prefetch={false} href="/app/" className="btn btn-primary">Imported {fmt(done)}. View overview</Link>}
            </div>
          </div>
          <Segmented ariaLabel="Filter rows" value={filter} onChange={setFilter} options={[{ value: "all", label: `All ${result.rows.length}` }, { value: "ok", label: `Ready ${counts.ok}`, icon: <CheckCircle2 size={13} className="text-ok" aria-hidden="true" /> }, { value: "warning", label: `Check ${counts.warning}`, icon: <AlertTriangle size={13} className="text-warn" aria-hidden="true" /> }, { value: "error", label: `Errors ${counts.error}`, icon: <XCircle size={13} className="text-maroon-600" aria-hidden="true" /> }]} />
          <div className="table-wrap max-h-[560px] overflow-y-auto">
            <table className="table">
              <thead><tr><th>Line</th><th>Status</th><th>Reference</th><th>Date</th><th>Route</th><th>Mode</th><th className="right">Cargo</th><th className="right">km</th><th className="right">Emissions</th><th>Notes</th></tr></thead>
              <tbody>
                {visible.slice(0, 500).map((row) => (
                  <tr key={row.line} className={row.status === "error" ? "bg-maroon-50/40" : undefined}>
                    <td className="num text-grey-500">{row.line}</td>
                    <td>{row.status === "ok" ? <span className="badge badge-ok">Ready</span> : row.status === "warning" ? <span className="badge badge-warn">Check</span> : <span className="badge badge-maroon">Error</span>}</td>
                    <td className="mono text-[12px]">{row.summary.ref}</td><td className="whitespace-nowrap">{row.summary.date}</td>
                    <td className="max-w-[240px] truncate" title={row.summary.route}>{row.summary.route}</td><td className="capitalize">{row.summary.mode}</td>
                    <td className="right num">{row.summary.tonnes !== undefined ? fmt(row.summary.tonnes, 2) : "–"}</td><td className="right num">{row.summary.km ? fmt(row.summary.km, 0) : "–"}</td>
                    <td className="right num font-semibold">{row.summary.kg !== undefined ? emissionsText(row.summary.kg) : "–"}</td>
                    <td className="max-w-[320px] text-[12px] text-grey-600">{row.messages.slice(0, 2).join(" ")}{row.messages.length > 2 ? ` (+${row.messages.length - 2})` : ""}</td>
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
