"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

// ─── Field primitives ──────────────────────────────────────────────────────

export function Field({ label, hint, error, children, htmlFor, info }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; info?: ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>{label}{info && <InfoTip>{info}</InfoTip>}</label>
      {children}
      {error ? <p className="error-text" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function NumberInput({ value, onChange, suffix, min = 0, step = "any", id, placeholder, invalid, ariaLabel, dataTour }: { value: number | undefined; onChange: (value: number | undefined) => void; suffix?: string; min?: number; step?: number | "any"; id?: string; placeholder?: string; invalid?: boolean; ariaLabel?: string; dataTour?: string }) {
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? "" : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value === undefined || Number.isNaN(value) ? "" : String(value)); }
  }, [value]);
  return (
    <div className="input-affix" data-tour={dataTour}>
      <input id={id} className="input num" inputMode="decimal" type="number" min={min} step={step} value={text} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={invalid || undefined}
        onChange={(event) => { setText(event.target.value); const parsed = event.target.value === "" ? undefined : Number(event.target.value); last.current = parsed; onChange(parsed === undefined || Number.isFinite(parsed) ? parsed : undefined); }} />
      {suffix && <span>{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, id, ariaLabel, className }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; disabled?: boolean }[]; id?: string; ariaLabel?: string; className?: string }) {
  return (
    <select id={id} className={cx("select", className)} value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = "md" }: { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[]; ariaLabel: string; size?: "sm" | "md" }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button key={option.value} type="button" title={option.title} aria-pressed={option.value === value} onClick={() => onChange(option.value)} style={size === "sm" ? { padding: "4px 9px", fontSize: 12 } : undefined}>
          {option.icon}{option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-stone-300 transition peer-checked:bg-maroon-600 peer-focus-visible:ring-2 peer-focus-visible:ring-maroon-300" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span className="grid gap-0.5"><span className="text-sm font-semibold">{label}</span>{description && <span className="hint">{description}</span>}</span>
    </label>
  );
}

// ─── Info tooltip ──────────────────────────────────────────────────────────

export function InfoTip({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((value) => !value)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-grey-500 hover:text-maroon-600">
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg border border-stone-200 bg-white p-3 text-xs font-normal leading-relaxed text-grey-700 shadow-[var(--shadow-float)] animate-fade">
          {children}
        </span>
      )}
    </span>
  );
}

// ─── Animated number ───────────────────────────────────────────────────────

export function AnimatedNumber({ value, format, duration = 700 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || initial === value) { setDisplay(value); from.current = value; return; }
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(initial + (value - initial) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value, duration]);
  return <span className="num">{format(display)}</span>;
}

// ─── Overlays ──────────────────────────────────────────────────────────────

function useEscape(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handle = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose, active]);
}

export function Drawer({ open, onClose, title, subtitle, children, width = 560, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEscape(onClose, open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-maroon-950/30 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl" style={{ maxWidth: width, animation: "drawer-in .32s cubic-bezier(.2,.7,.2,1) both" }}>
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-5">
          <div className="min-w-0"><h2 className="text-lg font-bold leading-snug">{title}</h2>{subtitle && <p className="mt-1 text-sm text-grey-600">{subtitle}</p>}</div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-stone-200 px-6 py-4">{footer}</footer>}
      </aside>
      <style>{`@keyframes drawer-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose, open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-maroon-950/35 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative w-full rounded-2xl bg-white shadow-2xl animate-rise" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between gap-4 px-6 pt-5"><h2 className="text-lg font-bold">{title}</h2><button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
        <div className="px-6 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-stone-200 px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ─── Toasts ────────────────────────────────────────────────────────────────

type Toast = { id: number; tone: "ok" | "info" | "warn"; message: ReactNode; action?: { label: string; onClick: () => void } };
const ToastContext = createContext<(toast: Omit<Toast, "id">) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), toast.action ? 7000 : 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] grid w-[min(92vw,440px)] -translate-x-1/2 gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-maroon-950 px-4 py-3 text-sm text-white shadow-2xl animate-rise">
            {toast.tone === "ok" ? <CheckCircle2 size={18} className="text-emerald-300" aria-hidden="true" /> : toast.tone === "warn" ? <TriangleAlert size={18} className="text-amber-300" aria-hidden="true" /> : <Info size={18} className="text-sky-300" aria-hidden="true" />}
            <span className="flex-1">{toast.message}</span>
            {toast.action && <button type="button" className="rounded-md px-2 py-1 text-sm font-bold text-maroon-200 hover:bg-white/10" onClick={() => { toast.action!.onClick(); setToasts((list) => list.filter((item) => item.id !== toast.id)); }}>{toast.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────────────

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[30px] md:text-[36px] text-ink">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-grey-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, actions }: { icon: ReactNode; title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card card-pad grid place-items-center gap-3 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-maroon-50 text-maroon-600">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-grey-600">{body}</p>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiTile({ label, value, unit, sub, icon, accent = false, dataTour }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; icon?: ReactNode; accent?: boolean; dataTour?: string }) {
  return (
    <div data-tour={dataTour} className={cx("relative overflow-hidden rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)] animate-rise", accent ? "border-maroon-800 bg-gradient-to-br from-maroon-800 via-maroon-700 to-maroon-900 text-white" : "border-stone-200 bg-white")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cx("text-[13px] font-semibold", accent ? "text-maroon-100" : "text-grey-600")}>{label}</p>
        {icon && <span className={cx("grid h-8 w-8 place-items-center rounded-lg", accent ? "bg-white/10 text-white" : "bg-maroon-50 text-maroon-600")}>{icon}</span>}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5"><span className="text-[30px] font-bold leading-none tracking-tight">{value}</span>{unit && <span className={cx("text-sm font-semibold", accent ? "text-maroon-100" : "text-grey-600")}>{unit}</span>}</p>
      {sub && <p className={cx("mt-2 text-xs", accent ? "text-maroon-100" : "text-grey-600")}>{sub}</p>}
      {accent && <svg className="pointer-events-none absolute -right-6 -bottom-8 h-32 w-32 text-white/[0.06]" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="14" /></svg>}
    </div>
  );
}

export function useInView<T extends Element>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, threshold]);
  return [ref, visible] as const;
}

export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "article" | "li" }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  return <Tag ref={ref as never} className={cx("reveal", visible && "is-visible", className)} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}
