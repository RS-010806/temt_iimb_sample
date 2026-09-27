"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Anchor, Building2, Hash, MapPin, Plane, X } from "lucide-react";
import { searchPlaces, type Place, type PlaceKind } from "@/lib/places";
import { cx } from "../ui";

const ICONS: Record<PlaceKind, typeof MapPin> = { city: Building2, pin: Hash, airport: Plane, port: Anchor, custom: MapPin };
const KIND_LABEL: Record<PlaceKind, string> = { city: "City", pin: "PIN code", airport: "Airport", port: "Port", custom: "Custom" };

export function PlaceInput({ value, onChange, kinds = ["city", "pin"], placeholder = "City or PIN code", id, ariaLabel, dataTour }: { value?: Place; onChange: (place: Place | undefined) => void; kinds?: PlaceKind[]; placeholder?: string; id?: string; ariaLabel?: string; dataTour?: string }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const kindsKey = kinds.join(",");

  useEffect(() => { setQuery(value?.label ?? ""); }, [value?.label]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q || q === value?.label) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(q, kindsKey.split(",") as PlaceKind[], 8).then((found) => { if (!cancelled) { setResults(found); setCursor(0); } }).catch(() => { if (!cancelled) setResults([]); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, open, kindsKey, value?.label]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const options: Place[] = [...results, ...(query.trim() && !results.some((item) => item.label.toLowerCase() === query.trim().toLowerCase()) && query.trim() !== value?.label ? [{ label: query.trim(), kind: "custom" as const }] : [])];
  const choose = (place: Place) => { onChange(place); setQuery(place.label); setOpen(false); };
  const Icon = value ? ICONS[value.kind] : MapPin;

  return (
    <div ref={wrapper} className="relative" data-tour={dataTour}>
      <div className="relative">
        <Icon size={16} className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", value ? "text-maroon-600" : "text-grey-400")} aria-hidden="true" />
        <input id={id} className="input pl-9 pr-9" role="combobox" aria-expanded={open && options.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label={ariaLabel}
          placeholder={placeholder} value={query} autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onChange(undefined); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setCursor((c) => Math.min(c + 1, options.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (event.key === "Enter" && open && options[cursor]) { event.preventDefault(); choose(options[cursor]!); }
            if (event.key === "Escape") setOpen(false);
          }} />
        {query && <button type="button" aria-label="Clear location" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-grey-400 hover:bg-stone-100 hover:text-grey-700" onClick={() => { setQuery(""); onChange(undefined); setOpen(true); }}><X size={14} /></button>}
      </div>
      {open && (options.length > 0 || loading) && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-stone-200 bg-white p-1 shadow-[var(--shadow-float)] animate-fade scroll-thin">
          {loading && !results.length && <li className="px-3 py-2 text-sm text-grey-500">Searching…</li>}
          {options.map((place, index) => {
            const ItemIcon = ICONS[place.kind];
            return (
              <li key={`${place.kind}-${place.label}-${index}`} role="option" aria-selected={index === cursor}
                className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", index === cursor ? "bg-maroon-50" : "hover:bg-stone-50")}
                onMouseEnter={() => setCursor(index)} onMouseDown={(event) => { event.preventDefault(); choose(place); }}>
                <ItemIcon size={15} className={place.kind === "custom" ? "text-grey-400" : "text-maroon-600"} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{place.kind === "custom" ? <>Use “{place.label}” <span className="text-grey-500">(enter distance manually)</span></> : place.label}</span>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-grey-400">{place.state ?? (place.country && place.country !== "IN" ? place.country : KIND_LABEL[place.kind])}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
