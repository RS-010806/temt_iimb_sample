"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Compass, Database, Factory, FlaskConical, Mountain, Package, Search, ShieldCheck, Truck } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { makeSampleWorkspace, SAMPLE_SECTORS, type SampleSector } from "@/lib/sample-data";
import { Modal, cx, useToast } from "../ui";
import { startTour } from "../copilot/tour";

export interface Company { name: string; symbol: string; industry: string; sector: string }

let companiesPromise: Promise<Company[]> | undefined;
export const loadCompanies = () => (companiesPromise ??= fetch("/data/nifty500.json").then((response) => (response.ok ? response.json() : [])).catch(() => []));

export function CompanyPicker({ onPick, initial = "" }: { onPick: (company: Company) => void; initial?: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState(initial);
  useEffect(() => { loadCompanies().then(setCompanies); }, []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return companies.filter((company) => company.name.toLowerCase().includes(q) || company.symbol.toLowerCase().startsWith(q)).slice(0, 6);
  }, [companies, query]);
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-3 text-grey-400" aria-hidden="true" />
      <input className="input pl-9" placeholder="Search the NIFTY 500 by name or NSE symbol" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search NIFTY 500 companies" />
      {results.length > 0 && (
        <ul className="mt-2 grid gap-1 rounded-xl border border-stone-200 bg-white p-1" role="listbox">
          {results.map((company) => (
            <li key={company.symbol}>
              <button type="button" className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-maroon-50" onClick={() => { onPick(company); setQuery(company.name); }}>
                <span className="font-semibold">{company.name}</span><span className="text-xs text-grey-500">{company.symbol} · {company.industry}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SECTOR_ICONS: Record<SampleSector, typeof Package> = { fmcg: Package, automotive: Truck, pharma: FlaskConical, materials: Mountain };

export function loadSample(sector: SampleSector) {
  const records = makeSampleWorkspace(sector);
  actions.replaceAll(records, `Sample workspace: ${SAMPLE_SECTORS[sector].label}`);
  actions.updateSettings({ onboarded: true, organisation: { name: SAMPLE_SECTORS[sector].company }, businessUnits: SAMPLE_SECTORS[sector].units });
  return records.length;
}

export function Onboarding() {
  const hydrated = useStore((state) => state.hydrated);
  const onboarded = useStore((state) => state.settings.onboarded);
  const count = useStore((state) => state.shipments.length);
  const [step, setStep] = useState<"choose" | "company">("choose");
  const [company, setCompany] = useState<Company | null>(null);
  const [units, setUnits] = useState("Operations");
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const open = hydrated && !onboarded && count === 0 && !dismissed;

  const close = () => { setDismissed(true); actions.updateSettings({ onboarded: true }); };
  const sample = (sector: SampleSector) => {
    const loaded = loadSample(sector);
    setDismissed(true);
    toast({ tone: "ok", message: `Loaded ${loaded} sample shipments across two financial years.` });
    router.push("/app/");
  };

  return (
    <Modal open={open} onClose={close} width={760} title={step === "choose" ? "Welcome to TEMT" : "Set up your organisation"}>
      {step === "choose" ? (
        <div className="grid gap-5">
          <p className="text-[15px] leading-relaxed text-grey-700">Measure, report and reduce freight emissions across road, rail, air, sea and inland waterways, using India-specific factors from the TCI–IIMB Supply Chain Sustainability Lab. How would you like to begin?</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-stone-200 p-4">
              <Database size={20} className="text-maroon-600" aria-hidden="true" />
              <h3 className="mt-2 font-bold">Explore sample data</h3>
              <p className="mt-1 text-xs text-grey-600">Two financial years of realistic freight for one of four sectors.</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(Object.keys(SAMPLE_SECTORS) as SampleSector[]).map((sector) => {
                  const Icon = SECTOR_ICONS[sector];
                  return <button key={sector} type="button" className="btn btn-secondary btn-sm min-w-0 justify-start gap-1.5 px-2.5" onClick={() => sample(sector)}><Icon size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{SAMPLE_SECTORS[sector].label.split(" ")[0]}</span></button>;
                })}
              </div>
            </div>
            <button type="button" className="rounded-xl border border-stone-200 p-4 text-left transition hover:border-maroon-300 hover:bg-maroon-50/40" onClick={() => setStep("company")}>
              <Building2 size={20} className="text-maroon-600" aria-hidden="true" />
              <h3 className="mt-2 font-bold">Start with my company</h3>
              <p className="mt-1 text-xs text-grey-600">Pick your company from the NIFTY 500, add business units, then enter or import shipments.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon-700">Set up <ArrowRight size={14} aria-hidden="true" /></span>
            </button>
            <button type="button" className="rounded-xl border border-maroon-200 bg-maroon-50/60 p-4 text-left transition hover:border-maroon-400" onClick={() => { if (!count) loadSample("fmcg"); setDismissed(true); router.push("/app/"); setTimeout(() => startTour(), 450); }}>
              <Compass size={20} className="text-maroon-600" aria-hidden="true" />
              <h3 className="mt-2 font-bold">Take the guided tour</h3>
              <p className="mt-1 text-xs text-grey-600">Fourteen short steps on sample data. The Copilot can restart it any time.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon-700">Start tour <ArrowRight size={14} aria-hidden="true" /></span>
            </button>
          </div>
          <p className="flex items-start gap-2 text-xs text-grey-600"><ShieldCheck size={15} className="mt-px shrink-0 text-maroon-600" aria-hidden="true" /> Your workspace is stored privately in this browser. Nothing is uploaded unless you run the optional server check in Settings.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="field"><span className="label">Company</span><CompanyPicker onPick={setCompany} /></div>
          {company && <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm"><Factory size={14} className="mr-1.5 inline text-maroon-600" aria-hidden="true" />{company.name} · {company.industry}</p>}
          <label className="field"><span className="label">Business units</span><input className="input" value={units} onChange={(event) => setUnits(event.target.value)} /><span className="hint">Separate with commas, for example “Foods, Home Care, Exports”. Used for filtering and reports.</span></label>
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep("choose")}>Back</button>
            <div className="flex gap-2">
              <button type="button" className={cx("btn btn-secondary")} onClick={() => { finish("/app/import/"); }}>Import shipments</button>
              <button type="button" className="btn btn-primary" onClick={() => finish("/app/calculate/")}>Calculate a shipment <ArrowRight size={15} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );

  function finish(path: string) {
    const businessUnits = units.split(",").map((unit) => unit.trim()).filter(Boolean);
    actions.updateSettings({ onboarded: true, organisation: { name: company?.name ?? "My organisation", symbol: company?.symbol, industry: company?.industry }, businessUnits: businessUnits.length ? businessUnits : ["Operations"] }, "Organisation set up");
    setDismissed(true);
    router.push(path);
  }
}
