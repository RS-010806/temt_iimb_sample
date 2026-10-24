"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  { path: "/app/calculate/", target: "method-picker", title: "Start with the method", body: "Distance-based uses cargo weight, distance and a default emission factor. Fuel-based uses the fuel or electricity actually used, which ISO 14083 counts as primary data, and skips the distance fields. Then pick road, courier, rail, air, sea or inland waterway." },
  { path: "/app/calculate/", target: "route", title: "Pick places, then choose the distance", body: "Search cities, PIN codes, railway stations, airports and ports, and TEMT calculates the distance (rail along the Indian Railways network). Or choose Enter manually to use the kilometres from your own records." },
  { path: "/app/calculate/", target: "result", title: "Live results you can explain", body: "The answer updates as you type: emissions split into tank-to-wheel and well-to-tank, the emission factor applied, intensity per ton, GHG scope and data quality, with every calculation step shown." },
  { path: "/app/compare/", target: "compare-form", title: "Compare modes door to door", body: "Road, rail with drayage, air via the nearest airports and coastal shipping via the nearest ports, ranked by emissions." },
  { path: "/app/chain/", target: "chain-canvas", title: "Shipments with several stops", body: "Add a stop wherever the cargo changes vehicle or mode: press + on any leg, up to 12 legs. Each leg has its own mode and distance, and handling at the stops counts too, as ISO 14083 requires." },
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
  // The card's rendered height, so it is always placed where all of it, including the buttons, is on screen.
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(240);
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

  useLayoutEffect(() => {
    const height = card.current?.offsetHeight;
    if (height && Math.abs(height - cardH) > 1) setCardH(height);
  });

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
  const gap = 14, edge = 16;
  const clampTop = (top: number) => Math.max(edge, Math.min(top, vh - cardH - edge));
  let cardStyle: React.CSSProperties = { left: (vw - cardW) / 2, top: clampTop((vh - cardH) / 2), width: cardW };
  if (hole) {
    // Below the target, else above, else beside it, else over its lower edge: never partly off screen.
    const left = Math.min(Math.max(edge, hole.x), vw - cardW - edge);
    const below = hole.y + hole.h + gap, above = hole.y - gap - cardH;
    const right = hole.x + hole.w + gap, beside = hole.x - gap - cardW;
    if (below + cardH <= vh - edge) cardStyle = { left, top: below, width: cardW };
    else if (above >= edge) cardStyle = { left, top: above, width: cardW };
    else if (right + cardW <= vw - edge) cardStyle = { left: right, top: clampTop(hole.y), width: cardW };
    else if (beside >= edge) cardStyle = { left: beside, top: clampTop(hole.y), width: cardW };
    else cardStyle = { left, top: clampTop(vh - cardH - edge), width: cardW };
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
      <div ref={card} className="absolute max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl animate-rise" style={cardStyle} key={index}>
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
