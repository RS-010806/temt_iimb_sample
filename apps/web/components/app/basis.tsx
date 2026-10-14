"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { MODE_LABELS, SOURCES, type DistanceMethod, type LegResult, type ShipmentResult } from "@temt/calculator";
import { emissionsText, fmt } from "@/lib/format";
import { adjustmentName } from "@/lib/adjustments";
import type { LegMeta } from "@/lib/records";
import { cx } from "../ui";

/**
 * What ISO 14083 asks a report to disclose for each transport chain element (activity, distance type, emission
 * factor, factor source, data type), with the arithmetic that turns the inputs into the result.
 */
export const DISTANCE_LABELS: Record<DistanceMethod, string> = {
  user: "Actual distance, entered by the user",
  "road-estimate": "Shortest feasible road distance, estimated from the locations",
  "rail-estimate": "Shortest feasible rail distance, estimated from the locations",
  "rail-network": "Shortest route on the Indian Railways network, station to station",
  "iww-estimate": "Shortest feasible waterway distance, estimated from the locations",
  "great-circle": "Great-circle distance between the airports",
  "air-gcd-95": "Great-circle distance between the airports",
  "sea-route": "Port-to-port sea route over shipping lanes",
};
const METHOD = { distance: "Distance-based: cargo weight × distance × emission factor", fuel: "Fuel-based: fuel used × fuel emission factor", energy: "Energy-based: electricity used × electricity emission factor" } as const;
const QUALITY = { primary: "Primary data (measured)", modelled: "Modelled data", default: "Default emission factors" } as const;
const GLEC = SOURCES["glec-3.2"];

function distanceBasis(leg: LegResult, meta?: LegMeta) {
  if (meta?.distanceMethod) return DISTANCE_LABELS[meta.distanceMethod];
  return leg.mode === "air" ? DISTANCE_LABELS["great-circle"] : leg.mode === "sea" ? DISTANCE_LABELS["sea-route"] : "Shortest feasible distance";
}

/** The factor source with its publisher and year, and the GLEC Framework version the method follows. */
export function factorSource(leg: LegResult) {
  const source = SOURCES[leg.factor.source];
  const own = `${source.title} (${source.publisher}, ${source.year}) · ${leg.factor.ref}`;
  return leg.factor.source === "glec-3.2" ? own : `${own}. Reference framework: GLEC Framework v3.2 (${GLEC.publisher}, ${GLEC.year})`;
}

/** Plain steps from the inputs to the result. */
function steps(leg: LegResult, meta?: LegMeta): [string, string][] {
  const out: [string, string][] = [];
  const split = `tank-to-wheel ${emissionsText(leg.ttwKg)} + well-to-tank ${emissionsText(leg.wttKg)}`;
  if (leg.method === "distance") {
    const factorG = (leg.factor.wtt + leg.factor.ttw) * 1000;
    out.push(["Distance", `${fmt(leg.distanceKm, 0)} km · ${distanceBasis(leg, meta)}`]);
    out.push(["Transport activity", `${fmt(leg.tonnes, 2)} t × ${fmt(leg.distanceKm, 0)} km = ${fmt(leg.tonneKm, 0)} t-km`]);
    out.push(["Emission factor", `${fmt(factorG, 1)} g CO₂e per t-km, well-to-wheel (${leg.factor.label})`]);
    for (const uplift of leg.uplifts) out.push(["Adjustment", `${adjustmentName(uplift.label)} × ${fmt(uplift.multiplier, 2)}`]);
    out.push(["Emissions", `${fmt(leg.tonneKm, 0)} t-km × ${fmt(leg.intensityG, 1)} g = ${emissionsText(leg.wtwKg)} (${split})`]);
    return out;
  }
  const measured = leg.trace.find((line) => /^(Fuel|Measured electricity|Estimated electricity):/.test(line));
  if (measured) out.push([leg.method === "fuel" ? "Fuel used" : "Electricity", measured.replace(/^[^:]+:\s*/, "")]);
  const share = leg.trace.find((line) => line.startsWith("Allocated to this cargo"));
  if (share) out.push(["Share for this cargo", share.replace(/^Allocated to this cargo:\s*/, "")]);
  out.push(["Emission factor", `${fmt(leg.factor.wtt + leg.factor.ttw, 3)} ${leg.factor.unit}, well-to-wheel (${leg.factor.label})`]);
  out.push(["Emissions", `${emissionsText(leg.wtwKg)} (${split})`]);
  if (leg.tonneKm > 0) out.push(["For reference", `${fmt(leg.tonneKm, 0)} t-km moved, so ${fmt(leg.intensityG, 1)} g CO₂e per t-km`]);
  return out;
}

