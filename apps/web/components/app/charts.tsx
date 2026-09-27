"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { emissionsText, fmt, monthLabel, pct } from "@/lib/format";
import { cx } from "../ui";

export interface BarItem {
  key: string;
  label: string;
  value: number;
  color: string;
  detail?: ReactNode;
  share?: number;
}

/** Horizontal bars with direct labels. Values are kg CO2e unless formatValue says otherwise. */
export function BarList({ items, formatValue = (value) => emissionsText(value), max, emptyText = "No data yet", showShare = true }: { items: BarItem[]; formatValue?: (value: number) => string; max?: number; emptyText?: string; showShare?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = max ?? Math.max(...items.map((item) => item.value), 0);
  if (!items.length || top <= 0) return <p className="py-6 text-center text-sm text-grey-500">{emptyText}</p>;
  return (
    <ul className="grid gap-3.5" role="list">
      {items.map((item, index) => (
        <li key={item.key} className="group relative" onMouseEnter={() => setHover(item.key)} onMouseLeave={() => setHover(null)}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-grey-800"><span className="dot" style={{ background: item.color }} aria-hidden="true" /><span className="truncate">{item.label}</span></span>
            <span className="num shrink-0 text-grey-700"><span className="font-semibold text-ink">{formatValue(item.value)}</span>{showShare && item.share !== undefined && <span className="ml-2 text-grey-500">{pct(item.share, 0)}</span>}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(1.5, (item.value / top) * 100)}%`, background: item.color, transitionDelay: `${index * 60}ms` }} />
          </div>
          {hover === item.key && item.detail && (
            <div role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-stone-200 bg-white p-3 text-xs text-grey-700 shadow-[var(--shadow-float)] animate-fade">{item.detail}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Well-to-wheel split: vehicle operation (TTW), energy provision (WTT) and hubs. */
export function StageBar({ ttw, wtt, hub, compact = false }: { ttw: number; wtt: number; hub: number; compact?: boolean }) {
  const total = ttw + wtt + hub;
  if (total <= 0) return null;
  const parts = [
    { key: "ttw", label: "Tank-to-wheel", hint: "Fuel burned in the vehicle", value: ttw, color: "var(--stage-ttw)" },
    { key: "wtt", label: "Well-to-tank", hint: "Producing and delivering the energy", value: wtt, color: "var(--stage-wtt)" },
    { key: "hub", label: "Hubs and terminals", hint: "Transshipment, storage and terminal handling", value: hub, color: "var(--stage-hub)" },
  ].filter((part) => part.value > 0);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((part) => `${part.label} ${pct((part.value / total) * 100)}`).join(", ")}>
        {parts.map((part) => <div key={part.key} className="h-full transition-[flex-grow] duration-700" style={{ flexGrow: part.value, background: part.color }} title={`${part.label}: ${emissionsText(part.value)}`} />)}
      </div>
      {!compact && (
        <ul className="mt-3 grid gap-1.5 text-[13px]">
          {parts.map((part) => (
            <li key={part.key} className="flex items-center justify-between gap-3" title={part.hint}>
              <span className="flex min-w-0 items-center gap-2"><span className="dot" style={{ background: part.color }} aria-hidden="true" /><span className="truncate font-semibold">{part.label}</span></span>
              <span className="num shrink-0 text-grey-700">{emissionsText(part.value)} <span className="text-grey-500">{pct((part.value / total) * 100, 0)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label, unit = "t CO₂e", labelFormat }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; unit?: string; labelFormat?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-[var(--shadow-float)]">
      <p className="mb-1.5 font-bold text-ink">{labelFormat && label ? labelFormat(label) : label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center justify-between gap-6"><span className="flex items-center gap-2"><span className="dot" style={{ background: item.color }} />{item.name}</span><span className="num font-semibold">{fmt(item.value, 2)} {unit}</span></p>
      ))}
      {payload.length > 1 && <p className="mt-1.5 flex justify-between border-t border-stone-200 pt-1.5 font-bold"><span>Total</span><span className="num">{fmt(total, 2)} {unit}</span></p>}
    </div>
  );
}

export function MonthlyChart({ data, height = 260, target }: { data: { key: string; ttwKg: number; wttKg: number; wtwKg: number }[]; height?: number; target?: number }) {
  const rows = data.map((item) => ({ month: item.key, ttw: item.ttwKg / 1000, wtt: item.wttKg / 1000, hub: Math.max(0, item.wtwKg - item.ttwKg - item.wttKg) / 1000 }));
  const hasHub = rows.some((row) => row.hub > 0);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={(value: string) => monthLabel(value).split(" ")[0]!} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => fmt(value, value < 10 ? 1 : 0)} width={48} />
          <Tooltip cursor={{ fill: "rgb(177 35 34 / .06)" }} content={<ChartTooltip labelFormat={monthLabel} />} />
          {target !== undefined && <ReferenceLine y={target / 1000} stroke="var(--color-grey-600)" strokeDasharray="4 4" label={{ value: "Monthly budget to target", position: "insideTopRight", fontSize: 11, fill: "var(--color-grey-600)" }} />}
          <Bar dataKey="ttw" name="Tank-to-wheel" stackId="s" fill="var(--stage-ttw)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="wtt" name="Well-to-tank" stackId="s" fill="var(--stage-wtt)" radius={hasHub ? [0, 0, 0, 0] : [4, 4, 0, 0]} />
          {hasHub && <Bar dataKey="hub" name="Hubs" stackId="s" fill="var(--stage-hub)" radius={[4, 4, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IntensityLine({ data, height = 200 }: { data: { key: string; value: number }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="key" tickFormatter={(value: string) => monthLabel(value).split(" ")[0]!} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<ChartTooltip unit="g CO₂e/t-km" labelFormat={monthLabel} />} />
          <Line type="monotone" dataKey="value" name="Intensity" stroke="var(--color-maroon-600)" strokeWidth={2} dot={{ r: 3, fill: "white", stroke: "var(--color-maroon-600)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface WaterfallStep { label: string; value: number; kind: "total" | "delta" | "result" }

/** Emissions bridge from a baseline through each lever to the result (t CO2e). */
export function Waterfall({ steps, height = 300, target }: { steps: WaterfallStep[]; height?: number; target?: number }) {
  let running = 0;
  const rows = steps.map((step) => {
    if (step.kind === "delta") {
      const start = running;
      running += step.value;
      return { label: step.label, base: Math.min(start, running), size: Math.abs(step.value), color: step.value <= 0 ? "#1f7a45" : "var(--color-maroon-600)", raw: step.value };
    }
    running = step.value;
    return { label: step.label, base: 0, size: step.value, color: step.kind === "total" ? "var(--color-grey-600)" : "var(--color-maroon-800)", raw: step.value };
  });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value: number) => fmt(value, 0)} />
          <Tooltip cursor={{ fill: "rgb(177 35 34 / .06)" }} content={({ active, payload }) => {
            const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
            if (!active || !row) return null;
            return <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-[var(--shadow-float)]"><p className="font-bold">{row.label}</p><p className="num mt-1">{row.raw > 0 && steps.find((s) => s.label === row.label)?.kind === "delta" ? "+" : ""}{fmt(row.raw, 1)} t CO₂e</p></div>;
          }} />
          {target !== undefined && <ReferenceLine y={target} stroke="var(--color-ok)" strokeDasharray="5 4" label={{ value: "Target", position: "insideTopRight", fontSize: 11, fill: "var(--color-ok)" }} />}
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="size" stackId="w" radius={[4, 4, 0, 0]}>
            {rows.map((row) => <Cell key={row.label} fill={row.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / range) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cx("h-8 w-full", className)} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
