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
 * What ISO 14083 asks a report to disclose for each transport chain element: activity, distance type,
 * emission intensity, factor source and data type. Internal modelling parameters stay in the methodology.
 */
const DISTANCE: Record<DistanceMethod, string> = {
  user: "Actual distance supplied",
  "road-estimate": "Shortest feasible road distance, estimated",
  "rail-estimate": "Shortest feasible rail distance, estimated",
  "iww-estimate": "Shortest feasible waterway distance, estimated",
  "great-circle": "Great-circle distance between airports",
  "air-gcd-95": "Great-circle distance between airports",
  "sea-route": "Port-to-port sea route, estimated",
};
const METHOD = { distance: "Distance-based (activity × default intensity)", fuel: "Fuel-based (measured fuel)", energy: "Energy-based (electricity)" } as const;
const QUALITY = { primary: "Primary data", modelled: "Modelled data", default: "Default values" } as const;

function distanceBasis(leg: LegResult, meta?: LegMeta) {
  if (meta?.distanceMethod) return DISTANCE[meta.distanceMethod];
  return leg.mode === "air" ? DISTANCE["great-circle"] : leg.mode === "sea" ? DISTANCE["sea-route"] : "Shortest feasible distance";
}

function LegBasis({ leg, index, total, meta }: { leg: LegResult; index: number; total: number; meta?: LegMeta }) {
  const rows: [string, string][] = [
    ["Activity", leg.tonneKm > 0 ? `${fmt(leg.tonneKm, 0)} t-km (${fmt(leg.tonnes, 2)} t over ${fmt(leg.distanceKm, 0)} km)` : "Measured fuel or energy"],
    ["Distance type", leg.method === "distance" || leg.distanceKm > 0 ? distanceBasis(leg, meta) : "Not needed for this method"],
    ["Method", METHOD[leg.method]],
    ["Intensity", leg.intensityG > 0 ? `${fmt(leg.intensityG, 1)} g CO₂e/t-km, well-to-wheel` : "–"],
    ["Factor source", `${SOURCES[leg.factor.source].publisher} · ${leg.factor.ref}`],
    ["Data type", QUALITY[leg.dataQuality]],
  ];
  if (leg.uplifts.length) rows.push(["Adjustments", leg.uplifts.map((uplift) => adjustmentName(uplift.label)).join(", ")]);
  return (
    <li className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-semibold text-ink">{total > 1 ? `Leg ${index + 1} · ${MODE_LABELS[leg.mode]} · ` : ""}{leg.factor.label}</p>
        {total > 1 && <p className="num shrink-0 font-semibold">{emissionsText(leg.wtwKg)}</p>}
      </div>
      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-grey-500">{label}</dt><dd className="min-w-0 text-grey-800">{value}</dd></div>)}
      </dl>
      {leg.warnings.map((warning, i) => <p key={i} className="text-warn">{warning}</p>)}
    </li>
  );
}

// Remember whether the panel was open, so it stays open while the result recalculates as you type.
let remembered = false;

/** Collapsible calculation basis for one shipment result. */
export function CalculationBasis({ result, legMeta, className, size = "md" }: { result: ShipmentResult; legMeta?: LegMeta[]; className?: string; size?: "sm" | "md" }) {
  const [open, setOpenState] = useState(remembered);
  const setOpen = (value: boolean) => { remembered = value; setOpenState(value); };
  return (
    <div className={className}>
      <button type="button" className={cx("flex items-center gap-1.5 font-semibold text-maroon-700", size === "sm" ? "text-xs" : "text-[13px]")} onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={size === "sm" ? 14 : 15} className={cx("transition", open && "rotate-180")} aria-hidden="true" /> Calculation basis
      </button>
      {open && <BasisBody result={result} legMeta={legMeta} size={size} />}
    </div>
  );
}

export function BasisBody({ result, legMeta, size = "md" }: { result: ShipmentResult; legMeta?: LegMeta[]; size?: "sm" | "md" }) {
  return (
    <div className={cx("mt-3 grid gap-3 rounded-lg bg-stone-50 p-3.5 leading-relaxed text-grey-700 animate-fade", size === "sm" ? "text-[12px]" : "text-[12.5px]")}>
      <ol className="grid gap-3.5">
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
        <span>Quantified to ISO 14083:2023 with the GLEC Framework v3.2. Sources and assumptions are summarised in the <Link href="/methodology/" className="font-semibold text-maroon-700 underline">methodology</Link>.</span>
      </p>
    </div>
  );
}
