const cache = new Map<string, Intl.NumberFormat>();
function formatter(min: number, max: number) {
  const key = `${min}:${max}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.NumberFormat("en-IN", { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, value);
  }
  return value;
}

/** Indian digit grouping (1,23,456). */
export function fmt(value: number, digits = 0, minDigits = 0) {
  if (!Number.isFinite(value)) return "–";
  return formatter(Math.min(minDigits, digits), digits).format(value);
}

/** Emissions with an automatic unit: kg below one tonne, tonnes above. */
export function emissions(kg: number, opts: { unit?: "auto" | "kg" | "t"; digits?: number } = {}) {
  const unit = opts.unit ?? "auto";
  if (unit === "kg" || (unit === "auto" && Math.abs(kg) < 1000)) return { value: fmt(kg, opts.digits ?? (Math.abs(kg) < 10 ? 2 : 1)), unit: "kg CO₂e" };
  const t = kg / 1000;
  return { value: fmt(t, opts.digits ?? (Math.abs(t) < 100 ? 2 : 1)), unit: "t CO₂e" };
}

export function emissionsText(kg: number, opts?: { unit?: "auto" | "kg" | "t"; digits?: number }) {
  const { value, unit } = emissions(kg, opts);
  return `${value} ${unit}`;
}

export function compact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${fmt(value / 1e7, 2)} cr`;
  if (abs >= 1e5) return `${fmt(value / 1e5, 2)} lakh`;
  if (abs >= 1e3) return `${fmt(value / 1e3, 1)}k`;
  return fmt(value, abs < 10 ? 2 : 0);
}

export function pct(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "–";
  return `${fmt(value, digits)}%`;
}

export function formatDate(iso: string, style: "short" | "long" = "short") {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", style === "long" ? { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function monthLabel(key: string) {
  const date = new Date(`${key}-01T12:00:00Z`);
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Indian financial year label for a date, e.g. 2025-06-01 → "FY 2025–26". */
export function fiscalYear(iso: string) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `FY ${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fiscalYearStart(label: string) {
  return Number(label.slice(3, 7));
}

export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function uid(prefix = "") {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}${random}`;
}

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${fmt(count)} ${count === 1 ? one : many}`;
}