function LegBasis({ leg, index, total, meta }: { leg: LegResult; index: number; total: number; meta?: LegMeta }) {
  const facts: [string, string][] = [
    ["Method", METHOD[leg.method]],
    ["Factor source", factorSource(leg)],
    ["Data type", QUALITY[leg.dataQuality]],
  ];
  return (
    <li className="grid gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-semibold text-ink">{total > 1 ? `Leg ${index + 1} · ${MODE_LABELS[leg.mode]} · ` : ""}{leg.factor.label}</p>
        {total > 1 && <p className="num shrink-0 font-semibold">{emissionsText(leg.wtwKg)}</p>}
      </div>
      <ol className="grid gap-1.5">
        {steps(leg, meta).map(([label, value], i) => (
          <li key={i} className="grid grid-cols-[1.25rem_minmax(0,7.5rem)_minmax(0,1fr)] gap-x-2">
            <span className="num grid h-5 w-5 place-items-center rounded-full bg-white text-[10.5px] font-bold text-maroon-700 ring-1 ring-stone-200">{i + 1}</span>
            <span className="text-grey-500">{label}</span><span className="min-w-0 text-grey-800">{value}</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-dashed border-stone-200 pt-2">
        {facts.map(([label, value]) => <div key={label} className="contents"><dt className="text-grey-500">{label}</dt><dd className="min-w-0 text-grey-800">{value}</dd></div>)}
      </dl>
      {leg.warnings.map((warning, i) => <p key={i} className="text-warn">{warning}</p>)}
    </li>
  );
}

// Remember whether the panel was open, so it stays open while the result recalculates as you type.
let remembered = false;

/** Collapsible calculation basis for one shipment result. */
export function CalculationBasis({ result, legMeta, className, size = "md", defaultOpen }: { result: ShipmentResult; legMeta?: LegMeta[]; className?: string; size?: "sm" | "md"; defaultOpen?: boolean }) {
  const [open, setOpenState] = useState(defaultOpen ?? remembered);
  const setOpen = (value: boolean) => { remembered = value; setOpenState(value); };
  return (
    <div className={className}>
      <button type="button" className={cx("flex items-center gap-1.5 font-semibold text-maroon-700", size === "sm" ? "text-xs" : "text-[13px]")} onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={size === "sm" ? 14 : 15} className={cx("transition", open && "rotate-180")} aria-hidden="true" /> How this was calculated
      </button>
      {open && <BasisBody result={result} legMeta={legMeta} size={size} />}
    </div>
  );
}

export function BasisBody({ result, legMeta, size = "md" }: { result: ShipmentResult; legMeta?: LegMeta[]; size?: "sm" | "md" }) {
  return (
    <div className={cx("mt-3 grid gap-3 rounded-lg bg-stone-50 p-3.5 leading-relaxed text-grey-700 animate-fade", size === "sm" ? "text-[12px]" : "text-[12.5px]")}>
      <ol className="grid gap-4">
        {result.legs.map((leg, i) => <LegBasis key={i} leg={leg} index={i} total={result.legs.length} meta={legMeta?.[i]} />)}
      </ol>
      {result.hubs.length > 0 && (
        <div className="grid gap-1 border-t border-stone-200 pt-3">
          <p className="font-semibold text-ink">Hub operations</p>
          {result.hubs.map((hub, i) => <p key={i} className="flex justify-between gap-3"><span className="min-w-0">{hub.label} · {SOURCES[hub.source].publisher} default</span><span className="num shrink-0">{emissionsText(hub.wtwKg)}</span></p>)}
        </div>
      )}
      <p className="flex gap-2 border-t border-stone-200 pt-3 text-grey-600">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-maroon-700" aria-hidden="true" />
        <span>Quantified to ISO 14083:2023 following the GLEC Framework v3.2, with TEMT's India-specific emission factors. See the <Link href="/methodology/" className="font-semibold text-maroon-700 underline">methodology</Link>.</span>
      </p>
    </div>
  );
}
