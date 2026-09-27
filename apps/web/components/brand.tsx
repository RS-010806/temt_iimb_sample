import { cx } from "./ui";

/** TEMT mark: a transport route between two nodes inside a roundel, drawn in IIMB crimson. */
export function BrandMark({ size = 34, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const ring = tone === "light" ? "#ffffff" : "#b12322";
  const fill = tone === "light" ? "rgba(255,255,255,0.08)" : "#fcf3f2";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill={fill} stroke={ring} strokeWidth="1.5" />
      <path d="M10 27c5-1 6.5-6 10-8.5s8-1.5 10-7.5" fill="none" stroke={tone === "light" ? "#efc4c0" : "#740000"} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 4.2" />
      <circle cx="10" cy="27" r="3" fill={ring} />
      <circle cx="30" cy="11" r="3" fill={tone === "light" ? "#e39a55" : "#b12322"} />
    </svg>
  );
}

export function Brand({ tone = "dark", compact = false }: { tone?: "dark" | "light"; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark tone={tone} />
      <span className="grid leading-none">
        <span className={cx("font-[family-name:var(--font-display)] text-[25px] font-bold tracking-tight", tone === "light" ? "text-white" : "text-maroon-800")}>TEMT</span>
        {!compact && <span className={cx("mt-1 text-[10px] font-bold uppercase tracking-[0.16em]", tone === "light" ? "text-maroon-200" : "text-grey-600")}>IIM Bangalore</span>}
      </span>
    </span>
  );
}
