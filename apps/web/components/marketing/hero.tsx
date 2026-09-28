"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, Calculator, Check, MousePointer2, FileSpreadsheet, FileText, Landmark, PlayCircle, ShieldCheck, TrainFront, Truck, Plane, BarChart3 } from "lucide-react";
import { calculateLeg, estimateLandDistanceKm, greatCircleKm } from "@temt/calculator";
import { vehicleForTonnes } from "@/lib/builders";
import { emissions, fmt, pct } from "@/lib/format";
import { cx } from "../ui";

// ─── The live walkthrough: one shipment, calculated by the real engine ────
const MUMBAI = { lat: 19.07, lon: 72.88 };
const DELHI = { lat: 28.65, lon: 77.23 };
const TONNES = 20;
const STAGES = ["Enter a shipment", "Get its footprint", "Compare modes", "Report it"] as const;
const STAGE_MS = 4600;

function useShipment() {
  return useMemo(() => {
    const roadKm = estimateLandDistanceKm("road", MUMBAI, DELHI);
    const road = calculateLeg({ mode: "road", tonnes: TONNES, distanceKm: roadKm, vehicleClass: "gvw-30-50" });
    const drayage = calculateLeg({ mode: "road", tonnes: TONNES, distanceKm: 30, vehicleClass: vehicleForTonnes(TONNES) }).wtwKg * 2;
    const rail = calculateLeg({ mode: "rail", tonnes: TONNES, distanceKm: estimateLandDistanceKm("rail", MUMBAI, DELHI) }).wtwKg + drayage;
    const air = calculateLeg({ mode: "air", tonnes: TONNES, distanceKm: greatCircleKm(MUMBAI, DELHI) }).wtwKg;
    return { roadKm, road, options: [
      { id: "road", label: "Road, 32 ft truck", icon: Truck, kg: road.wtwKg, color: "var(--mode-road)" },
      { id: "rail", label: "Rail with drayage", icon: TrainFront, kg: rail, color: "var(--mode-rail)" },
      { id: "air", label: "Air cargo", icon: Plane, kg: air, color: "var(--mode-air)" },
    ] };
  }, []);
}

function useCountUp(target: number, active: boolean, ms = 1100) {
  const [value, setValue] = useState(active ? target : 0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, ms]);
  return value;
}

function Typed({ text, active, delay = 0 }: { text: string; active: boolean; delay?: number }) {
  const [shown, setShown] = useState(active ? text.length : 0);
  useEffect(() => {
    if (!active) { setShown(0); return; }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => { i += 1; setShown(i); if (i < text.length) timer = setTimeout(next, 55); };
    timer = setTimeout(next, delay);
    return () => clearTimeout(timer);
  }, [text, active, delay]);
  return <>{text.slice(0, shown)}{active && shown < text.length && <span className="ml-px inline-block h-[1.05em] w-[1.5px] translate-y-[2px] animate-pulse bg-maroon-600" aria-hidden="true" />}</>;
}

