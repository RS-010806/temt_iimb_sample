'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, FileCheck2, Pause, Play, TrainFront, Truck } from 'lucide-react';
import { compareFreightMix } from '@temt/calculator/preview';
import s from './cinematic-hero.module.css';

const format = (value: number, digits = 2) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const inputFormat = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 8 }).format(value);
const emissions = (kg: number, reference = kg) => reference >= 1e9 ? { amount: format(kg / 1e9), unit: 'MtCO₂e' } : reference >= 1e6 ? { amount: format(kg / 1e6), unit: 'ktCO₂e' } : reference >= 1000 ? { amount: format(kg / 1000), unit: 'tCO₂e' } : { amount: format(kg, kg > 0 && kg < .01 ? 6 : 2), unit: 'kgCO₂e' };
const chapters = [
  { name: 'Connect', title: 'Every shipment has a story.', detail: 'Bring the weight, distance and mode into one view.' },
  { name: 'Measure', title: 'Give every journey a number.', detail: 'Turn freight activity into a traceable carbon baseline.' },
  { name: 'Compare', title: 'See what a different mix changes.', detail: 'Explore a rail allocation with the same freight activity.' },
  { name: 'Report', title: 'Take the evidence with you.', detail: 'Carry your inputs, factors and results into the boardroom.' },
];

function FreightScene({ chapter, tonnes, km, rail, baseline, scenario }: { chapter: number; tonnes: number; km: number; rail: number; baseline: number; scenario: number }) {
  const baselineDisplay = emissions(baseline);
  const scenarioDisplay = emissions(scenario, baseline);
  return <div className={s.scene} data-chapter={chapter} id="freight-story-scene">
    <div className={s.sceneTop}><span><i /> FREIGHT, IN FOCUS</span><span>ILLUSTRATIVE NETWORK</span></div>
    <svg className={s.network} aria-hidden="true" viewBox="0 0 650 390" fill="none">
      <defs>
        <linearGradient id="yard-fill" x1="300" y1="100" x2="300" y2="380" gradientUnits="userSpaceOnUse"><stop stopColor="#98ac9b" stopOpacity=".12"/><stop offset="1" stopColor="#98ac9b" stopOpacity="0"/></linearGradient>
        <linearGradient id="rail-stroke"><stop stopColor="#acccb0"/><stop offset="1" stopColor="#e0edbf"/></linearGradient>
      </defs>
      <g className={s.ground}>
        <path d="M 16 260 L 324 83 L 639 254 L 328 432 Z" fill="url(#yard-fill)" stroke="#c4d2c0" strokeOpacity=".17" />
        <path d="M72 227L383 397 M134 192L445 362 M197 156L507 326 M258 121L571 291 M75 293L383 116 M137 327L446 150 M198 361L507 183 M260 396L569 219" stroke="#a4b7a3" strokeOpacity=".1" />
      </g>
      <path d="M89 271 L253 362 L551 193" stroke="#a4b5a2" strokeOpacity=".18" strokeWidth="17"/>
      <path d="M89 271 L253 362 L551 193" stroke="#d5d6c5" strokeOpacity=".55" strokeDasharray="4 8"/>
      <path className={s.roadTrace} d="M89 271 L253 362 L551 193" stroke="#f5875f" strokeWidth="2"/>
      <path className={s.railTrace} d="M89 271 L309 145 L551 193" stroke="url(#rail-stroke)" strokeWidth="2"/>
      <path className={s.railTrace} d="M89 278 L309 152 L551 200" stroke="#c3d5b2" strokeOpacity=".35"/>
      <g className={s.originBuilding}>
        <path d="M46 226L110 189L167 220L103 257Z" fill="#506453" stroke="#a9bca4"/>
        <path d="M46 226V252L103 284V257Z" fill="#283d31" stroke="#7d947e"/>
        <path d="M103 257L167 220V247L103 284Z" fill="#1a2d23" stroke="#7d947e"/>
        <path d="M116 252V270M127 246V264M138 239V258M150 233V252" stroke="#637e68"/>
        <path d="M54 228L112 261M65 221L123 254M77 214L135 247M89 207L147 240" stroke="#789477" strokeOpacity=".5"/>
      </g>
      <g className={s.terminal}>
        <path d="M271 104L320 76L364 100L316 129Z" fill="#4e6855" stroke="#adc0a4"/>
        <path d="M271 104V138L316 164V129Z" fill="#293e32" stroke="#7e987f"/>
        <path d="M316 129L364 100V134L316 164Z" fill="#203328" stroke="#7e987f"/>
        <path d="M283 126L305 138V151L283 139Z" fill="#101d16"/>
        <path d="M330 132L351 120V139L330 151Z" fill="#101d16"/>
      </g>
      <g className={s.destinationBuilding}>
        <path d="M491 153L550 119L607 149L548 183Z" fill="#606751" stroke="#c1c7a6"/>
        <path d="M491 153V180L548 213V183Z" fill="#3c4232" stroke="#9aa083"/>
        <path d="M548 183L607 149V178L548 213Z" fill="#2b3426" stroke="#9aa083"/>
        <path d="M502 159V181M514 166V188M527 172V195M539 179V202" stroke="#77816a"/>
      </g>
      <g className={s.roadCargo}><path d="M0 0L24-14L44-3L20 11Z" fill="#f69168"/><path d="M0 0V13L20 24V11Z" fill="#b45434"/><path d="M20 11L44-3V10L20 24Z" fill="#dc744d"/></g>
      <g className={s.railCargo}><path d="M0 0L32-19L48-10L16 9Z" fill="#d5e4bf"/><path d="M0 0V10L16 19V9Z" fill="#718b68"/><path d="M16 9L48-10V0L16 19Z" fill="#afc59e"/></g>
      <g className={s.networkNodes}><circle cx="89" cy="286" r="4" fill="#f5875f"/><circle cx="320" cy="172" r="4" fill="#c3d5b2"/><circle cx="551" cy="219" r="4" fill="#f4f2eb"/></g>
      <g className={s.diagramLabels} fill="#dbe4d4"><text x="44" y="311">ORIGIN</text><text x="271" y="63">RAIL TERMINAL</text><text x="498" y="106">DISTRIBUTION</text><text x="326" y="331" fill="#f8a480">ROAD</text><text x="409" y="162" fill="#d4e7bf">RAIL</text></g>
      <g className={s.reportBeam}><path d="M551 118V23H401" stroke="#c3d5b2" strokeDasharray="3 5"/><circle cx="551" cy="118" r="4" fill="#c3d5b2"/></g>
    </svg>
    <div className={s.sceneReadout}>
      {chapter === 0 && <><span className={s.readoutLabel}>01 / CONNECT THE INPUTS</span><div className={s.inputReadout}><span><Truck size={15}/>{inputFormat(tonnes)} t</span><i>×</i><span>{inputFormat(km)} km</span><Check size={15}/></div><small>Weight + distance + transport mode</small></>}
      {chapter === 1 && <><span className={s.readoutLabel}>02 / ESTABLISH THE BASELINE</span><strong>{baselineDisplay.amount} <small>{baselineDisplay.unit}</small></strong><small>All road · 0.0663 kgCO₂e / t-km</small></>}
      {chapter === 2 && <><span className={s.readoutLabel}>03 / COMPARE YOUR MIX</span><div className={s.mixReadout}><span>{baselineDisplay.amount} {baselineDisplay.unit}</span><ArrowRight size={20}/><strong>{scenarioDisplay.amount} <small>{scenarioDisplay.unit}</small></strong></div><small><TrainFront size={12}/> {rail}% rail · equal-distance illustration</small></>}
      {chapter === 3 && <><span className={s.readoutLabel}>04 / MAKE IT REPORTABLE</span><div className={s.reportReadout}><FileCheck2 size={29} strokeWidth={1.2}/><strong>{scenarioDisplay.amount} <small>{scenarioDisplay.unit}</small></strong></div><small>Inputs ✓ Factors ✓ Calculation version ✓</small></>}
    </div>
    <div className={s.sceneCaption}><span>0{chapter + 1} / 04</span><div><strong>{chapters[chapter].title}</strong><p>{chapters[chapter].detail}</p></div></div>
  </div>;
}

