"use client";

import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Anchor, Building2, Hash, MapPin, Plane, TrainFront, Waves, X } from "lucide-react";
import { TERMINAL_KINDS, loadAirports, loadCities, loadPins, loadStations, searchPlaces, stateName, type Place, type PlaceKind } from "@/lib/places";
import { FieldIdContext, cx } from "../ui";

const ICONS: Record<PlaceKind, typeof MapPin> = { city: Building2, pin: Hash, station: TrainFront, airport: Plane, port: Anchor, terminal: Waves, custom: MapPin };
const KIND_LABEL: Record<PlaceKind, string> = { city: "City or town", pin: "PIN code", station: "Railway station", airport: "Airport", port: "Port", terminal: "Waterway terminal", custom: "As typed" };
const LIST_NAME: Partial<Record<PlaceKind, string>> = { station: "railway stations", airport: "airports", port: "ports", terminal: "waterway terminals" };
const COUNTRY = new Intl.DisplayNames(["en-IN"], { type: "region" });

/** Second line of a suggestion: what kind of place it is and where. */
function describe(place: Place) {
  const where = place.country && place.country !== "IN" ? COUNTRY.of(place.country) : stateName(place.state) ?? (place.country === "IN" ? "India" : undefined);
  const city = place.kind === "terminal" ? place.city : place.city && place.city !== where ? place.city : undefined;
  return [place.detail ?? KIND_LABEL[place.kind], [city, where].filter(Boolean).join(", "), place.approximate ? "district-level location" : undefined].filter(Boolean).join(" · ");
}

/** The typed text in bold within a suggestion, as map searches show it. */
function highlight(label: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  const at = q ? label.toLowerCase().indexOf(q) : -1;
  if (at < 0) return label;
  return <>{label.slice(0, at)}<strong className="font-bold text-ink">{label.slice(at, at + q.length)}</strong>{label.slice(at + q.length)}</>;
}

export function PlaceInput({ value, onChange, kinds = ["city", "pin"], placeholder = "City or PIN code", id: ownId, ariaLabel, dataTour }: { value?: Place; onChange: (place: Place | undefined) => void; kinds?: PlaceKind[]; placeholder?: string; id?: string; ariaLabel?: string; dataTour?: string }) {
  const contextId = useContext(FieldIdContext);
  const id = ownId ?? contextId;
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  // The text the current results were found for, so "use as typed" never shows for stale or pending results.
  const [resultsFor, setResultsFor] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const kindsKey = kinds.join(",");

  const inputRef = useRef<HTMLInputElement>(null);
  // Enter pressed while a search is still running: pick the first result as soon as it arrives.
  const pendingEnter = useRef(false);

  // Warm the location indexes in idle time so the first search is instant, even on slow connections.
  useEffect(() => {
    const warm = () => {
      const list = kindsKey.split(",");
      if (list.includes("city")) void loadCities().catch(() => undefined);
      if (list.includes("pin")) void loadPins().catch(() => undefined);
      if (list.includes("station")) void loadStations().catch(() => undefined);
      if (list.includes("airport")) void loadAirports().catch(() => undefined);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(warm); else setTimeout(warm, 400);
  }, [kindsKey]);
  // Follow the value when it is set or cleared from outside; never wipe text the user is typing.
  useEffect(() => {
    if (value) setQuery(value.label);
    else if (document.activeElement !== inputRef.current) setQuery("");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q || q === value?.label) { setResults([]); setResultsFor(q); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(q, kindsKey.split(",") as PlaceKind[], 5).then((found) => {
        if (cancelled) return;
        setResults(found);
        setResultsFor(q);
        setCursor(0);
        if (pendingEnter.current) { pendingEnter.current = false; choose(found[0] ?? { label: q, kind: "custom" }); }
      }).catch(() => { if (!cancelled) { setResults([]); setResultsFor(q); } }).finally(() => { if (!cancelled) setLoading(false); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, open, kindsKey, value?.label]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const typed = query.trim();
  // Airports, ports, stations and terminals come from TEMT's lists; free text is offered only when nothing matches.
  const listOnly = kinds.every((kind) => TERMINAL_KINDS.includes(kind));
  // While a search for new text is pending, earlier results are hidden rather than shown as if they matched.
  const pending = !!typed && typed !== value?.label && (loading || resultsFor !== typed);
  const current = pending ? [] : results;
  const offerTyped = typed && !pending && typed !== value?.label && (listOnly ? current.length === 0 : !current.some((item) => item.label.toLowerCase() === typed.toLowerCase()));
  const options: Place[] = [...current, ...(offerTyped ? [{ label: typed, kind: "custom" as const }] : [])];
  const listName = kinds.map((kind) => LIST_NAME[kind]).filter(Boolean).join(" or ");
  const choose = (place: Place) => { onChange(place); setQuery(place.label); setOpen(false); };
  const Icon = value ? ICONS[value.kind] : MapPin;

  return (
    <div ref={wrapper} className="relative" data-tour={dataTour}>
      <div className="relative">
        <Icon size={16} className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", value ? "text-maroon-600" : "text-grey-400")} aria-hidden="true" />
        <input ref={inputRef} id={id} className="input pl-9 pr-9" role="combobox" aria-expanded={open && options.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label={ariaLabel}
          aria-activedescendant={open && options[cursor] ? `${listId}-${cursor}` : undefined}
          placeholder={placeholder} value={query} autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); pendingEnter.current = false; if (value) onChange(undefined); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setCursor((c) => Math.min(c + 1, options.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (event.key === "Enter" && open && pending) { event.preventDefault(); pendingEnter.current = true; return; }
            if (event.key === "Enter" && open && options[cursor]) { event.preventDefault(); choose(options[cursor]!); }
            if (event.key === "Escape") setOpen(false);
          }} />
        {query && <button type="button" aria-label="Clear location" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-grey-400 hover:bg-stone-100 hover:text-grey-700" onClick={() => { setQuery(""); onChange(undefined); setOpen(true); inputRef.current?.focus(); }}><X size={14} /></button>}
      </div>
      {open && (options.length > 0 || pending) && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-[var(--shadow-float)] animate-fade">
          {pending && <li className="px-3 py-2.5 text-sm text-grey-500">Searching…</li>}
          {options.map((place, index) => {
            const ItemIcon = ICONS[place.kind];
            return (
              <li key={`${place.kind}-${place.label}-${index}`} id={`${listId}-${index}`} role="option" aria-selected={index === cursor}
                className={cx("flex cursor-pointer items-center gap-3 px-3 py-2", index === cursor ? "bg-maroon-50" : "hover:bg-stone-50", place.kind === "custom" && "border-t border-stone-100")}
                onMouseEnter={() => setCursor(index)} onMouseDown={(event) => { event.preventDefault(); choose(place); }}>
                <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", place.kind === "custom" ? "bg-stone-100 text-grey-500" : "bg-maroon-50 text-maroon-600")}><ItemIcon size={15} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-grey-800">{place.kind === "custom" ? <>Use “{place.label}” as typed</> : highlight(place.label, typed)}</span>
                  <span className="block truncate text-[12px] text-grey-500">{place.kind === "custom" ? (listOnly ? `Not in TEMT's list of ${listName}: you will enter the distance yourself` : "Not on the map: you will enter the distance yourself") : describe(place)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