function ProductWalkthrough() {
  const data = useShipment();
  const [stage, setStage] = useState(0);
  const [reduced, setReduced] = useState(false);
  const paused = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const timer = setInterval(() => { if (!paused.current && !media.matches) setStage((current) => (current + 1) % STAGES.length); }, STAGE_MS);
    return () => clearInterval(timer);
  }, []);
  const total = emissions(data.road.wtwKg);
  const counted = useCountUp(data.road.wtwKg, stage >= 1 || reduced);
  const shown = emissions(counted, { unit: total.unit === "kg" ? "kg" : "t" });
  const ttwShare = data.road.ttwKg / data.road.wtwKg;
  const max = Math.max(...data.options.map((option) => option.kg));
  const saving = 1 - data.options[1]!.kg / data.options[0]!.kg;
  const fields: [string, string][] = [["From", "Mumbai"], ["To", "Delhi"], ["Cargo", `${TONNES} t · FMCG`], ["Truck", "32 ft multi-axle, diesel"]];

  return (
    <div className="relative" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <div className="overflow-hidden rounded-2xl bg-white text-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.65)] ring-1 ring-white/20">
        <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <p className="ml-2 truncate text-[12px] font-semibold text-grey-600">TEMT · {STAGES[stage]}</p>
        </div>
        <ol className="grid grid-cols-4 gap-1.5 px-4 pt-4" aria-label="What TEMT does">
          {STAGES.map((label, i) => (
            <li key={label}>
              <button type="button" onClick={() => setStage(i)} className="group grid w-full gap-1.5 text-left" aria-current={stage === i ? "step" : undefined}>
                <span className="h-1 overflow-hidden rounded-full bg-stone-200"><span className={cx("block h-full rounded-full bg-maroon-600", stage === i && !reduced ? "hero-progress" : stage > i ? "w-full" : "w-0")} style={stage === i ? { animationDuration: `${STAGE_MS}ms` } : undefined} /></span>
                <span className={cx("text-[11px] font-semibold leading-tight transition-colors", stage === i ? "text-maroon-700" : "text-grey-500 group-hover:text-grey-700")}>{i + 1}. {label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="relative h-[318px] px-4 pb-4 pt-3 sm:h-[300px] sm:px-5">
          {/* 1. Enter a shipment */}
          <div className={cx("hero-stage", stage === 0 && "is-active")}>
            <div className="grid grid-cols-2 gap-2.5">
              {fields.map(([label, text], i) => (
                <div key={label} className={cx("rounded-lg border px-3 py-2", stage === 0 ? "border-maroon-200 bg-maroon-50/40" : "border-stone-200")}>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-grey-500">{label}</p>
                  <p className="mt-0.5 min-h-[20px] text-[14px] font-semibold"><Typed text={text} active={stage === 0 && !reduced} delay={250 + i * 650} />{(reduced || stage !== 0) && text}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-grey-600"><Check size={14} className="text-ok" aria-hidden="true" /> Distance found automatically: about {fmt(data.roadKm, 0)} km by road</p>
            <p className="mt-1.5 hidden items-center gap-2 text-[12.5px] text-grey-600 sm:flex"><Check size={14} className="text-ok" aria-hidden="true" /> Cities, 6-digit PIN codes, ports and airports</p>
            <div className="absolute inset-x-0 bottom-0">
              <div className={cx("relative flex h-11 items-center justify-center gap-2 rounded-lg bg-maroon-700 text-[14px] font-semibold text-white", stage === 0 && !reduced && "hero-press")} style={{ animationDuration: `${STAGE_MS}ms` }}>
                <Calculator size={16} aria-hidden="true" /> Calculate emissions
                {stage === 0 && !reduced && <MousePointer2 size={20} className="hero-cursor absolute left-[62%] top-[55%] text-ink" fill="#fff" style={{ animationDuration: `${STAGE_MS}ms` }} aria-hidden="true" />}
              </div>
            </div>
          </div>

          {/* 2. Footprint */}
          <div className={cx("hero-stage", stage === 1 && "is-active")}>
            <p className="text-[12px] font-semibold text-grey-600">Well-to-wheel emissions · Mumbai → Delhi, {TONNES} t</p>
            <p className="mt-1 flex items-baseline gap-2"><span className="num text-[44px] font-bold leading-none tracking-tight text-maroon-800">{shown.value}</span><span className="text-[17px] font-semibold text-grey-600">{total.unit}</span></p>
            <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full bg-stone-100">
              <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: stage >= 1 || reduced ? `${ttwShare * 100}%` : "0%", background: "var(--stage-ttw)" }} />
              <span className="h-full transition-[width] delay-300 duration-1000 ease-out" style={{ width: stage >= 1 || reduced ? `${(1 - ttwShare) * 100}%` : "0%", background: "var(--stage-wtt)" }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-grey-700">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--stage-ttw)" }} />Burned in the truck {pct(ttwShare * 100, 0)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--stage-wtt)" }} />Producing the fuel {pct((1 - ttwShare) * 100, 0)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11.5px] font-semibold">
              <span className="rounded-full bg-maroon-50 px-2.5 py-1 text-maroon-700">Scope 3 · Category 4</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-grey-700">{fmt(data.road.intensityG, 1)} g CO₂e per tonne-km</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-grey-700">ISO 14083 basis recorded</span>
            </div>
            <dl className="absolute inset-x-0 bottom-0 hidden grid-cols-3 gap-2 border-t border-stone-200 pt-3 text-[11.5px] sm:grid">
              {[["Distance", `${fmt(data.roadKm, 0)} km, shortest feasible`], ["Emission factor", "TEMT, India-specific"], ["Data type", "Default, upgradeable to fuel data"]].map(([term, value]) => (
                <div key={term}><dt className="font-semibold uppercase tracking-[0.06em] text-grey-500">{term}</dt><dd className="mt-0.5 leading-snug text-grey-800">{value}</dd></div>
              ))}
            </dl>
          </div>

          {/* 3. Compare */}
          <div className={cx("hero-stage", stage === 2 && "is-active")}>
            <p className="text-[12px] font-semibold text-grey-600">Same cargo, door to door</p>
            <div className="mt-3 grid gap-3">
              {data.options.map((option, i) => {
                const value = emissions(option.kg);
                const Icon = option.icon;
                return (
                  <div key={option.id}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2 font-semibold"><Icon size={14} className="text-grey-500" aria-hidden="true" />{option.label}{option.id === "rail" && <span className="rounded-full bg-[#e6f2ea] px-2 py-px text-[10.5px] font-bold text-ok">Lowest</span>}</span>
                      <span className="num font-bold">{value.value} <span className="font-normal text-grey-600">{value.unit}</span></span>
                    </div>
                    <div className="h-2.5 rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: stage === 2 || reduced ? `${Math.max(2, (option.kg / max) * 100)}%` : "0%", background: option.color, transitionDelay: `${i * 180}ms` }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 rounded-lg bg-maroon-50 px-3 py-2 text-[13px] text-maroon-900">Moving this load by rail cuts its footprint by <strong>{pct(saving * 100, 0)}</strong>.</p>
          </div>

          {/* 4. Report */}
          <div className={cx("hero-stage", stage === 3 && "is-active")}>
            <p className="text-[12px] font-semibold text-grey-600">Every shipment rolls into your annual report</p>
            <ul className="mt-3 grid gap-2 text-[13px]">
              {[["Scope 3 · Category 4", "Upstream transportation"], ["BRSR Principle 6", "GHG emissions, value chain"], ["Emission intensity", "per tonne-km and per ₹ crore"]].map(([title, body], i) => (
                <li key={title} className={cx("flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 transition-all duration-500", stage === 3 || reduced ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0")} style={{ transitionDelay: `${i * 150}ms` }}>
                  <span className="font-semibold">{title}</span><span className="text-right text-[12px] text-grey-600">{body}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {[[FileText, "PDF"], [FileSpreadsheet, "Excel"], [FileText, "Word"], [BarChart3, "Power BI"]].map(([Icon, label], i) => {
                const I = Icon as typeof FileText;
                return <span key={label as string} className={cx("inline-flex items-center gap-1.5 rounded-full border border-maroon-200 bg-white px-3 py-1 text-[12px] font-semibold text-maroon-800 transition-all duration-500", stage === 3 || reduced ? "scale-100 opacity-100" : "scale-90 opacity-0")} style={{ transitionDelay: `${450 + i * 120}ms` }}><I size={13} aria-hidden="true" />{label as string}<Check size={12} className="text-ok" aria-hidden="true" /></span>;
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-maroon-200">Calculated live with TEMT's engine. Hover to pause.</p>
      <style>{`
        .hero-stage { position: absolute; inset: 12px 16px 16px; opacity: 0; transform: translateY(10px); transition: opacity .45s ease, transform .6s cubic-bezier(.2,.8,.2,1); pointer-events: none; }
        @media (min-width: 640px) { .hero-stage { inset: 12px 20px 16px; } }
        .hero-stage.is-active { opacity: 1; transform: none; pointer-events: auto; }
        .hero-progress { animation: hero-progress linear forwards; width: 0; }
        .hero-press { animation-name: hero-press; animation-timing-function: ease; animation-fill-mode: both; }
        @keyframes hero-press { 0%, 80% { transform: none; background: #740000; } 84% { transform: scale(.97); background: #520000; } 90%, 100% { transform: none; background: #740000; } }
        .hero-cursor { animation-name: hero-cursor; animation-timing-function: cubic-bezier(.3,.7,.3,1); animation-fill-mode: both; filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
        @keyframes hero-cursor { 0%, 58% { opacity: 0; transform: translate(70px, 40px); } 66% { opacity: 1; } 79% { opacity: 1; transform: none; } 84% { transform: scale(.85); } 90%, 100% { opacity: 1; transform: none; } }
        @keyframes hero-progress { to { width: 100%; } }
        @media (prefers-reduced-motion: reduce) { .hero-stage { transition: none; } .hero-progress { animation: none; width: 100%; } }
      `}</style>
    </div>
  );
}

export function Hero() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(110%_120%_at_90%_0%,#8f1716_0%,#4c0808_48%,#2a0505_100%)] text-white">
      <div className="container-page relative grid gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className={cx("transition-all duration-1000", visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold text-maroon-100"><BadgeCheck size={14} className="text-sand" aria-hidden="true" /> India's first ISO 14083-certified freight emissions platform</p>
          <h1 className="display mt-6 text-[40px] leading-[1.05] sm:text-[54px] lg:text-[60px]">Measure freight emissions <span className="italic text-maroon-200">the way India moves.</span></h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-maroon-100">TEMT, from IIM Bangalore's Supply Chain Management Centre, calculates the emissions of every shipment by road, rail, air, sea and inland waterway with India-specific factors, compares cleaner options, and turns the results into BRSR-ready reports.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link prefetch={false} href="/app/" className="btn btn-light btn-lg">Open TEMT, free <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link prefetch={false} href="/tour/" className="btn btn-outline-light btn-lg"><PlayCircle size={18} aria-hidden="true" /> Watch the video tour</Link>
          </div>
          <ul className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-maroon-100 sm:grid-cols-4" aria-label="Credentials">
            {[[ShieldCheck, "ISO 14083 certified"], [ShieldCheck, "ISO/IEC 27001:2022"], [Landmark, "Adopted by DPIIT"], [Building2, "Integrated with ULIP"]].map(([Icon, label]) => { const I = Icon as typeof ShieldCheck; return <li key={String(label)} className="flex items-center gap-2"><I size={15} className="shrink-0 text-sand" aria-hidden="true" />{String(label)}</li>; })}
          </ul>
        </div>
        <div className={cx("transition-all delay-200 duration-1000", visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0")}>
          <ProductWalkthrough />
        </div>
      </div>
    </section>
  );
}
