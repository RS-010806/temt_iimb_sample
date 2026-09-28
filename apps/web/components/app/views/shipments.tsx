"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Database, Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { MODE_LABELS, type TransportMode } from "@temt/calculator";
import { applyFilters, totals } from "@/lib/analytics";
import { emissionsText, fmt, formatDate, todayIso, uid } from "@/lib/format";
import { DIRECTION_LABELS, MODE_COLORS, PAID_BY_LABELS, scopeOf, SCOPE_LABELS, type ComputedShipment, type ScopeKey } from "@/lib/records";
import { actions, useSettings } from "@/lib/store";
import { setView, useView } from "@/lib/view-state";
import { downloadBlob } from "@/lib/exports/common";
import { StageBar } from "../charts";
import { BasisBody } from "../basis";
import { FilterBar } from "./dashboard";
import { Drawer, EmptyState, PageHeader, Select, cx, useToast } from "../../ui";

const PAGE = 50;
type SortKey = "date" | "wtw" | "intensity" | "tonnes";

const SOURCE_LABELS: Record<ComputedShipment["source"], string> = {
  manual: "Manual entry", import: "Imported file", chain: "Transport chain", compare: "Mode comparison", copilot: "Copilot",
  sample: "Sample data", ewaybill: "E-way bill", "legacy-temt": "Earlier TEMT file",
};
const QUALITY_LABELS = { primary: "Primary data", modelled: "Modelled data", default: "Default values" } as const;

function Detail({ row, onClose }: { row: ComputedShipment | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  if (!row) return null;
  const result = row.result;
  const duplicate = () => {
    const now = new Date().toISOString();
    actions.addShipments([{ ...row, id: uid("s"), ref: `${row.ref}-COPY`, date: todayIso(), createdAt: now, updatedAt: now, source: "manual" }]);
    toast({ tone: "ok", message: "Duplicated with today's date." });
    onClose();
  };
  const remove = () => {
    const removed = actions.removeShipments([row.id]);
    toast({ tone: "info", message: `Deleted ${row.ref}.`, action: { label: "Undo", onClick: () => actions.restoreShipments(removed) } });
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={row.ref} subtitle={`${formatDate(row.date, "long")} · ${row.origin.label} → ${row.destination.label}`} width={620}
      footer={<div className="flex flex-wrap justify-between gap-2"><button type="button" className="btn btn-ghost text-maroon-700" onClick={remove}><Trash2 size={15} aria-hidden="true" /> Delete</button><div className="flex gap-2"><button type="button" className="btn btn-secondary" onClick={duplicate}><Copy size={15} aria-hidden="true" /> Duplicate</button><button type="button" className="btn btn-primary" onClick={() => router.push(row.kind === "chain" ? `/app/chain/?edit=${row.id}` : `/app/calculate/?edit=${row.id}`)}><Pencil size={15} aria-hidden="true" /> Edit</button></div></div>}>
      {!result ? <p className="callout callout-warn">{row.error}</p> : (
        <div className="grid gap-5">
          <div className="rounded-xl bg-gradient-to-br from-maroon-800 to-maroon-950 p-5 text-white">
            <p className="text-xs text-maroon-200">Well-to-wheel emissions</p>
            <p className="num mt-1 text-3xl font-bold">{emissionsText(result.wtwKg)}</p>
            <p className="mt-1 text-[13px] text-maroon-100">{fmt(result.cargoTonnes, 2)} t · {fmt(result.distanceKm, 0)} km · {fmt(result.intensityG, 1)} g/t-km · {fmt(result.kgPerTonne, 2)} kg/t</p>
          </div>
          <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} />
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            {[["Business unit", row.businessUnit], ["Commodity", row.commodity], ["Direction", DIRECTION_LABELS[row.direction]], ["Who pays", PAID_BY_LABELS[row.paidBy]], ["Source", SOURCE_LABELS[row.source]], ["Data quality", QUALITY_LABELS[result.dataQuality]]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-stone-50 p-3"><dt className="text-xs text-grey-600">{label}</dt><dd className="mt-0.5 font-semibold">{value}</dd></div>
            ))}
          </dl>
          <div className="grid gap-3">
            <h3 className="font-bold">Legs</h3>
            {result.legs.map((leg, index) => (
              <div key={index} className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 font-semibold"><span className="dot" style={{ background: MODE_COLORS[leg.mode] }} />Leg {index + 1} · {MODE_LABELS[leg.mode]}</p><p className="num font-bold">{emissionsText(leg.wtwKg)}</p></div>
                <p className="mt-1 text-xs text-grey-600">{row.legMeta[index]?.from?.label ?? "–"} → {row.legMeta[index]?.to?.label ?? "–"} · {fmt(leg.distanceKm, 0)} km · {SCOPE_LABELS[scopeOf(row, leg.method)].short}</p>
              </div>
            ))}
            {result.hubs.map((hub, index) => (
              <div key={`h${index}`} className="flex justify-between gap-3 rounded-xl border border-stone-200 p-4"><p className="min-w-0 font-semibold">{hub.label}</p><p className="num shrink-0 font-bold">{emissionsText(hub.wtwKg)}</p></div>
            ))}
            <BasisBody result={result} legMeta={row.legMeta} />
          </div>
          {row.notes && <p className="text-[13px] text-grey-600">Notes: {row.notes}</p>}
        </div>
      )}
    </Drawer>
  );
}

