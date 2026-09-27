"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, Landmark, PlayCircle, ShieldCheck } from "lucide-react";
import { calculateLeg, estimateLandDistanceKm, greatCircleKm } from "@temt/calculator";
import { vehicleForTonnes } from "@/lib/builders";
import { emissions, fmt, pct } from "@/lib/format";
import { cx } from "../ui";

const CITIES = [
  { id: "mumbai", name: "Mumbai", lat: 19.07, lon: 72.88 }, { id: "delhi", name: "Delhi", lat: 28.65, lon: 77.23 }, { id: "bengaluru", name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { id: "chennai", name: "Chennai", lat: 13.09, lon: 80.28 }, { id: "kolkata", name: "Kolkata", lat: 22.56, lon: 88.36 }, { id: "hyderabad", name: "Hyderabad", lat: 17.38, lon: 78.46 },
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.03, lon: 72.59 }, { id: "pune", name: "Pune", lat: 18.52, lon: 73.86 }, { id: "nagpur", name: "Nagpur", lat: 21.15, lon: 79.08 },
  { id: "guwahati", name: "Guwahati", lat: 26.18, lon: 91.75 }, { id: "jaipur", name: "Jaipur", lat: 26.92, lon: 75.79 }, { id: "lucknow", name: "Lucknow", lat: 26.84, lon: 80.92 },
  { id: "kochi", name: "Kochi", lat: 9.94, lon: 76.26 }, { id: "ludhiana", name: "Ludhiana", lat: 30.91, lon: 75.85 }, { id: "bhubaneswar", name: "Bhubaneswar", lat: 20.27, lon: 85.83 },
  { id: "indore", name: "Indore", lat: 22.72, lon: 75.83 }, { id: "visakhapatnam", name: "Visakhapatnam", lat: 17.69, lon: 83.22 }, { id: "patna", name: "Patna", lat: 25.59, lon: 85.14 },
] as const;
type CityId = (typeof CITIES)[number]["id"];
const MINOR = [[31.63, 74.87], [30.73, 76.78], [27.18, 78.02], [25.32, 82.97], [23.26, 77.41], [21.17, 72.83], [22.3, 70.8], [19.99, 73.79], [15.85, 74.5], [15.3, 74.12], [12.3, 76.64], [11.0, 76.96], [9.92, 78.12], [8.52, 76.94], [16.51, 80.65], [18.11, 83.4], [21.25, 81.63], [23.34, 85.31], [24.8, 93.94], [27.47, 94.91], [34.08, 74.8], [26.45, 74.63], [24.58, 73.71], [29.95, 78.16], [26.2, 78.18], [22.72, 88.48], [10.79, 78.7], [14.44, 79.99], [12.91, 74.86], [20.94, 72.95]];

const W = 460, H = 520;
const project = (lat: number, lon: number) => ({ x: ((lon - 67.5) / (97.5 - 67.5)) * W, y: ((37 - lat) / (37 - 6.5)) * H });
const LANES: [CityId, CityId, string][] = [["mumbai", "delhi", "var(--color-maroon-300)"], ["delhi", "kolkata", "#8fb4e3"], ["chennai", "kolkata", "#7fd1c4"], ["bengaluru", "mumbai", "var(--color-maroon-300)"], ["delhi", "bengaluru", "#e8c07a"], ["ahmedabad", "kolkata", "#8fb4e3"], ["chennai", "hyderabad", "var(--color-maroon-300)"], ["mumbai", "kochi", "#7fd1c4"], ["delhi", "guwahati", "#8fb4e3"], ["nagpur", "chennai", "var(--color-maroon-300)"]];

function curve(a: CityId, b: CityId) {
  const p = CITIES.find((city) => city.id === a)!, q = CITIES.find((city) => city.id === b)!;
  const A = project(p.lat, p.lon), B = project(q.lat, q.lon);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const dx = B.x - A.x, dy = B.y - A.y;
  const bend = 0.18;
  return `M${A.x.toFixed(1)},${A.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${B.x.toFixed(1)},${B.y.toFixed(1)}`;
}

