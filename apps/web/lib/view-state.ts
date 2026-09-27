"use client";

import { useSyncExternalStore } from "react";
import { fiscalYears } from "./analytics";
import { useComputed } from "./store";

let view = { fy: "", businessUnit: "all" };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export function setView(patch: Partial<typeof view>) {
  view = { ...view, ...patch };
  listeners.forEach((listener) => listener());
}

/** Selected financial year (defaults to the latest with data) and business unit, shared across pages. */
export function useView() {
  const current = useSyncExternalStore(subscribe, () => view, () => view);
  const rows = useComputed();
  const years = fiscalYears(rows);
  const fy = current.fy && (current.fy === "all" || years.includes(current.fy)) ? current.fy : years[0] ?? "all";
  return { fy, businessUnit: current.businessUnit, years, rows };
}
