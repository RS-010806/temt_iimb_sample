"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cx } from "../ui";

interface Step {
  path: string;
  target?: string;
  title: string;
  body: string;
}

export const TOUR: Step[] = [
  { path: "/app/", target: "kpi-total", title: "Your footprint at a glance", body: "Total well-to-wheel emissions for the selected financial year, with the change from last year. Every number in TEMT traces back to a published factor and its source." },
  { path: "/app/", target: "monthly", title: "Month by month", body: "Tank-to-wheel (fuel burned in vehicles) and well-to-tank (producing that fuel or electricity), stacked per month. Hover any bar for exact values." },
  { path: "/app/", target: "mode-breakdown", title: "Where emissions come from", body: "Breakdowns by mode, business unit, lane and GHG Protocol scope, the split BRSR disclosures need." },
  { path: "/app/", target: "insights", title: "Insights and opportunities", body: "TEMT recalculates alternatives with the same engine, for example moving long road hauls to rail, and shows how much each would save." },
  { path: "/app/calculate/", target: "mode-picker", title: "Calculate any shipment", body: "Road, courier, rail, air, sea, inland waterway or electric vehicles. Use distance, measured fuel or measured electricity, whichever data you have." },
  { path: "/app/calculate/", target: "route", title: "Type a city or PIN code", body: "Distances fill in from TEMT's Indian location data: 2,900+ cities, 19,000+ PIN codes, airports and ports. Override with the actual kilometres any time." },
  { path: "/app/calculate/", target: "result", title: "Live results you can explain", body: "The answer updates as you type, split into WTT and TTW, with intensity, GHG scope and data quality. Open the calculation basis to see the activity, factor source and data quality." },
  { path: "/app/compare/", target: "compare-form", title: "Compare modes door to door", body: "Road, rail with drayage, air via the nearest airports and coastal shipping via the nearest ports, ranked by emissions." },
  { path: "/app/chain/", target: "chain-canvas", title: "Build multimodal chains", body: "Combine legs and hubs exactly as ISO 14083 defines a transport chain. Start from a template such as rail intermodal or export via port." },
  { path: "/app/import/", target: "import-drop", title: "Bring your data in bulk", body: "Upload CSV or Excel, templates from earlier TEMT versions or e-way bill JSON. Every row is validated before anything is saved." },
  { path: "/app/shipments/", target: "ledger", title: "Your shipment ledger", body: "Search, filter, edit, duplicate or delete. Select any row to see its calculation basis." },
  { path: "/app/reports/", target: "export-panel", title: "Reports in every format", body: "PDF, Excel, Word, CSV, JSON and a Power BI pack, each stating the methodology, factor sources, data quality and BRSR mapping." },
  { path: "/app/planner/", target: "levers", title: "Plan reductions against a target", body: "Adjust levers such as rail shift, electric trucks and load factor, and watch the waterfall update against your target." },
  { path: "/app/", target: "copilot-button", title: "Ask the Copilot anything", body: "Type or speak: “20 t Pune to Delhi by 32 ft truck”, “compare modes”, “export Excel”. It runs in your browser and can restart this tour any time." },
];

const listeners = new Set<() => void>();
export function startTour() {
  listeners.forEach((listener) => listener());
}

export function Tour() {
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const step = index === null ? null : TOUR[index]!;

  useEffect(() => {
    const listener = () => setIndex(0);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const close = useCallback(() => { setIndex(null); setRect(null); }, []);
  const go = useCallback((next: number) => { if (next < 0) return; if (next >= TOUR.length) close(); else { setRect(null); setIndex(next); } }, [close]);

  useEffect(() => {
    if (!step) return;
    const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
    if (normalized !== step.path) router.push(step.path);
  }, [step, pathname, router]);

  useLayoutEffect(() => {
    if (!step?.target) return;
    let cancelled = false;
    let tries = 0;
    let element: Element | null = null;
    const measure = () => { if (element && !cancelled) { const box = element.getBoundingClientRect(); setRect(box.width > 0 && box.height > 0 ? box : null); } };
    const find = () => {
      if (cancelled) return;
      element = document.querySelector(`[data-tour="${step.target}"]`);
      const visible = element && (element as HTMLElement).offsetParent !== null;
      if (visible) { element!.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(measure, 420); }
      else if (tries++ < 40) setTimeout(find, 100);
      else setRect(null);
    };
    find();
    const update = () => measure();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelled = true; window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step, pathname]);

  useEffect(() => {
    if (index === null) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [index, close, go]);

  if (!step || index === null) return null;
  const pad = 8;
  const hole = rect ? { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(360, vw - 32);
  let cardStyle: React.CSSProperties = { left: (vw - cardW) / 2, top: vh / 2 - 110, width: cardW };
  if (hole) {
    const below = hole.y + hole.h + 14, above = hole.y - 14;
    const left = Math.min(Math.max(16, hole.x), vw - cardW - 16);
    if (below + 220 < vh) cardStyle = { left, top: below, width: cardW };
    else if (above - 220 > 0) cardStyle = { left, top: above - 220, width: cardW };
    else cardStyle = { left: Math.min(hole.x + hole.w + 16, vw - cardW - 16), top: Math.max(16, Math.min(hole.y, vh - 240)), width: cardW };
  }

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={`Guided tour, step ${index + 1} of ${TOUR.length}`}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="black" style={{ transition: "all .35s cubic-bezier(.2,.7,.2,1)" }} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(42,5,5,0.58)" mask="url(#tour-mask)" onClick={close} />
        {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="none" stroke="#efc4c0" strokeWidth="2" className="animate-pulse" />}
      </svg>
      <div className="absolute rounded-2xl bg-white p-5 shadow-2xl animate-rise" style={cardStyle} key={index}>
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Step {index + 1} of {TOUR.length}</p>
          <button type="button" onClick={close} className="-mr-1 -mt-1 rounded-md p-1 text-grey-500 hover:bg-stone-100" aria-label="End tour"><X size={16} /></button>
        </div>
        <h2 className="display mt-1.5 text-[21px] text-ink">{step.title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-grey-700">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden="true">{TOUR.map((_, i) => <span key={i} className={cx("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-maroon-600" : "w-1.5 bg-stone-300")} />)}</div>
          <div className="flex gap-2">
            {index > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(index - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => go(index + 1)} autoFocus>{index === TOUR.length - 1 ? "Finish" : "Next"} {index < TOUR.length - 1 && <ArrowRight size={14} aria-hidden="true" />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