export function CinematicHero() {
  const [tonnesInput, setTonnesInput] = useState('1000');
  const [kmInput, setKmInput] = useState('1000');
  const tonnes = Math.max(1, Math.min(1000000, Number(tonnesInput) || 1));
  const km = Math.max(1, Math.min(20000, Number(kmInput) || 1));
  const [rail, setRail] = useState(30);
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const root = useRef<HTMLElement>(null);
  const result = useMemo(() => compareFreightMix(tonnes, km, rail), [tonnes, km, rail]);
  const saved = emissions(result.savedKg);
  const baseline = emissions(result.baselineKg);
  const scenario = emissions(result.scenarioKg, result.baselineKg);
  const running = visible && pageVisible && !paused && !reduced;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const updatePreference = () => setReduced(preference.matches || !!connection?.saveData);
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updatePreference(); updateVisibility();
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .08 });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); preference.removeEventListener('change', updatePreference); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setChapter(value => (value + 1) % chapters.length), 4600);
    return () => window.clearTimeout(timer);
  }, [running, chapter]);

  const chooseChapter = (index: number) => { setChapter(index); setPaused(true); };
  return <section ref={root} className={s.hero} aria-labelledby="hero-title" data-running={running} data-scene={chapter}>
    <picture className={s.background}><source media="(max-width: 700px)" srcSet="/images/freight-port-cinema-mobile-small.avif"/><img src="/images/freight-port-cinema-desktop.avif" width="1600" height="1067" alt="" fetchPriority="high" decoding="async"/></picture>
    <div className={s.scrim}/>
    <div className={`page-width ${s.heroMain}`}>
      <div className={s.copy}>
        <p className={`eyebrow ${s.kicker}`}><span className="status-dot"/> FOR THE ENTERPRISES MOVING INDIA</p>
        <h1 id="hero-title">Freight decisions.<br/><span>Backed by<br/>carbon data.</span></h1>
        <p className={s.description}>Your network moves the business.<br/>See its footprint. Explore a better way forward.</p>
        <div className={s.actions}><Link prefetch={false} href={`/demo/?quick=1&tonnes=${tonnes}&km=${km}&rail=${rail}`} className="button button-orange">Run your scenario <ArrowUpRight size={18}/></Link><a href="#platform" className="text-link light-link">Explore the platform <ArrowRight size={17}/></a></div>
        <p className={s.audience}>FOR NIFTY 500 TEAMS <span>AND THE SUPPLY CHAINS BEHIND THEM</span></p>
      </div>

    <div className={s.console} id="quick-estimate">
      <div className={s.consoleTop}><span><i/> YOUR FIRST FREIGHT DECISION, IN SECONDS</span><span>ILLUSTRATIVE MONTHLY SCENARIO</span></div>
      <div className={s.consoleBody}>
        <div className={s.inputs}><label>Monthly freight<div><input type="number" aria-label="Monthly freight in tonnes" value={tonnesInput} min={1} max={1000000} step="any" onFocus={() => setPaused(true)} onChange={event => setTonnesInput(event.target.value)} onBlur={() => setTonnesInput(String(tonnes))}/><span>tonnes</span></div></label><label>Average haul<div><input type="number" aria-label="Average haul in kilometres" value={kmInput} min={1} max={20000} step="any" onFocus={() => setPaused(true)} onChange={event => setKmInput(event.target.value)} onBlur={() => setKmInput(String(km))}/><span>km</span></div></label></div>
        <div className={s.mixControl}><div className={s.mixLabel}><label htmlFor="hero-rail-share">Shift road freight to rail</label><strong>{rail}<small>%</small></strong></div><input id="hero-rail-share" className={s.slider} type="range" min={0} max={100} step={5} value={rail} aria-valuetext={`${rail} percent of road freight shifted to rail`} onFocus={() => setPaused(true)} onChange={event => { setRail(Number(event.target.value)); setChapter(2); setPaused(true); }} style={{ '--share': `${rail}%` } as CSSProperties}/><div className={s.mixEndpoints}><span><Truck size={13}/> {100 - rail}% ROAD</span><span><TrainFront size={13}/> {rail}% RAIL</span></div></div>
        <div className={s.result} aria-live="polite" aria-atomic="true"><span>POTENTIAL REDUCTION</span><div><strong>{saved.amount}</strong><span>{saved.unit}</span><b><ArrowDownRight size={16}/>{format(result.reductionPercent, 1)}%</b></div><p>{baseline.amount} {baseline.unit} → {scenario.amount} {scenario.unit} / month</p></div>
      </div>
      <div className={s.consoleFoot}><details><summary>Assumptions & methodology <ChevronDown size={13}/></summary><p>Equal-distance illustration: GLEC v3.2 India road 0.0663 and rail 0.0106 kgCO₂e/t-km, well-to-wheel. Excludes terminals and first/last-mile changes. Rail availability, cost and capacity need an operational review. <Link prefetch={false} href="/methodology/">Read the methodology.</Link></p></details><a href="#workflow">See how the calculation works <ArrowRight size={14}/></a></div>
    </div>
      <div className={s.film}>
        <FreightScene chapter={chapter} tonnes={tonnes} km={km} rail={rail} baseline={result.baselineKg} scenario={result.scenarioKg}/>
        <div className={s.filmControls}>
          <div className={s.chapters} aria-label="Freight story chapters">{chapters.map((item, index) => <button type="button" key={item.name} onClick={() => chooseChapter(index)} aria-pressed={chapter === index} aria-controls="freight-story-scene" className={chapter === index ? s.activeChapter : ''}><span>0{index + 1}</span>{item.name}<i key={`${index}-${chapter}-${running}`} /></button>)}</div>
          {!reduced ? <button type="button" className={s.playback} onClick={() => setPaused(!paused)} aria-label={paused ? 'Play freight story' : 'Pause freight story'}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button> : <span className={s.reducedLabel}>MANUAL<br/>PLAYBACK</span>}
        </div>
      </div>
    </div>
    <div className={`page-width ${s.heroFoot}`}><span>TRANSPORTATION EMISSIONS MEASUREMENT TOOL</span><a href="#platform">SCROLL TO EXPLORE <ChevronDown size={12}/></a></div>
  </section>;
}
