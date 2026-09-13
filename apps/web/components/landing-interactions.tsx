'use client';
import Link from 'next/link';
import { useState, useMemo, useId, type KeyboardEvent } from 'react';
import styles from './landing-interactions.module.css';
import { ArrowUpRight, ArrowDownRight, Truck, TrainFront, Plane, Ship, Factory, Package, Pill, CarFront, Check, Play, RotateCcw, Database, FileSpreadsheet, GitBranch, FileCheck2 } from 'lucide-react';
import { FACTORS } from '@temt/calculator/preview';
import type { AnalysisResult, Mode, ShipmentLeg } from '@temt/calculator';
import { makeScenario, type Sector, type DemoLeg } from '@/lib/demo-data';

const number = (n:number, digits=0)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(n);

const modes = [
  { id: 'road', label: 'Road', Icon: Truck, code: '01', factor: 'road-hcv', title: 'See the footprint of your everyday freight.', text: 'Put your road network on a common basis. Connect long hauls and local distribution, then trace the emissions back to each shipment.', geography: 'India', profile: 'Diesel HCV · 30–50 t GVW', color: '#ef6b3c' },
  { id: 'rail', label: 'Rail', Icon: TrainFront, code: '02', factor: 'rail-india', title: 'Quantify a different way to move.', text: 'Compare India’s average rail intensity with your road baseline. Bring a measured scenario to the conversation about terminals, capacity and service.', geography: 'India', profile: 'National average · mixed traction', color: '#92aa73' },
  { id: 'air', label: 'Air', Icon: Plane, code: '03', factor: 'air-short', title: 'Make the carbon cost of urgency visible.', text: 'See the emissions associated with time-sensitive freight. The full workspace keeps short and long haul profiles explicit for every air leg.', geography: 'Global', profile: 'Mixed aircraft · up to 1,500 km', color: '#b9a487' },
  { id: 'ocean', label: 'Ocean', Icon: Ship, code: '04', factor: 'ocean-container', title: 'Carry the ocean leg into the same view.', text: 'Measure container movements alongside your inland network. Keep the loading assumption attached as the estimate moves from port to report.', geography: 'Middle East / India', profile: 'Dry container · assumed 10 t/TEU', color: '#87a8a3' },
] as const;

/** Horizontal tabs have one tab stop; arrows, Home and End also move focus. */
function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: number, length: number, select: (index: number) => void) {
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : event.key === 'ArrowRight' ? (current + 1) % length : event.key === 'ArrowLeft' ? (current + length - 1) % length : null;
  if (next === null) return;
  event.preventDefault();
  select(next);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}

function summarizeScenario(sector: Sector) {
  const rows = makeScenario(sector);
  const byMode = modes.map(mode => ({ mode: mode.id, label: mode.label, color: mode.color, emissionsKg: 0, legCount: 0 }));
  const months = new Map<string, number>();
  let emissionsKg = 0;
  for (const row of rows) {
    const value = row.tonnes * row.kilometres * FACTORS[row.profile].kgCO2ePerTonneKm;
    emissionsKg += value;
    const mode = byMode.find(item => item.mode === row.mode)!;
    mode.emissionsKg += value;
    mode.legCount += 1;
    const month = row.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + value);
  }
  return { rows, byMode, emissionsKg, shipments: new Set(rows.map(row => row.shipmentId)).size, byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, emissionsKg: value })) };
}