export function ShipmentsView() {
  const { fy, businessUnit, rows: all } = useView();
  const settings = useSettings();
  const toast = useToast();
  const [mode, setMode] = useState<TransportMode | "all">("all");
  const [scope, setScope] = useState<ScopeKey | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = applyFilters(all, { fy, businessUnit, mode, scope, search });
    const value = (row: ComputedShipment) => sort.key === "date" ? row.date : sort.key === "wtw" ? row.result?.wtwKg ?? 0 : sort.key === "intensity" ? row.result?.intensityG ?? 0 : row.result?.cargoTonnes ?? 0;
    return [...filtered].sort((a, b) => { const x = value(a), y = value(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [all, fy, businessUnit, mode, scope, search, sort]);
  const t = totals(rows);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = rows.slice(page * PAGE, page * PAGE + PAGE);
  const openRow = all.find((row) => row.id === open) ?? null;

  const header = (key: SortKey, label: string, right = true) => (
    <th className={right ? "right" : undefined}><button type="button" className="inline-flex items-center gap-1 font-bold hover:text-maroon-700" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : -1 })}>{label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}</button></th>
  );

  const removeSelected = () => {
    const removed = actions.removeShipments([...selected]);
    setSelected(new Set());
    toast({ tone: "info", message: `Deleted ${removed.length} shipments.`, action: { label: "Undo", onClick: () => actions.restoreShipments(removed) } });
  };
  const exportSelected = async () => {
    const Papa = (await import("papaparse")).default;
    const chosen = rows.filter((row) => selected.size === 0 || selected.has(row.id));
    const csv = Papa.unparse(chosen.map((row) => ({ reference: row.ref, date: row.date, business_unit: row.businessUnit, origin: row.origin.label, destination: row.destination.label, modes: row.input.legs.map((leg) => leg.mode).join("+"), cargo_t: row.result?.cargoTonnes, distance_km: row.result?.distanceKm, wtw_kgco2e: row.result?.wtwKg, ttw_kgco2e: row.result?.ttwKg, wtt_kgco2e: row.result?.wttKg, hub_kgco2e: row.result?.hubKg, intensity_g_tkm: row.result?.intensityG, data_quality: row.result?.dataQuality, factor_set: settings.factorSet })), { escapeFormulae: true });
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv" }), `temt-shipments-${todayIso()}.csv`);
  };

  if (!all.length) return (
    <div><PageHeader eyebrow="Shipments" title="Your shipment ledger" />
      <EmptyState icon={<Database size={26} />} title="No shipments yet" body="Calculate a shipment, import a file or load a sample workspace from the overview." actions={<><Link prefetch={false} href="/app/calculate/" className="btn btn-primary"><Plus size={16} aria-hidden="true" /> Calculate</Link><Link prefetch={false} href="/app/import/" className="btn btn-secondary"><Upload size={16} aria-hidden="true" /> Import</Link></>} /></div>
  );

  return (
    <div>
      <PageHeader eyebrow="Shipments" title="Your shipment ledger" description={`${fmt(t.shipments)} shipments · ${emissionsText(t.wtwKg)} · ${fmt(t.intensityG, 1)} g CO₂e per tonne-km in this view.`}
        actions={<><button type="button" className="btn btn-secondary" onClick={exportSelected}><Download size={16} aria-hidden="true" /> {selected.size ? `Export ${selected.size}` : "Export CSV"}</button><Link prefetch={false} href="/app/calculate/" className="btn btn-primary"><Plus size={16} aria-hidden="true" /> New shipment</Link></>} />
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grey-400" aria-hidden="true" /><input className="input !min-h-[38px] pl-9" placeholder="Search reference, place, business unit or commodity" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} aria-label="Search shipments" /></div>
        <FilterBar />
        <Select ariaLabel="Mode" value={mode} onChange={(value) => { setMode(value); setPage(0); }} className="!w-auto !min-h-[38px] !py-1.5 text-[13px] font-semibold" options={[{ value: "all", label: "All modes" }, ...(Object.keys(MODE_LABELS) as TransportMode[]).map((key) => ({ value: key, label: MODE_LABELS[key] }))]} />
        <Select ariaLabel="Scope" value={scope} onChange={(value) => { setScope(value); setPage(0); }} className="!w-auto !min-h-[38px] !py-1.5 text-[13px] font-semibold" options={[{ value: "all", label: "All scopes" }, ...(Object.keys(SCOPE_LABELS) as ScopeKey[]).map((key) => ({ value: key, label: SCOPE_LABELS[key].short }))]} />
        {(fy !== "all" || businessUnit !== "all" || mode !== "all" || scope !== "all" || search) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView({ fy: "all", businessUnit: "all" }); setMode("all"); setScope("all"); setSearch(""); }}>Clear filters</button>}
      </div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-maroon-900 px-4 py-2.5 text-sm text-white animate-fade">
          <span>{selected.size} selected</span>
          <div className="flex gap-2"><button type="button" className="btn btn-sm btn-outline-light" onClick={() => setSelected(new Set())}>Clear</button><button type="button" className="btn btn-sm btn-light" onClick={removeSelected}><Trash2 size={14} aria-hidden="true" /> Delete</button></div>
        </div>
      )}
      <div className="table-wrap" data-tour="ledger">
        <table className="table">
          <thead><tr>
            <th className="w-10"><input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-[var(--color-maroon-600)]" checked={current.length > 0 && current.every((row) => selected.has(row.id))} onChange={(event) => { const next = new Set(selected); current.forEach((row) => event.target.checked ? next.add(row.id) : next.delete(row.id)); setSelected(next); }} /></th>
            <th>Reference</th>{header("date", "Date", false)}<th>Route</th><th>Modes</th><th>Business unit</th>{header("tonnes", "Cargo")}{header("wtw", "Emissions")}{header("intensity", "g/t-km")}<th>Scope</th><th>Data</th>
          </tr></thead>
          <tbody>
            {current.map((row) => (
              <tr key={row.id} className="cursor-pointer" onClick={() => setOpen(row.id)}>
                <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${row.ref}`} className="h-4 w-4 accent-[var(--color-maroon-600)]" checked={selected.has(row.id)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(row.id); else next.delete(row.id); setSelected(next); }} /></td>
                <td className="mono whitespace-nowrap text-[12px]">{row.ref}</td>
                <td className="whitespace-nowrap">{formatDate(row.date)}</td>
                <td className="max-w-[260px]"><span className="block truncate font-semibold" title={`${row.origin.label} → ${row.destination.label}`}>{row.origin.label} → {row.destination.label}</span><span className="text-xs text-grey-500">{row.commodity}</span></td>
                <td><span className="flex flex-wrap gap-1">{[...new Set(row.input.legs.map((leg) => leg.mode))].map((m) => <span key={m} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold"><span className="dot !h-1.5 !w-1.5" style={{ background: MODE_COLORS[m] }} />{MODE_LABELS[m]}</span>)}</span></td>
                <td className="whitespace-nowrap text-grey-700">{row.businessUnit}</td>
                <td className="right num">{fmt(row.result?.cargoTonnes ?? 0, 1)} t</td>
                <td className="right num font-semibold">{row.result ? emissionsText(row.result.wtwKg) : <span className="text-maroon-700">Error</span>}</td>
                <td className="right num text-grey-700">{row.result ? fmt(row.result.intensityG, 1) : "–"}</td>
                <td className="whitespace-nowrap text-[12px]">{SCOPE_LABELS[scopeOf(row, row.input.legs[0]?.method)].short}</td>
                <td><span className={cx("badge !text-[11px] capitalize", row.result?.dataQuality === "primary" ? "badge-ok" : "badge-stone")}>{row.result?.dataQuality ?? "–"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-sm text-grey-600">No shipments match these filters.</p>}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-grey-600">Showing {fmt(page * PAGE + 1)}–{fmt(Math.min(rows.length, (page + 1) * PAGE))} of {fmt(rows.length)}</span>
          <div className="flex gap-2"><button type="button" className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>
        </div>
      )}
      <Detail row={openRow} onClose={() => setOpen(null)} />
    </div>
  );
}
