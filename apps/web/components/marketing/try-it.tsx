"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { calculateLeg, estimateLandDistanceKm, greatCircleKm } from "@temt/calculator";
import { vehicleForTonnes } from "@/lib/builders";
import { emissions, fmt, pct } from "@/lib/format";
import { SectionHeading } from "./sections";

const CITIES = [
  { id: "mumbai", name: "Mumbai", lat: 19.07, lon: 72.88 }, { id: "delhi", name: "Delhi", lat: 28.65, lon: 77.23 }, { id: "bengaluru", name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { id: "chennai", name: "Chennai", lat: 13.09, lon: 80.28 }, { id: "kolkata", name: "Kolkata", lat: 22.56, lon: 88.36 }, { id: "hyderabad", name: "Hyderabad", lat: 17.38, lon: 78.46 },
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.03, lon: 72.59 }, { id: "pune", name: "Pune", lat: 18.52, lon: 73.86 }, { id: "nagpur", name: "Nagpur", lat: 21.15, lon: 79.08 },
  { id: "guwahati", name: "Guwahati", lat: 26.18, lon: 91.75 }, { id: "jaipur", name: "Jaipur", lat: 26.92, lon: 75.79 }, { id: "lucknow", name: "Lucknow", lat: 26.84, lon: 80.92 },
  { id: "kochi", name: "Kochi", lat: 9.94, lon: 76.26 }, { id: "ludhiana", name: "Ludhiana", lat: 30.91, lon: 75.85 }, { id: "bhubaneswar", name: "Bhubaneswar", lat: 20.27, lon: 85.83 },
  { id: "indore", name: "Indore", lat: 22.72, lon: 75.83 }, { id: "visakhapatnam", name: "Visakhapatnam", lat: 17.69, lon: 83.22 }, { id: "patna", name: "Patna", lat: 25.59, lon: 85.14 },
] as const;
type CityId = (typeof CITIES)[number]["id"];

/** A quick, live comparison on the landing page, using the same engine as the product. */
export function TryIt() {
  const [from, setFrom] = useState<CityId>("chennai");
  const [to, setTo] = useState<CityId>("kolkata");
  const [tonnes, setTonnes] = useState(25);
  const result = useMemo(() => {
    const a = CITIES.find((city) => city.id === from)!, b = CITIES.find((city) => city.id === to)!;
    if (from === to) return null;
    const roadKm = estimateLandDistanceKm("road", a, b);
    const road = calculateLeg({ mode: "road", tonnes, distanceKm: roadKm, vehicleClass: vehicleForTonnes(tonnes) }).wtwKg;
    const rail = calculateLeg({ mode: "rail", tonnes, distanceKm: estimateLandDistanceKm("rail", a, b) }).wtwKg + 2 * calculateLeg({ mode: "road", tonnes, distanceKm: 30, vehicleClass: vehicleForTonnes(Math.min(12, tonnes)) }).wtwKg;
    const air = calculateLeg({ mode: "air", tonnes, distanceKm: greatCircleKm(a, b) }).wtwKg;
    return { km: roadKm, options: [{ id: "road", label: "Road", kg: road, color: "var(--mode-road)" }, { id: "rail", label: "Rail + drayage", kg: rail, color: "var(--mode-rail)" }, { id: "air", label: "Air", kg: air, color: "var(--mode-air)" }] };
  }, [from, to, tonnes]);
  const max = result ? Math.max(...result.options.map((option) => option.kg)) : 1;
  const saving = result ? (1 - result.options[1]!.kg / result.options[0]!.kg) * 100 : 0;
  const select = "w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[14px] font-semibold text-ink focus:border-maroon-500 focus:outline-none";
  return (
    <section id="try" className="bg-paper py-20 md:py-24">
      <div className="container-page grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionHeading eyebrow="Try it" title="Compare modes for any lane in seconds." body="Pick two cities and a load. TEMT estimates the distance and compares road, rail with drayage and air with the same engine as the full product." />
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[var(--shadow-float)]">
          <div className="grid grid-cols-[1fr_1fr_96px] gap-2.5">
            <label className="grid gap-1"><span className="text-[12px] font-semibold text-grey-600">From</span><select aria-label="From" className={select} value={from} onChange={(event) => setFrom(event.target.value as CityId)}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[12px] font-semibold text-grey-600">To</span><select aria-label="To" className={select} value={to} onChange={(event) => setTo(event.target.value as CityId)}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-[12px] font-semibold text-grey-600">Tonnes</span><input aria-label="Tonnes" className={select} type="number" min={1} max={500} value={tonnes} onChange={(event) => setTonnes(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /></label>
          </div>
          {result ? (
            <div className="mt-6 grid gap-3.5" aria-live="polite">
              {result.options.map((option) => {
                const value = emissions(option.kg);
                return (
                  <div key={option.id}>
                    <div className="mb-1 flex items-baseline justify-between text-[14px]"><span className="font-semibold">{option.label}</span><span className="num font-bold">{value.value} <span className="font-normal text-grey-600">{value.unit}</span></span></div>
                    <div className="h-2.5 rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, (option.kg / max) * 100)}%`, background: option.color }} /></div>
                  </div>
                );
              })}
              <p className="mt-1 rounded-lg bg-maroon-50 px-3 py-2 text-[13.5px] text-maroon-900">Rail cuts this shipment's footprint by <strong>{pct(saving, 0)}</strong> over about {fmt(result.km, 0)} km of road.</p>
              <Link prefetch={false} href={`/app/compare/?from=${CITIES.find((city) => city.id === from)!.name}&to=${CITIES.find((city) => city.id === to)!.name}&t=${tonnes}`} className="btn btn-primary w-full">Open the full comparison <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          ) : <p className="mt-6 text-sm text-grey-600">Pick two different cities.</p>}
        </div>
      </div>
    </section>
  );
}