export function ModeExplorer() {
  const id = useId();
  const [selected, setSelected] = useState<Mode>('road');
  const [distance, setDistance] = useState(1000);
  const active = modes.find(mode => mode.id === selected)!;
  const factor = FACTORS[active.factor];
  const emissions = 20 * distance * factor.kgCO2ePerTonneKm;
  const baseline = 20 * distance * FACTORS['road-hcv'].kgCO2ePerTonneKm;
  const maximum = 20 * distance * FACTORS['air-short'].kgCO2ePerTonneKm;
  const ratio = emissions / baseline;
  return <div className={styles.modeExplorer}>
    <div className={styles.modeTabs} role="tablist" aria-label="Freight modes">
      {modes.map((mode, index) => <button key={mode.id} id={`${id}-${mode.id}`} type="button" role="tab" aria-selected={selected === mode.id} aria-controls={`${id}-panel`} tabIndex={selected === mode.id ? 0 : -1} onClick={() => setSelected(mode.id)} onKeyDown={event => navigateTabs(event, index, modes.length, next => setSelected(modes[next].id))}>
        <span className={styles.tabNumber}>{mode.code}</span><mode.Icon size={23} strokeWidth={1.5} /><strong>{mode.label}</strong><ArrowUpRight size={17} />
      </button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${active.id}`} tabIndex={0} className={styles.modePanel}>
      <div className={styles.modeStory}>
        <span className={styles.overline}>{active.geography.toUpperCase()} · PUBLISHED DEFAULT FACTOR</span>
        <h3>{active.title}</h3><p>{active.text}</p>
        <div className={styles.factorIdentity}><active.Icon size={22} strokeWidth={1.4} /><div><strong>{active.profile}</strong><span>{number(factor.kgCO2ePerTonneKm, active.id === 'ocean' ? 5 : 4)} kgCO₂e / tonne-km</span></div></div>
        <Link prefetch={false} href={`/demo/?mode=${active.id}`} className={styles.inlineLink}>Explore {active.label.toLowerCase()} emissions <ArrowUpRight size={16} /></Link>
      </div>
      <div className={styles.modeComparison}>
        <div className={styles.comparisonHeader}><div><span className={styles.overline}>THE SAME LOAD. THE SAME DISTANCE.</span><h4>Four ways to see the difference.</h4></div><span className={styles.loadChip}>20 tonnes</span></div>
        <div className={styles.distanceControl}><label htmlFor={`${id}-distance`}>Illustrative distance</label><select id={`${id}-distance`} value={distance} onChange={event => setDistance(Number(event.target.value))}><option value={500}>500 km</option><option value={1000}>1,000 km</option><option value={1500}>1,500 km</option></select></div>
        <div className={styles.modeBars} aria-label={`Emissions for 20 tonnes travelling ${number(distance)} kilometres`}>
          {modes.map(mode => {
            const value = 20 * distance * FACTORS[mode.factor].kgCO2ePerTonneKm;
            return <div key={mode.id} className={`${styles.modeBarRow} ${selected === mode.id ? styles.selectedBar : ''}`}><span><mode.Icon size={14} />{mode.label}</span><div className={styles.modeTrack}><i style={{ width: `${value / maximum * 100}%`, background: mode.color }} /></div><strong>{number(value, 0)}<small> kg</small></strong></div>;
          })}
        </div>
        <div className={styles.modeOutcome} aria-live="polite" aria-atomic="true"><div><span>{active.label.toUpperCase()} · WTW EMISSIONS</span><strong>{number(emissions / 1000, 2)} <small>tCO₂e</small></strong></div><p>{selected === 'road' ? <>Your road baseline.<br /><b>Compare the alternatives above.</b></> : ratio < 1 ? <><b>{number((1 - ratio) * 100, 1)}% lower</b><br />than the road illustration.</> : <><b>{number(ratio, 1)}× the emissions</b><br />of the road illustration.</>}</p></div>
        <p className={styles.comparisonNote}>Linear scale. Different regional and operating defaults; these are intensity illustrations, not interchangeable routes. WTW means well-to-wheel. <Link prefetch={false} href="/methodology/">Factors & assumptions <ArrowUpRight size={10} /></Link></p>
      </div>
    </div>
  </div>;
}

const sectors = [
  { id: 'automotive', Icon: CarFront, label: 'Automotive', headline: 'Every component has a journey.', copy: 'Connect suppliers, assembly plants and distribution. Follow a shipment through its transport legs, then see the effect across the group.', route: 'SUPPLIERS → ASSEMBLY → DISTRIBUTION', featured: 0, question: 'Where does inbound freight concentrate your footprint?' },
  { id: 'fmcg', Icon: Package, label: 'FMCG', headline: 'Many deliveries. One clear view.', copy: 'Bring foods, home care and distribution into the same monthly view. Compare recurring freight activity without losing the shipment detail.', route: 'FACTORY → DISTRIBUTION → REGIONAL HUB', featured: 3, question: 'Which mode contributes most across your distribution network?' },
  { id: 'materials', Icon: Factory, label: 'Industrial materials', headline: 'Big volumes. Meaningful choices.', copy: 'See how bulk volumes and long hauls shape emissions across cement, metals and industrial materials. Test a modal shift before evaluating feasibility.', route: 'SOURCE → PROCESSING → CUSTOMER', featured: 3, question: 'How does the footprint change when bulk freight moves by rail?' },
  { id: 'pharma', Icon: Pill, label: 'Pharmaceuticals', headline: 'When priority meets accountability.', copy: 'Connect formulations, active ingredients and healthcare distribution. Bring urgent air movements and surface deliveries into a shared carbon view.', route: 'PRODUCTION → AIR CARGO → DISTRIBUTION', featured: 2, question: 'How much of your footprint comes from time-sensitive air cargo?' },
] as const;

function legEmissions(row: DemoLeg) { return row.tonnes * row.kilometres * FACTORS[row.profile].kgCO2ePerTonneKm; }

export function SectorExplorer() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const sector = sectors[selected];
  const sample = useMemo(() => summarizeScenario(sector.id), [sector.id]);
  const shipmentIds = [...new Set(sample.rows.map(row => row.shipmentId))];
  const shipment = sample.rows.filter(row => row.shipmentId === shipmentIds[sector.featured]);
  const leadingMode = [...sample.byMode].sort((a, b) => b.emissionsKg - a.emissionsKg)[0];
  return <div className={styles.sectorExplorer}>
    <div className={styles.sectorTabs} role="tablist" aria-label="Industry scenarios">{sectors.map((item, index) => <button key={item.id} id={`${id}-${item.id}`} type="button" role="tab" aria-selected={selected === index} aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => navigateTabs(event, index, sectors.length, setSelected)}><item.Icon size={18} />{item.label}</button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${sector.id}`} tabIndex={0} className={styles.sectorPanel}>
      <div className={styles.sectorStory}><span className={styles.overline}>{sector.route}</span><h3>{sector.headline}</h3><p>{sector.copy}</p><div className={styles.buyerQuestion}><span>START WITH A BUSINESS QUESTION</span><strong>{sector.question}</strong></div><Link prefetch={false} href={`/demo/?sector=${sector.id}`} className={styles.solidLink}>Open this sample network <ArrowUpRight size={17} /></Link><p className={styles.sampleCaption}>Synthetic activity for exploration. No company-reported data.</p></div>
      <div className={styles.sectorNetwork}>
        <div className={styles.networkHeader}><span className={styles.overline}>INSIDE THE {sector.label.toUpperCase()} SAMPLE</span><span className={styles.sampleTag}>SYNTHETIC</span></div>
        <div className={styles.networkTotals}><div><strong>{number(sample.emissionsKg / 1000, 1)}<small> tCO₂e</small></strong><span>12-month sample footprint</span></div><div><strong>{sample.shipments}<small> shipments</small></strong><span>{sample.rows.length} transport legs · 4 modes</span></div></div>
        <div className={styles.shipmentHeader}><strong>{shipment[0].shipmentId}</strong><span>{shipment[0].subsidiary}</span></div>
        <div className={styles.routeStops} aria-label="Sample shipment route"><span><i />{shipment[0].origin}</span>{shipment.map(row => <span key={row.legIndex}><i />{row.destination}</span>)}</div>
        <div className={styles.routeLegs}>{shipment.map(row => {
          const mode = modes.find(item => item.id === row.mode)!;
          return <div key={row.legIndex}><span className={styles.legOrdinal}>0{row.legIndex}</span><mode.Icon size={17} /><span><strong>{mode.label} <small>· {number(row.tonnes, 1)} t</small></strong><small>{number(row.kilometres)} km · {FACTORS[row.profile].label}</small></span><b>{number(legEmissions(row) / 1000, 2)}<small> tCO₂e</small></b></div>;
        })}</div>
        <div className={styles.networkInsight}><span className={styles.insightDot} style={{ background: leadingMode.color }} /><p><strong>{leadingMode.label} contributes {number(leadingMode.emissionsKg / sample.emissionsKg * 100, 1)}%</strong> of this sample’s calculated freight emissions.</p><ArrowUpRight size={18} /></div>
        <div className={styles.networkFooter}><span>NIFTY 500 COMPANY LOOKUP</span><Link prefetch={false} href={`/demo/?sector=${sector.id}#company-search`}>Find your company <ArrowUpRight size={14} /></Link></div>
      </div>
    </div>
  </div>;
}

const pipelineRows: ShipmentLeg[] = [
  { shipmentId: 'TEMT-001', legIndex: 1, date: '2026-08-12', subsidiary: 'Western region', mode: 'road', profile: 'road-hcv', tonnes: 20, kilometres: 780 },
  { shipmentId: 'TEMT-002', legIndex: 1, date: '2026-08-13', subsidiary: 'Western region', mode: 'road', profile: 'road-hcv', tonnes: 24, kilometres: 60 },
  { shipmentId: 'TEMT-002', legIndex: 2, date: '2026-08-13', subsidiary: 'Western region', mode: 'rail', profile: 'rail-india', tonnes: 24, kilometres: 1040 },
];
const pipelineStages = [{ label: 'Validate', Icon: Database }, { label: 'Calculate', Icon: GitBranch }, { label: 'Aggregate', Icon: FileCheck2 }] as const;

export function PipelinePreview() {
  const id = useId();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [stage, setStage] = useState(0);
  const run = async () => {
    setLoading(true); setError('');
    try {
      const { analyze } = await import('@temt/calculator');
      setResult(analyze(pipelineRows.map((row, index) => invalid && index === 2 ? { ...row, tonnes: 'missing' } : row)));
    } catch { setError('The calculation engine could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  };
  const excluded = result ? pipelineRows.length - result.rows.length : 0;
  return <div className={styles.pipelinePreview}>
    <div className={styles.pipelineHeader}><span><FileSpreadsheet size={19} />shipment_preview.csv</span><span className={styles.sampleTag}>SAMPLE DATA</span></div>
    <div className={styles.pipelineSheet}><table><caption className={styles.visuallyHidden}>Three sample transport legs used in the calculation below</caption><thead><tr><th>Shipment / leg</th><th>Mode</th><th>Load</th><th>Distance</th></tr></thead><tbody>{pipelineRows.map((row, index) => <tr key={`${row.shipmentId}-${row.legIndex}`} className={invalid && index === 2 ? styles.invalidRow : ''}><td>{row.shipmentId}<small> / {row.legIndex}</small></td><td>{row.mode}</td><td>{invalid && index === 2 ? <strong>missing</strong> : `${row.tonnes} t`}</td><td>{number(row.kilometres)} km</td></tr>)}</tbody></table></div>
    <label className={styles.exceptionControl}><input type="checkbox" checked={invalid} disabled={loading} onChange={event => { setInvalid(event.target.checked); setResult(null); setError(''); }} /><span>Try a missing load value<small>See how an exception changes the result.</small></span><span className={styles.toggleTrack} aria-hidden="true" /></label>
    <div className={styles.pipelineTabs} role="tablist" aria-label="Calculation stages">{pipelineStages.map((item, index) => <button key={item.label} type="button" role="tab" id={`${id}-stage-${index}`} aria-controls={`${id}-stage-panel`} aria-selected={stage === index} tabIndex={stage === index ? 0 : -1} onClick={() => setStage(index)} onKeyDown={event => navigateTabs(event, index, pipelineStages.length, setStage)}><item.Icon size={18} /><span><small>0{index + 1}</small>{item.label}</span>{result && <Check size={13} className={styles.stageCheck} />}</button>)}</div>
    <div id={`${id}-stage-panel`} role="tabpanel" aria-labelledby={`${id}-stage-${stage}`} tabIndex={0} className={styles.stageDetail}>
      {stage === 0 ? <><strong>Complete shipments enter the total.</strong><p>{result ? `${result.rows.length} legs accepted; ${excluded} excluded. ${excluded ? 'TEMT-002 is excluded in full because one of its legs has no valid load.' : 'Shipment IDs and leg order are valid. Each load and distance is positive.'}` : 'Check loads, distances and leg order. If one leg is invalid, the entire shipment is excluded so a partial journey cannot disappear into the total.'}</p></> : stage === 1 ? <><strong>Activity × a traceable emission factor.</strong><p>Each leg uses tonnes × kilometres × kgCO₂e per tonne-km. India road: {FACTORS['road-hcv'].kgCO2ePerTonneKm}. India rail: {FACTORS['rail-india'].kgCO2ePerTonneKm}. Published GLEC v3.2 factors retain their source and assumptions.</p></> : <><strong>A group view you can trace back.</strong><p>{result ? `${result.totals.shipmentCount} complete ${result.totals.shipmentCount === 1 ? 'shipment' : 'shipments'} ${result.totals.shipmentCount === 1 ? 'produces' : 'produce'} ${number(result.totals.emissionsKg, 2)} kgCO₂e. Accepted legs feed the same mode, subsidiary and monthly totals.` : 'Accepted legs roll up by mode, subsidiary and month. The workspace exports the input ledger, versioned factors and validation exceptions together.'}</p></>}
    </div>
    <div className={styles.pipelineResult} aria-live="polite" aria-atomic="true">{error ? <><span role="alert">{error}</span><strong>Ready to retry.</strong></> : result ? <><div><span className={styles.overline}>CALCULATED FREIGHT EMISSIONS</span><strong>{number(result.totals.emissionsKg, 2)}<small> kgCO₂e</small></strong></div><span className={excluded ? styles.exceptionCount : styles.acceptedCount}>{result.rows.length} accepted<br />{excluded} excluded</span></> : <><div><span className={styles.overline}>YOUR RECORDS BECOME A RESULT.</span><strong>Follow the calculation.</strong></div><ArrowDownRight size={26} /></>}</div>
    {result && <details className={styles.calculationDetails}><summary>Inspect the calculation trail <ArrowUpRight size={12} /></summary><ul>{result.rows.map(row => <li key={`${row.shipmentId}-${row.legIndex}`}><strong>{row.shipmentId} / {row.legIndex}</strong><span>{number(row.tonnes)} t × {number(row.kilometres)} km × {row.factorKgPerTonneKm} = <b>{number(row.emissionsKg, 2)} kgCO₂e</b></span></li>)}{result.errors.map((item, index) => <li key={`error-${index}`} className={styles.trailError}><strong>Row {item.rowIndex + 1} · {item.shipmentId || 'Unidentified shipment'}</strong><span>{item.message}</span></li>)}</ul><Link prefetch={false} href="/methodology/">GLEC v3.2 methodology and source assumptions <ArrowUpRight size={12} /></Link></details>}
    <button type="button" onClick={result ? () => { setResult(null); setError(''); } : run} className={styles.pipelineRun} disabled={loading}>{loading ? <><RotateCcw size={16} className={styles.loading} /> Loading calculation engine</> : result ? <><RotateCcw size={16} /> Reset calculation</> : <><Play size={16} /> Run sample pipeline</>}<span>{result ? 'CALCULATED LOCALLY' : '3 RECORDS · NO ACCOUNT'}</span></button>
  </div>;
}

const monthLabel = (month: string) => new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export function ReportingPreview({ className = '' }: { className?: string }) {
  const id = useId();
  const [view, setView] = useState(0);
  const sample = useMemo(() => summarizeScenario('fmcg'), []);
  const maximum = Math.max(...sample.byMonth.map(month => month.emissionsKg));
  return <div className={`${styles.reportingPreview} ${className}`}>
    <div className={styles.reportHeader}><span><span className={styles.reportBrand}>TEMT</span><span className={styles.reportDivider} />EMISSIONS OVERVIEW</span><span className={styles.reportSample}>FMCG SAMPLE</span></div>
    <div className={styles.reportSummary}><div><span className={styles.overline}>FREIGHT FOOTPRINT</span><strong>{number(sample.emissionsKg / 1000, 1)}<small> tCO₂e</small></strong></div><p>Oct 2025 – Sep 2026<br /><span>24 shipments · 32 transport legs</span></p></div>
    <div className={styles.reportChartHeader}><h3>{view === 0 ? 'Where the footprint sits.' : 'How activity changes the picture.'}</h3><div className={styles.reportTabs} role="tablist" aria-label="Analytics breakdown">{['By mode', 'By month'].map((label, index) => <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={view === index} aria-controls={`${id}-chart`} tabIndex={view === index ? 0 : -1} onClick={() => setView(index)} onKeyDown={event => navigateTabs(event, index, 2, setView)}>{label}</button>)}</div></div>
    <div className={styles.reportChart} role="tabpanel" id={`${id}-chart`} aria-labelledby={`${id}-tab-${view}`} tabIndex={0}>
      {view === 0 ? <><div className={styles.stackedModeBar} aria-hidden="true">{sample.byMode.map(mode => <span key={mode.mode} style={{ width: `${mode.emissionsKg / sample.emissionsKg * 100}%`, background: mode.color }} />)}</div><div className={styles.reportModeGrid}>{sample.byMode.map(mode => <div key={mode.mode}><span><i style={{ background: mode.color }} />{mode.label}<small>{number(mode.emissionsKg / sample.emissionsKg * 100, 1)}%</small></span><strong>{number(mode.emissionsKg / 1000, 1)}<small> tCO₂e</small></strong><p>{mode.legCount} transport legs</p></div>)}</div></> : <div className={styles.monthChart}>
          <span className={styles.monthUnit}>tCO₂e</span>
          <div className={styles.monthPlot}>
            <div className={styles.monthAxis} aria-hidden="true"><span>{number(maximum / 1000, 0)}</span><span>{number(maximum / 2000, 0)}</span><span>0</span></div>
            <svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
              <title id={`${id}-chart-title`}>Monthly freight emissions in the FMCG sample</title><desc id={`${id}-chart-description`}>Twelve monthly totals from October 2025 to September 2026. Exact values are available in the chart data table below.</desc>
              {[0, .5, 1].map(tick => <line key={tick} x1="0" x2="600" y1={140 - tick * 120} y2={140 - tick * 120} stroke="#435146" strokeDasharray={tick ? '3 5' : undefined} />)}
              {sample.byMonth.map((month, index) => { const height = month.emissionsKg / maximum * 120; return <rect key={month.month} x={8 + index * 50} y={140 - height} width="34" height={height} fill={month.emissionsKg === maximum ? '#ef865a' : '#9bb487'} rx="1"><title>{monthLabel(month.month)} {month.month.slice(0, 4)}: {number(month.emissionsKg / 1000, 2)} tCO₂e</title></rect>; })}
            </svg>
          </div>
          <div className={styles.monthLabels} aria-hidden="true">{sample.byMonth.map(month => <span key={month.month}>{monthLabel(month.month)}</span>)}</div>
        </div>}
    </div>
    <details className={styles.reportData}><summary>View exact chart data <ArrowUpRight size={12} /></summary><table><caption>{view === 0 ? 'Mode breakdown' : 'Monthly breakdown'} · calculated synthetic FMCG activity</caption><thead><tr><th>{view === 0 ? 'Mode' : 'Month'}</th><th>Emissions (kgCO₂e)</th></tr></thead><tbody>{view === 0 ? sample.byMode.map(mode => <tr key={mode.mode}><td>{mode.label}</td><td>{number(mode.emissionsKg, 2)}</td></tr>) : sample.byMonth.map(month => <tr key={month.month}><td>{monthLabel(month.month)} {month.month.slice(0, 4)}</td><td>{number(month.emissionsKg, 2)}</td></tr>)}</tbody></table></details>
    <div className={styles.reportFooter}><span><FileCheck2 size={14} />Published factors. Traceable inputs.</span><Link prefetch={false} href="/demo/?sector=fmcg#analytics">Open full analytics <ArrowUpRight size={15} /></Link></div>
  </div>;
}