export function FreightNetwork({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Animated freight lanes between major Indian cities">
      <defs>
        <radialGradient id="hub-glow"><stop offset="0%" stopColor="#efc4c0" stopOpacity=".55" /><stop offset="100%" stopColor="#efc4c0" stopOpacity="0" /></radialGradient>
      </defs>
      {MINOR.map(([lat, lon], i) => { const p = project(lat!, lon!); return <circle key={i} cx={p.x} cy={p.y} r="1.6" fill="#efc4c0" opacity=".35" />; })}
      {LANES.map(([a, b, color], i) => (
        <g key={`${a}-${b}`}>
          <path id={`lane-${i}`} d={curve(a, b)} fill="none" stroke={color} strokeOpacity=".5" strokeWidth="1.3" strokeDasharray="2 5" className="lane-dash" />
          <circle r="3" fill={color} className="motion-safe-only">
            <animateMotion dur={`${6 + (i % 4) * 1.7}s`} repeatCount="indefinite" begin={`${i * 0.6}s`}><mpath href={`#lane-${i}`} /></animateMotion>
          </circle>
        </g>
      ))}
      {CITIES.map((city, i) => {
        const p = project(city.lat, city.lon);
        const major = i < 6;
        return (
          <g key={city.id}>
            {major && <circle cx={p.x} cy={p.y} r="16" fill="url(#hub-glow)" className="hub-pulse" style={{ animationDelay: `${i * 0.4}s` }} />}
            <circle cx={p.x} cy={p.y} r={major ? 4 : 2.8} fill="white" />
            {major && <text x={city.lon < 78 ? p.x - 8 : p.x + 8} y={p.y + 4} textAnchor={city.lon < 78 ? "end" : "start"} fill="#fcf3f2" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)">{city.name}</text>}
          </g>
        );
      })}
      <style>{`.lane-dash{animation:lane 1.6s linear infinite}@keyframes lane{to{stroke-dashoffset:-14}}.hub-pulse{transform-box:fill-box;transform-origin:center;animation:hub 3.2s ease-in-out infinite}@keyframes hub{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:.9;transform:scale(1.25)}}@media (prefers-reduced-motion:reduce){.motion-safe-only{display:none}.lane-dash,.hub-pulse{animation:none}}`}</style>
    </svg>
  );
}

