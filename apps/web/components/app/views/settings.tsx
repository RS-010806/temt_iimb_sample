"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Cpu, Database, Download, History, Loader2, Server, Trash2, Upload, X } from "lucide-react";
import { FACTOR_SETS, type FactorSetId } from "@temt/calculator";
import { applyFilters, fiscalYears, totals } from "@/lib/analytics";
import { testLocalModel } from "@/lib/copilot/local-llm";
import { downloadBlob } from "@/lib/exports/common";
import { emissionsText, fmt, todayIso } from "@/lib/format";
import { SAMPLE_SECTORS, type SampleSector } from "@/lib/sample-data";
import { actions, backupPayload, restoreBackup, selectComputed, getState, useSettings, useStore } from "@/lib/store";
import { CompanyPicker, loadSample } from "../onboarding";
import { Field, Modal, NumberInput, PageHeader, Segmented, Select, cx, useToast } from "../../ui";

function Card({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card card-pad scroll-mt-24 animate-rise">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-[13.5px] text-grey-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const settings = useSettings();
  const storage = useStore((state) => state.storage);
  const count = useStore((state) => state.shipments.length);
  const activity = useStore((state) => state.activity);
  const toast = useToast();
  const restoreInput = useRef<HTMLInputElement>(null);
  const [unit, setUnit] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ state: "idle" | "busy" | "ok" | "error"; message?: string }>({ state: "idle" });
  const [server, setServer] = useState<{ state: "idle" | "busy" | "ok" | "error"; message?: string }>({ state: "idle" });
  const org = settings.organisation;
  const update = actions.updateSettings;

  const verifyServer = async () => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!base) { setServer({ state: "error", message: "No API is configured for this deployment." }); return; }
    const rows = selectComputed(getState());
    const fy = fiscalYears(rows)[0];
    const scope = applyFilters(rows, { fy }).filter((row) => row.result).slice(0, 200);
    if (!scope.length) { setServer({ state: "error", message: "Add shipments first." }); return; }
    setServer({ state: "busy", message: "Contacting the TEMT API (a free server can take up to a minute to wake)…" });
    try {
      const response = await fetch(`${base}/api/v2/calculate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factorSet: settings.factorSet, shipments: scope.map((row) => ({ id: row.id, ...row.input })) }), signal: AbortSignal.timeout(90000) });
      const payload = await response.json() as { totals?: { wtwKg: number }; error?: { message: string } };
      if (!response.ok || !payload.totals) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      const local = totals(scope).wtwKg;
      const diff = Math.abs(payload.totals.wtwKg - local) / (local || 1) * 100;
      setServer({ state: "ok", message: `Server recalculated ${scope.length} shipments: ${emissionsText(payload.totals.wtwKg)} vs ${emissionsText(local)} in the browser (difference ${diff.toFixed(6)}%). Nothing was stored on the server.` });
    } catch (error) { setServer({ state: "error", message: error instanceof Error ? error.message : "The API did not respond." }); }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Workspace settings" description="Organisation details, targets, factor set, Copilot, data backup and the audit trail." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="organisation" title="Organisation" description="Shown on reports. Revenue enables BRSR intensity per ₹ crore.">
          <div className="grid gap-4">
            <Field label="Find your company in the NIFTY 500"><CompanyPicker onPick={(company) => update({ organisation: { ...org, name: company.name, symbol: company.symbol, industry: company.industry } }, "Organisation set")} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Organisation name"><input className="input" value={org.name} onChange={(event) => update({ organisation: { ...org, name: event.target.value } })} /></Field>
              <Field label="Industry"><input className="input" value={org.industry ?? ""} onChange={(event) => update({ organisation: { ...org, industry: event.target.value } })} /></Field>
              <Field label="Annual revenue" hint="For emissions per ₹ crore in the BRSR table"><NumberInput value={org.revenueCrore} onChange={(revenueCrore) => update({ organisation: { ...org, revenueCrore } })} suffix="₹ cr" /></Field>
              <Field label="Reporting contact"><input className="input" value={org.contact ?? ""} onChange={(event) => update({ organisation: { ...org, contact: event.target.value } })} placeholder="Name or email" /></Field>
            </div>
            <Field label="Business units">
              <div className="flex flex-wrap gap-2">
                {settings.businessUnits.map((item) => <span key={item} className="badge badge-stone !py-1 !text-[13px]">{item}<button type="button" onClick={() => update({ businessUnits: settings.businessUnits.filter((value) => value !== item) })} aria-label={`Remove ${item}`} className="text-grey-500 hover:text-maroon-700"><X size={12} /></button></span>)}
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (unit.trim()) { update({ businessUnits: [...new Set([...settings.businessUnits, unit.trim()])] }); setUnit(""); } }}>
                  <input className="input !min-h-[32px] !w-40 !py-1" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Add a unit" aria-label="New business unit" /><button type="submit" className="btn btn-secondary btn-sm">Add</button>
                </form>
              </div>
            </Field>
          </div>
        </Card>

        <Card id="factors" title="Factor set" description="Switching recalculates every shipment. Inputs are never changed.">
          <Segmented ariaLabel="Factor set" value={settings.factorSet} onChange={(factorSet: FactorSetId) => { update({ factorSet }); toast({ tone: "ok", message: `Now using ${FACTOR_SETS[factorSet].short}.` }); }} options={(Object.keys(FACTOR_SETS) as FactorSetId[]).map((id) => ({ value: id, label: FACTOR_SETS[id].short }))} />
          <p className="mt-3 text-[13.5px] leading-relaxed text-grey-700">{FACTOR_SETS[settings.factorSet].description}</p>
          <div className="mt-6 border-t border-stone-200 pt-5">
            <h3 className="font-bold">Targets and carbon price</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Reduction target"><NumberInput value={settings.target.reductionPercent} onChange={(value) => update({ target: { ...settings.target, reductionPercent: Math.min(100, Math.max(1, value ?? 30)) } })} suffix="%" /></Field>
              <Field label="Base year"><input className="input" value={settings.target.baseYear} onChange={(event) => update({ target: { ...settings.target, baseYear: event.target.value } })} placeholder="FY 2024–25" /></Field>
              <Field label="Target year"><input className="input" value={settings.target.targetYear} onChange={(event) => update({ target: { ...settings.target, targetYear: event.target.value } })} placeholder="FY 2030–31" /></Field>
              <Field label="Internal carbon price" hint="Optional, shown as a cost on reports"><NumberInput value={settings.carbonPriceInrPerTonne || undefined} onChange={(value) => update({ carbonPriceInrPerTonne: value ?? 0 })} suffix="₹/t" /></Field>
            </div>
          </div>
        </Card>

        <Card id="copilot" title="Copilot" description="The built-in Copilot runs entirely in your browser. You can also connect a model running on your own computer.">
          <Segmented ariaLabel="Copilot engine" value={settings.copilot.engine} onChange={(engine) => update({ copilot: { ...settings.copilot, engine } })} options={[{ value: "builtin", label: "Built-in (no setup)" }, { value: "local-llm", label: "Local model", icon: <Cpu size={13} aria-hidden="true" /> }]} />
          {settings.copilot.engine === "local-llm" && (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="OpenAI-compatible endpoint"><input className="input mono text-[13px]" value={settings.copilot.endpoint} onChange={(event) => update({ copilot: { ...settings.copilot, endpoint: event.target.value } })} /></Field>
                <Field label="Model"><input className="input mono text-[13px]" value={settings.copilot.model} onChange={(event) => update({ copilot: { ...settings.copilot, model: event.target.value } })} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { setLlmStatus({ state: "busy" }); try { setLlmStatus({ state: "ok", message: `Connected: ${await testLocalModel(settings.copilot)}` }); } catch (error) { setLlmStatus({ state: "error", message: error instanceof Error ? error.message : "Not reachable" }); } }}>{llmStatus.state === "busy" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Test connection</button>
                {llmStatus.message && <span className={cx("text-[13px]", llmStatus.state === "ok" ? "text-ok" : "text-maroon-700")}>{llmStatus.message}</span>}
              </div>
              <div className="panel p-4 text-[13px] leading-relaxed text-grey-700">
                <p className="font-semibold text-ink">Set up with Ollama</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Install Ollama from ollama.com and run <code className="mono rounded bg-white px-1">ollama pull {settings.copilot.model}</code></li>
                  <li>Allow this site: <code className="mono rounded bg-white px-1">OLLAMA_ORIGINS={typeof window !== "undefined" ? window.location.origin : "https://temt-iimb-sample.onrender.com"} ollama serve</code></li>
                  <li>Test the connection above. Calculations still come from the TEMT engine; the model only chooses what to do.</li>
                </ol>
              </div>
            </div>
          )}
        </Card>

        <Card id="data" title="Data and backup" description={`${fmt(count)} shipments stored ${storage === "indexeddb" ? "in this browser's IndexedDB" : storage === "localstorage" ? "in this browser's local storage" : "for this session only"}. Nothing is sent anywhere unless you choose.`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="btn btn-secondary justify-start" onClick={() => downloadBlob(new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" }), `temt-workspace-${todayIso()}.json`)}><Download size={16} aria-hidden="true" /> Download backup</button>
            <button type="button" className="btn btn-secondary justify-start" onClick={() => restoreInput.current?.click()}><Upload size={16} aria-hidden="true" /> Restore from backup</button>
            <input ref={restoreInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Restore backup file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = restoreBackup(JSON.parse(await file.text())); toast(result.ok ? { tone: "ok", message: `Restored ${result.count} shipments.` } : { tone: "warn", message: result.error }); } catch { toast({ tone: "warn", message: "That file could not be read." }); } event.target.value = ""; }} />
            <Select ariaLabel="Load a sample workspace" value="" onChange={(sector) => { if (!sector) return; const loaded = loadSample(sector as SampleSector); toast({ tone: "ok", message: `Loaded ${loaded} sample shipments.` }); }} options={[{ value: "", label: "Load a sample workspace…" }, ...(Object.keys(SAMPLE_SECTORS) as SampleSector[]).map((key) => ({ value: key, label: SAMPLE_SECTORS[key].label }))]} />
            <button type="button" className="btn btn-ghost justify-start text-maroon-700" onClick={() => setConfirmClear(true)} disabled={!count}><Trash2 size={16} aria-hidden="true" /> Clear all shipments</button>
          </div>
          <div className="mt-6 border-t border-stone-200 pt-5">
            <h3 className="flex items-center gap-2 font-bold"><Server size={16} className="text-maroon-600" aria-hidden="true" /> Verify on the TEMT server</h3>
            <p className="mt-1 text-[13.5px] text-grey-600">Sends up to 200 shipments from the latest year to the stateless TEMT API, which recalculates them with the same engine and returns the result without storing anything.</p>
            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={verifyServer} disabled={server.state === "busy"}>{server.state === "busy" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />} Run server check</button>
            {server.message && <p className={cx("mt-3 text-[13px]", server.state === "ok" ? "text-ok" : server.state === "error" ? "text-maroon-700" : "text-grey-600")}>{server.message}</p>}
          </div>
        </Card>

        <Card id="activity" title="Activity log" description="An audit trail of changes in this workspace, newest first.">
          {activity.length ? (
            <ol className="scroll-thin grid max-h-80 gap-0 overflow-y-auto">
              {activity.slice(0, 80).map((entry) => (
                <li key={entry.id} className="flex gap-3 border-b border-stone-100 py-2.5 text-[13px] last:border-0">
                  <History size={14} className="mt-0.5 shrink-0 text-grey-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1"><p className="font-semibold">{entry.action}</p><p className="truncate text-grey-600">{entry.detail}</p></div>
                  <time className="shrink-0 text-xs text-grey-500" dateTime={entry.at}>{new Date(entry.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </li>
              ))}
            </ol>
          ) : <p className="flex items-center gap-2 text-sm text-grey-600"><Database size={15} aria-hidden="true" /> No activity yet.</p>}
        </Card>
      </div>
      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all shipments?" footer={<><button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => { actions.clearShipments(); setConfirmClear(false); toast({ tone: "info", message: "Workspace cleared." }); }}>Clear {fmt(count)} shipments</button></>}>
        <p className="text-[14px] text-grey-700">This permanently removes every shipment from this browser. Settings are kept. Download a backup first if you might need them.</p>
      </Modal>
    </div>
  );
}
