"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, Factory, FileDown, FileSpreadsheet, FlaskConical, Globe2, Layers3, Leaf, Loader2, Package, Plus, Route, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Truck, Upload, X, Zap } from "lucide-react";
import { FACTORS, analyze, compareFreightMix, type AnalysisResult, type ShipmentLeg } from "@temt/calculator";
import { DEFAULT_FILTERS, MODE_COLORS, MODE_LABELS, REQUIRED_CSV_COLUMNS, SECTORS, backendErrorMessage, filteredAnalysis, formatNumber, legKey, makeScenario, matchesFilters, normalizeCSVRows, parseDemoQuery, profileFor, shortNumber, type Company, type DemoLeg, type Filters, type Sector } from "../../lib/demo-data";
import styles from "./demo.module.css";

const DemoCharts = dynamic(() => import("./demo-charts"), { ssr: false, loading: () => <div className={styles.chartSkeleton}><BarChart3 size={18} aria-hidden="true"/>Preparing your analytics</div> });
const SECTOR_ICONS = { automotive: Truck, fmcg: Package, materials: Factory, pharma: FlaskConical };
const PAGE_SIZE = 7;
type Processing = "local" | "pending" | "backend" | "fallback";

export function DemoWorkspace() {
  const [sector, setSector] = useState<Sector>("fmcg");
  const [rawRows, setRawRows] = useState<DemoLeg[]>(() => makeScenario("fmcg"));
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyCursor, setCompanyCursor] = useState(-1);
  const [companiesFailed, setCompaniesFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [synthetic, setSynthetic] = useState(true);
  const [processing, setProcessing] = useState<Processing>("local");
  const [remoteAnalysis, setRemoteAnalysis] = useState<AnalysisResult | null>(null);
  const [slowRequest, setSlowRequest] = useState(false);
  const [notice, setNotice] = useState("");
  const [importError, setImportError] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState("");
  const [page, setPage] = useState(0);
  const [railShare, setRailShare] = useState(30);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localAnalysis = useMemo(() => analyze(rawRows), [rawRows]);
  const analysis = remoteAnalysis || localAnalysis;
  const view = useMemo(() => filteredAnalysis(analysis, filters), [analysis, filters]);
  const companyName = company?.name || SECTORS[sector].company;
  const companyResults = useMemo(() => { const q = companySearch.trim().toLowerCase(); return companies.filter(item => !q || item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q)).slice(0, 7); }, [companies, companySearch]);
  const displayedRows = useMemo(() => rawRows.map((row, originalIndex) => ({ ...row, originalIndex })).filter(row => matchesFilters(row, filters)), [rawRows, filters]);
  const calculatedMap = useMemo(() => new Map(analysis.rows.map(row => [legKey(row), row])), [analysis.rows]);
  const pageCount = Math.max(1, Math.ceil(displayedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const subsidiaries = useMemo(() => [...new Set(rawRows.map(row => row.subsidiary))].sort(), [rawRows]);
  const roadRows = view.rows.filter(row => row.mode === "road");
  const roadTonnes = roadRows.reduce((sum, row) => sum + row.tonnes, 0);
  const roadTonneKm = roadRows.reduce((sum, row) => sum + row.tonneKm, 0);
  const simulation = roadTonnes > 0 ? compareFreightMix(roadTonnes, roadTonneKm / roadTonnes, railShare) : { baselineKg: 0, scenarioKg: 0, savedKg: 0, reductionPercent: 0 };
  const portfolioAfter = view.totals.emissionsKg - simulation.savedKg;
  const intensity = view.totals.tonneKm ? (view.totals.emissionsKg / view.totals.tonneKm) * 1000 : 0;
  const trend = view.byMonth.map(row => ({ label: new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), emissions: Number((row.emissionsKg / 1000).toFixed(3)) }));
  const byMode = ["road", "rail", "ocean", "air"].map(mode => ({ label: MODE_LABELS[mode], emissions: Number(((view.byMode.find(row => row.mode === mode)?.emissionsKg || 0) / 1000).toFixed(3)), color: MODE_COLORS[mode] }));

  const announce = useCallback((message: string) => { setToast(message); if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setToast(""), 4500); }, []);

  const invalidateBackend = useCallback(() => { generationRef.current += 1; requestRef.current?.abort(); requestRef.current = null; setRemoteAnalysis(null); setProcessing("local"); setSlowRequest(false); setNotice(""); }, []);

  const updateUrl = (nextSector: Sector, nextCompany: Company | null) => { const url = new URL(window.location.href); url.searchParams.set("sector", nextSector); if (nextCompany) url.searchParams.set("company", nextCompany.symbol); else url.searchParams.delete("company"); window.history.replaceState({}, "", url); };

  const loadScenario = useCallback((nextSector: Sector, nextCompany: Company | null = null, persistUrl = true) => {
    invalidateBackend(); setSector(nextSector); setRawRows(makeScenario(nextSector)); setCompany(nextCompany); setCompanySearch(""); setCompanyOpen(false); setFilters({ ...DEFAULT_FILTERS }); setSynthetic(true); setPage(0); setImportError([]); setImportNotice(""); setRailShare(30);
    if (persistUrl) updateUrl(nextSector, nextCompany);
  }, [invalidateBackend]);

  useEffect(() => {
    const controller = new AbortController(); const query = parseDemoQuery(window.location.search); const initialSector = query.sector;
    const applyUrlInputs = () => {
      setRailShare(query.rail); setFilters(previous => ({ ...previous, mode: query.mode }));
    };
    if (initialSector !== "fmcg") loadScenario(initialSector, null, false);
    applyUrlInputs();
    fetch("/data/nifty500.json", { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Company directory unavailable"); return response.json(); }).then((data: Company[]) => {
      if (!Array.isArray(data)) throw new Error("Invalid company directory"); setCompanies(data);
      const requestedCompany = query.company; const match = requestedCompany && data.find(item => item.symbol.toLowerCase() === requestedCompany.toLowerCase() || item.name.toLowerCase() === requestedCompany.toLowerCase());
      if (match) { loadScenario(match.sector !== "general" ? match.sector : initialSector, match, false); applyUrlInputs(); }
    }).catch(error => { if (error.name !== "AbortError") setCompaniesFailed(true); });
    return () => { controller.abort(); requestRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [loadScenario]);

  useEffect(() => { const handleOutside = (event: MouseEvent) => { if (companyRef.current && !companyRef.current.contains(event.target as Node)) setCompanyOpen(false); if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false); }; const handleEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setCompanyOpen(false); setExportOpen(false); } }; document.addEventListener("mousedown", handleOutside); document.addEventListener("keydown", handleEscape); return () => { document.removeEventListener("mousedown", handleOutside); document.removeEventListener("keydown", handleEscape); }; }, []);

  const chooseCompany = (nextCompany: Company) => { loadScenario(nextCompany.sector === "general" ? sector : nextCompany.sector, nextCompany); announce(`Illustrative scenario loaded for ${nextCompany.name}. All figures are synthetic.`); };
  const companyKeyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setCompanyOpen(true); setCompanyCursor(cursor => Math.min(cursor + 1, companyResults.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setCompanyCursor(cursor => Math.max(cursor - 1, 0)); }
    if (event.key === "Enter" && companyOpen && companyCursor >= 0 && companyResults[companyCursor]) { event.preventDefault(); chooseCompany(companyResults[companyCursor]); }
    if (event.key === "Escape") setCompanyOpen(false);
  };

  const setFilter = (key: keyof Filters, value: string) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); };
  const updateRow = (index: number, key: keyof DemoLeg, value: string) => {
    invalidateBackend(); setRawRows(previous => previous.map((row, i) => { if (i !== index) return row; const updated = { ...row, [key]: key === "tonnes" || key === "kilometres" ? Number(value) : value }; if (key === "mode" || key === "kilometres") updated.profile = profileFor(updated.mode, updated.kilometres); return updated; })); setImportNotice("");
  };

  const addShipment = () => {
    if (rawRows.length >= 1000) { announce("The demo supports up to 1,000 shipment legs."); return; }
    invalidateBackend(); const shipmentId = `NEW-${Date.now().toString(36).toUpperCase()}`; setRawRows(previous => [...previous, { shipmentId, legIndex: 1, date: filters.from || "2026-04-01", subsidiary: filters.subsidiary === "all" ? subsidiaries[0] || "Operations" : filters.subsidiary, mode: filters.mode === "all" ? "road" : filters.mode as ShipmentLeg["mode"], profile: profileFor(filters.mode === "all" ? "road" : filters.mode, 500), tonnes: 10, kilometres: 500, origin: "Mumbai", destination: "Pune" }]); setPage(Math.floor(displayedRows.length / PAGE_SIZE)); announce("New shipment added. Edit its route, cargo and distance in the ledger.");
  };

  const removeShipment = (shipmentId: string) => { invalidateBackend(); setRawRows(previous => previous.filter(row => row.shipmentId !== shipmentId)); announce("Shipment removed, including all of its legs."); };

  const runAnalysis = async () => {
    requestRef.current?.abort(); const id = ++generationRef.current; const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!base) { setRemoteAnalysis(null); setProcessing("local"); setNotice("Calculations completed locally. No backend URL is configured for this deployment."); announce("Local analysis complete."); return; }
    const controller = new AbortController(); requestRef.current = controller; setProcessing("pending"); setSlowRequest(false); setNotice("");
    const slowTimer = setTimeout(() => { if (id === generationRef.current) setSlowRequest(true); }, 8000);
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`${base}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: rawRows }), signal: controller.signal });
      if (!response.ok) { const detail: unknown = await response.json().catch(() => null); throw new Error(backendErrorMessage(detail, response.status)); }
      const payload: AnalysisResult = await response.json(); if (!payload || !Array.isArray(payload.rows) || !payload.totals || !Array.isArray(payload.byMonth) || !Array.isArray(payload.byMode) || !Array.isArray(payload.errors)) throw new Error("The server returned an unexpected response.");
      if (id !== generationRef.current) return; setRemoteAnalysis(payload); setProcessing("backend"); setSlowRequest(false); announce(`Backend analysis complete. ${payload.totals.legCount} valid legs processed.`);
    } catch (error) { if (id !== generationRef.current) return; setRemoteAnalysis(null); setProcessing("fallback"); setSlowRequest(false); setNotice(controller.signal.aborted ? "The backend did not respond within 90 seconds. Your results are calculated locally with the same engine." : `The backend is unavailable. Your results are calculated locally with the same engine. ${error instanceof Error ? error.message : "Please try again later."}`); }
    finally { clearTimeout(slowTimer); clearTimeout(timeout); if (id === generationRef.current) requestRef.current = null; }
  };

  const continueLocally = () => { invalidateBackend(); setProcessing("fallback"); setNotice("You switched to local processing. The pending backend request was cancelled; the same calculation engine generated these results."); announce("Local results are ready."); };

  const importCSV = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setImportError([]); setImportNotice("");
    if (file.size > 2 * 1024 * 1024) { setImportError(["This file is larger than 2 MB. Split it into smaller CSV files."]); return; }
    if (!/\.csv$/i.test(file.name)) { setImportError(["Choose a .csv file. Download the sample to see the supported columns."]); return; }
    try {
      const Papa = (await import("papaparse")).default;
      const text = await file.text(); const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: header => header.replace(/^\uFEFF/, "").trim() });
      if (parsed.errors.length) { setImportError(parsed.errors.slice(0, 5).map(error => `CSV line ${(error.row ?? 0) + 2}: ${error.message}`)); return; }
      if (!parsed.data.length) { setImportError(["The file has no data rows. Download the sample and keep the column headers."]); return; }
      if (parsed.data.length > 1000) { setImportError([`This file has ${formatNumber(parsed.data.length)} legs. The maximum is 1,000 legs per import.`]); return; }
      const missing = REQUIRED_CSV_COLUMNS.filter(field => !parsed.meta.fields?.includes(field));
      if (missing.length) { setImportError([`Missing required columns: ${missing.join(", ")}. Download the sample for the exact format.`]); return; }
      const missingProfiles = parsed.data.flatMap((row, index) => row.profile?.trim() ? [] : [`CSV line ${index + 2}${row.shipmentId ? ` (${row.shipmentId})` : ""}: profile is required. Choose road-hcv, rail-india, ocean-container, air-short or air-long to match the mode and distance.`]);
      if (missingProfiles.length) { setImportError(["Import paused. Supply an explicit profile for every leg; profiles are never inferred from CSV data.", ...missingProfiles.slice(0, 5)]); return; }
      const imported = normalizeCSVRows(parsed.data);
      const result = analyze(imported);
      if (result.errors.length) { setImportError(["Import paused. Correct these rows and try again; your current data is unchanged.", ...result.errors.slice(0, 5).map(error => `CSV line ${error.rowIndex + 2}${error.shipmentId ? ` (${error.shipmentId})` : ""}: ${error.message}`), ...(result.errors.length > 5 ? [`${result.errors.length - 5} more validation issues were found.`] : [])]); return; }
      invalidateBackend(); setRawRows(imported); setSynthetic(false); setCompany(null); setFilters({ mode: "all", subsidiary: "all", from: "", to: "" }); setPage(0); setImportNotice(`${formatNumber(imported.length)} validated legs imported from ${file.name}. Data stays in your browser until you run backend analysis.`); announce("CSV imported. Local analytics are ready.");
    } catch (error) { setImportError([`The CSV could not be read. ${error instanceof Error ? error.message : "Please check its format and try again."}`]); }
  };

  const doExport = async (type: "csv" | "pdf" | "powerbi") => {
    setExportOpen(false); setExporting(true);
    try { const { exportCSV, exportPDF, exportPowerBI } = await import("../../lib/demo-export"); const context = { analysis: view, rawRows, name: synthetic ? `Illustrative ${companyName} scenario` : "Imported freight data", filters, synthetic, processing: processing === "backend" ? "backend" : "local" }; await ({ csv: exportCSV, pdf: exportPDF, powerbi: exportPowerBI }[type])(context); announce(`${type === "powerbi" ? "Power BI data pack" : type.toUpperCase()} downloaded with the current filters.`); } catch { announce("Export could not be generated. Please try again."); } finally { setExporting(false); }
  };

  const sampleDownload = async () => { try { const { downloadSample } = await import("../../lib/demo-export"); await downloadSample(makeScenario(sector)); announce("Sample CSV downloaded."); } catch { announce("Sample download failed. Please try again."); } };
  const showSources = () => { setSourcesOpen(true); requestAnimationFrame(() => document.getElementById("demo-methodology")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })); };
  const processingLabel = processing === "pending" ? "CONTACTING BACKEND" : processing === "backend" ? "BACKEND COMPLETE" : processing === "fallback" ? "LOCAL FALLBACK" : "LOCAL PREVIEW";

  return <div className={styles.workspace}>
    <a className={styles.srOnly} href="#main">Skip to dashboard</a>
    <aside className={styles.sidebar} aria-label="Demo navigation">
      <a className={styles.brand} href="/" aria-label="TEMT home"><span className={styles.brandMark} aria-hidden="true"><i/><i/><i/></span>TEMT<span style={{ color: "#ee6b3e" }}>.</span></a>
      <div className={styles.brandSub}>FREIGHT INTELLIGENCE</div><div className={styles.sidebarLabel}>WORKSPACE</div>
      <nav className={styles.sideNav}><a href="#main" className={styles.activeNav} aria-current="page" title="Overview"><BarChart3 size={17}/><span>Overview</span></a><a href="#shipment-ledger" title="Shipment ledger"><Layers3 size={17}/><span>Shipment ledger</span></a><a href="#mode-simulator" title="Mode simulator"><SlidersHorizontal size={17}/><span>Mode simulator</span></a><a href="#demo-methodology" onClick={showSources} title="Methodology"><ShieldCheck size={17}/><span>Methodology</span></a></nav>
      <div className={styles.sideFooter}><div className={styles.sidebarVersion}><i className={styles.liveDot}/><span>DEMONSTRATION / 01</span></div><p>India-specific thinking.<br/>Transparent calculations.</p><a href="https://iimb.freightemissions.com/" target="_blank" rel="noreferrer">Visit official TEMT <ArrowUpRight size={12}/></a></div>
    </aside>
    <main className={styles.main} id="main">
      <header className={styles.topbar}><div className={styles.breadcrumb}><span>Platform</span><ChevronRight size={12}/><strong>Enterprise demo</strong></div><div className={styles.topbarRight}><span className={styles.syntheticBadge}><FlaskConical size={11}/>{synthetic ? "SYNTHETIC SCENARIO" : "USER-SUPPLIED DATA"}</span><a href="/" className={styles.backLink}><ArrowLeft size={12}/>Back to TEMT</a></div></header>
      <div className={styles.content}>
        <div className={styles.pageHeading}><div><span className={styles.eyebrow}>YOUR SUPPLY CHAIN. EVERY CARBON DECISION.</span><h1>Freight, in full view.</h1><p>{synthetic ? <>An illustrative {company ? company.name : SECTORS[sector].label.toLowerCase()} scenario. Change the inputs. See what moves.</> : "Your imported freight data. Inspect the inputs and trace every calculation."}</p></div><div className={styles.actions}><div className={styles.exportWrap} ref={exportRef}><button className={styles.button} aria-expanded={exportOpen} aria-controls="demo-export-menu" onClick={() => setExportOpen(open => !open)} disabled={exporting}>{exporting ? <Loader2 className={styles.spinner} size={14}/> : <Download size={14}/>}Export<ChevronDown size={12}/></button>{exportOpen && <div className={styles.exportMenu} id="demo-export-menu"><button onClick={() => doExport("csv")}><FileSpreadsheet size={15}/>Shipment CSV</button><button onClick={() => doExport("pdf")}><FileDown size={15}/>Executive PDF report</button><button onClick={() => doExport("powerbi")}><BarChart3 size={15}/>Power BI data pack</button><p>Exports use the current filters. Synthetic scenarios stay labeled.</p></div>}</div><button className={`${styles.button} ${styles.primaryButton}`} onClick={runAnalysis} disabled={processing === "pending"}>{processing === "pending" ? <Loader2 className={styles.spinner} size={14}/> : <Zap size={14}/>} {processing === "pending" ? "Processing" : "Run analysis"}</button></div></div>

        <div className={styles.scenarioBar}><div className={styles.companyBox} ref={companyRef}><label htmlFor="company-search" className={styles.fieldLabel}>EXPLORE A NIFTY 500 COMPANY SCENARIO</label><div className={styles.companyInputWrap}><Search size={15}/><input id="company-search" className={styles.companyInput} role="combobox" aria-expanded={companyOpen} aria-controls="company-results" aria-autocomplete="list" aria-activedescendant={companyOpen && companyCursor >= 0 ? `company-option-${companyCursor}` : undefined} value={companySearch} placeholder={company?.name || "Search a company or NSE symbol"} onFocus={() => setCompanyOpen(true)} onChange={event => { setCompanySearch(event.target.value); setCompanyOpen(true); setCompanyCursor(-1); }} onKeyDown={companyKeyboard}/>{company && <button className={styles.iconButton} onClick={() => loadScenario(sector)} aria-label="Clear selected company"><X size={13}/></button>}</div>{companyOpen && <div className={styles.companyResults} id="company-results" role="listbox" aria-label="NIFTY 500 companies">{companyResults.map((item, index) => <button key={item.symbol} id={`company-option-${index}`} role="option" aria-selected={companyCursor === index} onClick={() => chooseCompany(item)}>{item.name}<small>{item.symbol} · {item.industry}</small></button>)}{!companyResults.length && <p>{companiesFailed ? "The company directory is unavailable. Sector scenarios still work." : companies.length ? "No company matches that name or symbol." : "Loading the NSE company directory…"}</p>}</div>}</div><div><span className={styles.fieldLabel}>OR START WITH AN INDUSTRY</span><div className={styles.sectorOptions}>{(Object.keys(SECTORS) as Sector[]).map(key => { const Icon = SECTOR_ICONS[key]; return <button key={key} className={styles.sectorOption} aria-pressed={sector === key} onClick={() => { loadScenario(key); announce(`${SECTORS[key].label} synthetic scenario loaded.`); }}><Icon size={15}/>{SECTORS[key].label}</button>; })}</div></div></div>

        <div className={styles.filters}><SlidersHorizontal size={13} color="#849475" aria-hidden="true"/><label className={styles.filterControl}>Unit<select value={filters.subsidiary} onChange={event => setFilter("subsidiary", event.target.value)}><option value="all">All business units</option>{subsidiaries.map(name => <option key={name}>{name}</option>)}</select></label><label className={styles.filterControl}>Mode<select value={filters.mode} onChange={event => setFilter("mode", event.target.value)}><option value="all">All modes</option>{Object.entries(MODE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><span className={styles.filterDivider}/><label className={styles.filterControl}><span className={styles.srOnly}>From date</span><input aria-label="From date" type="date" value={filters.from} max={filters.to || undefined} onChange={event => setFilter("from", event.target.value)}/></label><span className={styles.filterControl}>to</span><label className={styles.filterControl}><span className={styles.srOnly}>To date</span><input aria-label="To date" type="date" value={filters.to} min={filters.from || undefined} onChange={event => setFilter("to", event.target.value)}/></label><button className={styles.textButton} onClick={() => { setFilters({ mode: "all", subsidiary: "all", from: "", to: "" }); setPage(0); }}>Reset</button><span className={styles.filterResult}>{formatNumber(view.totals.legCount)} VALID LEGS</span></div>

        {notice && <div className={styles.notice} role="status"><CircleHelp size={15}/><p>{notice}</p><button className={styles.iconButton} aria-label="Dismiss processing notice" onClick={() => setNotice("")}><X size={13}/></button></div>}
        {slowRequest && <div className={styles.notice} role="status"><Loader2 size={15} className={styles.spinner}/><p>The backend is taking longer than expected. Your local preview is ready.<button className={styles.textButton} onClick={continueLocally}>Continue locally</button></p></div>}
        <div className={styles.pipeline} aria-label="Calculation pipeline"><div className={styles.pipelineSteps}><span className={`${styles.pipelineStep} ${styles.current}`}><CheckCircle2 size={13}/>Data received</span><ChevronRight size={12} className={styles.pipelineArrow}/><span className={styles.pipelineStep}><CheckCircle2 size={13}/>Validated</span><ChevronRight size={12} className={styles.pipelineArrow}/><span className={styles.pipelineStep}><CheckCircle2 size={13}/>Calculated</span><ChevronRight size={12} className={styles.pipelineArrow}/><span className={styles.pipelineStep}><CheckCircle2 size={13}/>Report ready</span></div><span className={styles.processingBadge} role="status">{processing === "pending" ? <Loader2 size={11} className={styles.spinner}/> : processing === "backend" ? <Globe2 size={11}/> : <Activity size={11}/>}{processingLabel}</span></div>

        <section className={styles.metrics} aria-label="Filtered freight metrics"><Metric label="Total freight emissions" value={formatNumber(view.totals.emissionsKg / 1000, 2)} unit="tCO₂e" foot="Calculated from the selected legs" icon={<Leaf size={16}/>} primary/><Metric label="Shipments in view" value={formatNumber(view.totals.shipmentCount)} foot={`${formatNumber(view.totals.legCount)} legs across ${view.bySubsidiary.length} business units`} icon={<Package size={16}/>}/><Metric label="Freight activity" value={shortNumber(view.totals.tonneKm)} unit="tkm" foot="Cargo mass × distance travelled" icon={<Route size={16}/>}/><Metric label="Emission intensity" value={formatNumber(intensity, 1)} unit="g / tkm" foot="CO₂e per tonne-kilometre" icon={<Activity size={16}/>}/></section>

        <div className={styles.analysisLayout}><div className={styles.analyticsMain}>
          <DemoCharts trend={trend} byMode={byMode}/>
          <section className={styles.ledger} id="shipment-ledger" aria-labelledby="ledger-heading"><div className={styles.ledgerTop}><div><span className={styles.eyebrow}>TRACE EVERY NUMBER</span><h2 id="ledger-heading">Your shipment ledger</h2></div><div className={styles.ledgerActions}><button className={styles.button} onClick={sampleDownload}><Download size={12}/>Sample CSV</button><button className={styles.button} onClick={() => uploadRef.current?.click()}><Upload size={12}/>Import CSV</button><button className={styles.button} onClick={addShipment}><Plus size={12}/>Add</button><input className={styles.fileInput} ref={uploadRef} type="file" accept=".csv,text/csv" onChange={importCSV} aria-label="Import shipment CSV, maximum 2 MB and 1000 legs"/></div></div>
            {importError.length > 0 && <div className={styles.importError} role="alert"><strong>Check your CSV</strong><ul>{importError.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}{importNotice && <div className={styles.importNotice} role="status">{importNotice}</div>}
            {analysis.errors.length > 0 && <div className={styles.importError} role="alert"><strong>{analysis.errors.length} validation {analysis.errors.length === 1 ? "issue" : "issues"}.</strong> Shipments with invalid legs are excluded from totals and exports.<ul>{analysis.errors.slice(0, 3).map((error, index) => <li key={index}>{error.shipmentId || `Row ${error.rowIndex + 1}`}: {error.message}</li>)}</ul></div>}
            {displayedRows.length ? <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Editable shipment legs. Changing a mode or distance selects the corresponding published factor profile. Deleting a row deletes the entire shipment.</caption><thead><tr><th>SHIPMENT</th><th>DATE</th><th>BUSINESS UNIT</th><th>ORIGIN</th><th>DESTINATION</th><th>MODE</th><th>TONNES</th><th>KM</th><th>kgCO₂e</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{displayedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => { const calculated = calculatedMap.get(legKey(row)); const name = `${row.shipmentId} leg ${row.legIndex}`; return <tr key={legKey(row)}><td><span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9 }}>{row.shipmentId}</span><span style={{ display: "block", fontSize: 8, color: "#96a388" }}>LEG {String(row.legIndex).padStart(2, "0")}</span></td><td><input aria-label={`${name} date`} type="date" value={row.date} onChange={event => updateRow(row.originalIndex, "date", event.target.value)}/></td><td><input className={styles.subsidiaryInput} aria-label={`${name} business unit`} value={row.subsidiary} onChange={event => updateRow(row.originalIndex, "subsidiary", event.target.value)}/></td><td><input className={styles.cityInput} aria-label={`${name} origin`} value={row.origin} onChange={event => updateRow(row.originalIndex, "origin", event.target.value)}/></td><td><input className={styles.cityInput} aria-label={`${name} destination`} value={row.destination} onChange={event => updateRow(row.originalIndex, "destination", event.target.value)}/></td><td><select aria-label={`${name} mode`} value={row.mode} onChange={event => updateRow(row.originalIndex, "mode", event.target.value)}>{Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><input aria-label={`${name} tonnes`} type="number" min="0.01" step="0.1" value={row.tonnes} onChange={event => updateRow(row.originalIndex, "tonnes", event.target.value)}/></td><td><input aria-label={`${name} kilometres`} type="number" min="0.01" step="1" value={row.kilometres} onChange={event => updateRow(row.originalIndex, "kilometres", event.target.value)}/></td><td className={styles.emissionCell}>{calculated ? formatNumber(calculated.emissionsKg, 1) : <span className={styles.errorText}>Excluded</span>}</td><td><button className={styles.iconButton} aria-label={`Delete shipment ${row.shipmentId} and all its legs`} onClick={() => removeShipment(row.shipmentId)}><Trash2 size={12}/></button></td></tr>; })}</tbody></table></div> : <div className={styles.emptyState}><strong>No shipment legs in this view.</strong>Adjust the filters or import a CSV to start exploring.<br/><button className={styles.button} onClick={() => setFilters({ mode: "all", subsidiary: "all", from: "", to: "" })}>Clear filters</button></div>}
            <div className={styles.ledgerBottom}><span>{displayedRows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, displayedRows.length)} of ${displayedRows.length} legs` : "0 legs"} · Edit cells to recalculate</span><div className={styles.pagination}><button aria-label="Previous shipment page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={12}/></button><span>{currentPage + 1} / {pageCount}</span><button aria-label="Next shipment page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={12}/></button></div></div>
          </section>
        </div>
        <section className={styles.simulation} id="mode-simulator" aria-labelledby="simulation-heading"><div className={styles.simulationIntro}><div className={styles.simulationHeading}><span className={styles.eyebrow}>THE WHAT-IF LAB</span><Sparkles size={16}/></div><h2 id="simulation-heading">Same freight.<br/>A different footprint.</h2><p>Move a share of your road freight to rail. See the effect on the selected portfolio.</p><span className={styles.simulationBadge}><FlaskConical size={11}/>ILLUSTRATIVE MODE SHIFT</span></div><div className={styles.simulationControls}><label htmlFor="rail-share" className={styles.sliderLabel}>Road activity shifted to rail <strong>{railShare}%</strong></label><input id="rail-share" className={styles.slider} type="range" min="0" max="100" step="5" value={railShare} onChange={event => setRailShare(Number(event.target.value))} aria-valuetext={`${railShare} percent of road tonne-kilometres shifted to rail`} disabled={!roadTonnes}/><div className={styles.sliderEnds}><span>0% SHIFT</span><span>100% SHIFT</span></div><div className={styles.simulationResult} aria-live="polite" aria-atomic="true"><span>POTENTIAL EMISSIONS AVOIDED</span><div className={styles.savingNumber}>{formatNumber(simulation.savedKg / 1000, 2)}<small>tCO₂e</small></div><span className={styles.savingNote}><ArrowDownRight size={13}/>{formatNumber(view.totals.emissionsKg ? simulation.savedKg / view.totals.emissionsKg * 100 : 0, 1)}% of total selected emissions</span></div><div className={styles.simulationCompare}><span>Current portfolio</span><strong>{formatNumber(view.totals.emissionsKg / 1000, 2)} t</strong></div><div className={styles.simulationCompare}><span>With mode shift</span><strong>{formatNumber(portfolioAfter / 1000, 2)} t</strong></div><div className={styles.simulationCompare}><span>Road activity in scope</span><strong>{shortNumber(roadTonneKm)} tkm</strong></div>{!roadTonnes && <p>No valid road activity matches your filters. Select all modes or road to explore a shift.</p>}<button className={styles.button} onClick={showSources}><CircleHelp size={13}/>See the calculation<ArrowRight size={13}/></button></div><p className={styles.simulationDisclaimer}>Same tonne-kilometres, different emission factors. This does not assess rail access, capacity, route changes or cost. Actual decisions need an operational review.</p></section></div>

        <section className={styles.sourcePanel} id="demo-methodology"><button className={styles.sourceToggle} aria-expanded={sourcesOpen} aria-controls="methodology-details" onClick={() => setSourcesOpen(open => !open)}><span><ShieldCheck size={14}/>Transparent by design. Factors, assumptions and sources.</span><ChevronDown size={14} style={{ transform: sourcesOpen ? "rotate(180deg)" : undefined }}/></button>{sourcesOpen && <div className={styles.sourceBody} id="methodology-details"><p><strong>The calculation:</strong> cargo tonnes × leg kilometres × profile factor = kgCO₂e. Total emissions are summed without intermediate rounding. A tonne-kilometre is one tonne of freight moved one kilometre.</p><div className={styles.factorGrid}>{Object.values(FACTORS).map(factor => <div className={styles.factorCard} key={factor.id}><span>{factor.label}</span><strong>{factor.kgCO2ePerTonneKm}</strong><small>kgCO₂e / tonne-km</small><a href={factor.sourceUrl} target="_blank" rel="noreferrer">Source{factor.sourcePage ? ` · p.${factor.sourcePage}` : ""} <ArrowUpRight size={9}/></a></div>)}</div><p><strong>Profile assumptions:</strong> {Object.values(FACTORS).map(factor => `${factor.label}: ${factor.assumptions.join(" ")}`).join(" ")}</p><p>Distances and route labels are illustrative or user supplied. The demo does not retrieve E-Way bills, calculate live routes or connect to a company's systems. Changing the mode selects its factor profile; air uses the distance-appropriate short or long profile.</p><p>Filters are applied to validated legs. Shipments with invalid, duplicate or missing legs are excluded in full before filtering. CSV imports allow up to 2 MB and 1,000 legs. Imported data stays in this browser unless you choose <strong>Run analysis</strong>, which sends the shipment rows to this demo's backend.</p><p><strong>Evidence:</strong> <a href="https://www.iimb.ac.in/node/14281" target="_blank" rel="noreferrer">IIMB's DPIIT adoption announcement</a> · <a href="https://dpiit.freightemissions.com/certification.pdf" target="_blank" rel="noreferrer">SGS validation opinion for TEMT v1.3</a> · <a href="https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv" target="_blank" rel="noreferrer">NSE company directory</a></p><div className={styles.integrityNote}>This authorized product preview uses a separate demonstration engine. {synthetic ? "The scenario data is synthetic and does not describe the selected company's operations or performance." : "Imported data is user supplied and has not been independently assured."} Certification and adoption references describe the official TEMT platform. Power BI export is an import-ready file pack, not a live integration.</div><p className={styles.statusText}>Engine {analysis.engineVersion} · Factor versions: {[...new Set(Object.values(FACTORS).map(factor => factor.version))].join(", ")}<br/>Calculated at {analysis.calculatedAt} · {processing === "backend" ? `Backend processing: ${analysis.processingMs.toFixed(2)} ms` : "Local processing in your browser"}. Processing time is a single observation, not a service guarantee.</p></div>}</section>
        <footer className={styles.footer}><div>Authorized TEMT product preview. {synthetic ? "Synthetic data, real calculations." : "User-supplied data, transparent calculations."}<br/>Looking for the operational platform? <a href="https://iimb.freightemissions.com/" target="_blank" rel="noreferrer">Visit official TEMT <ArrowUpRight size={9}/></a></div><span>INDIA FOCUSED / FACTOR BASED / TRACEABLE</span></footer>
      </div>
    </main>
    <div className={styles.srOnly} role="status" aria-live="polite">{view.totals.legCount} valid legs. Total emissions {formatNumber(view.totals.emissionsKg / 1000, 2)} tonnes CO₂ equivalent.</div>
    {toast && <div className={styles.toast} role="status"><Check size={16}/>{toast}</div>}
  </div>;
}

function Metric({ label, value, unit, foot, icon, primary = false }: { label: string; value: string; unit?: string; foot: string; icon: React.ReactNode; primary?: boolean }) { return <div className={`${styles.metric} ${primary ? styles.metricPrimary : ""}`}><div className={styles.metricTop}><span className={styles.metricLabel}>{label}</span>{icon}</div><div className={styles.metricValue}>{value}{unit && <small>{unit}</small>}</div><div className={styles.metricFoot}>{foot}</div></div>; }

export default DemoWorkspace;