function HeroCalculator() {
  const [from, setFrom] = useState<CityId>("mumbai");
  const [to, setTo] = useState<CityId>("delhi");
  const [tonnes, setTonnes] = useState(20);
  const result = useMemo(() => {
    const a = CITIES.find((city) => city.id === from)!, b = CITIES.find((city) => city.id === to)!;
    if (from === to) return null;
    const gcd = greatCircleKm(a, b);
    const roadKm = estimateLandDistanceKm("road", a, b);
    const road = calculateLeg({ mode: "road", tonnes, distanceKm: roadKm, vehicleClass: vehicleForTonnes(tonnes) }).wtwKg;
    const rail = calculateLeg({ mode: "rail", tonnes, distanceKm: estimateLandDistanceKm("rail", a, b) }).wtwKg + 2 * calculateLeg({ mode: "road", tonnes, distanceKm: 30, vehicleClass: vehicleForTonnes(Math.min(12, tonnes)) }).wtwKg;
    const air = calculateLeg({ mode: "air", tonnes, distanceKm: gcd }).wtwKg;
    return { km: roadKm, options: [{ id: "road", label: "Road", kg: road, color: "var(--mode-road)" }, { id: "rail", label: "Rail + drayage", kg: rail, color: "var(--mode-rail)" }, { id: "air", label: "Air", kg: air, color: "var(--mode-air)" }] };
  }, [from, to, tonnes]);
  const max = result ? Math.max(...result.options.map((option) => option.kg)) : 1;
  const saving = result ? (1 - result.options[1]!.kg / result.options[0]!.kg) * 100 : 0;
  const select = "w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[14px] font-semibold text-ink focus:border-maroon-500 focus:outline-none";
  return (
    <div className="relative rounded-2xl border border-white/40 bg-white p-5 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,.55)]">
      <div className="flex items-center justify-between gap-3"><p className="text-[13px] font-bold">Try it: compare modes</p><span className="badge badge-maroon !text-[11px]">GLEC v3.2 India</span></div>
      <div className="mt-4 grid grid-cols-[1fr_1fr_84px] gap-2">
        <label className="grid gap-1"><span className="text-[11px] font-semibold text-grey-600">From</span><select className={select} value={from} onChange={(event) => setFrom(event.target.value as CityId)}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="text-[11px] font-semibold text-grey-600">To</span><select className={select} value={to} onChange={(event) => setTo(event.target.value as CityId)}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="text-[11px] font-semibold text-grey-600">Tonnes</span><input className={select} type="number" min={1} max={500} value={tonnes} onChange={(event) => setTonnes(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /></label>
      </div>
      {result ? (
        <div className="mt-5 grid gap-3" aria-live="polite">
          {result.options.map((option) => {
            const value = emissions(option.kg);
            return (
              <div key={option.id}>
                <div className="mb-1 flex items-baseline justify-between text-[13px]"><span className="font-semibold">{option.label}</span><span className="num font-bold">{value.value} <span className="font-normal text-grey-600">{value.unit}</span></span></div>
                <div className="h-2.5 rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, (option.kg / max) * 100)}%`, background: option.color }} /></div>
              </div>
            );
          })}
          <p className="mt-1 rounded-lg bg-maroon-50 px-3 py-2 text-[13px] text-maroon-900">Rail cuts this shipment's footprint by <strong>{pct(saving, 0)}</strong> over ~{fmt(result.km, 0)} km of road.</p>
          <Link prefetch={false} href={`/app/compare/?from=${CITIES.find((city) => city.id === from)!.name}&to=${CITIES.find((city) => city.id === to)!.name}&t=${tonnes}`} className="btn btn-primary w-full">Open the full comparison <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      ) : <p className="mt-6 text-sm text-grey-600">Pick two different cities.</p>}
    </div>
  );
}

export function Hero() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_85%_10%,#8f1716_0%,#4c0808_45%,#2a0505_100%)] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
      <FreightNetwork className="pointer-events-none absolute -right-10 top-4 hidden h-[560px] w-auto opacity-80 lg:block xl:right-[30%]" />
      <div className="container-page relative grid gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className={cx("transition-all duration-1000", visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold text-maroon-100"><BadgeCheck size={14} className="text-sand" aria-hidden="true" /> India's first ISO 14083-certified freight emissions platform</p>
          <h1 className="display mt-6 text-[42px] leading-[1.04] sm:text-[56px] lg:text-[64px]">Measure freight emissions <span className="italic text-maroon-200">the way India moves.</span></h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-maroon-100">TEMT, from the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore, turns shipments into traceable, ISO 14083-aligned emissions across road, rail, air, sea and inland waterways, with Indian factors, BRSR-mapped reports and a Copilot that works in plain English.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link prefetch={false} href="/app/" className="btn btn-light btn-lg">Open TEMT, free <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link prefetch={false} href="/tour/" className="btn btn-outline-light btn-lg"><PlayCircle size={18} aria-hidden="true" /> Watch the video tour</Link>
          </div>
          <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.14em] text-maroon-200">Credentials of the TEMT platform</p>
          <ul className="mt-3 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-maroon-100 sm:grid-cols-4">
            {[[ShieldCheck, "ISO 14083"], [ShieldCheck, "ISO/IEC 27001:2022"], [Landmark, "Adopted by DPIIT"], [Building2, "Integrated with ULIP"]].map(([Icon, label]) => { const I = Icon as typeof ShieldCheck; return <li key={String(label)} className="flex items-center gap-2"><I size={15} className="shrink-0 text-sand" aria-hidden="true" />{String(label)}</li>; })}
          </ul>
        </div>
        <div className={cx("transition-all delay-200 duration-1000", visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0")}>
          <HeroCalculator />
        </div>
      </div>
    </section>
  );
}
