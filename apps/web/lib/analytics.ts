import { calculateLeg, ROAD_CLASSES, type DataQuality, type FactorSetId, type LegInput, type TransportMode } from "@temt/calculator";
import { fiscalYear, plural, todayIso } from "./format";
import { laneKey, MODE_ORDER, scopeOf, type ComputedShipment, type ScopeKey } from "./records";

export interface Filters {
  fy?: string;
  mode?: TransportMode | "all";
  businessUnit?: string;
  scope?: ScopeKey | "all";
  search?: string;
}

export function applyFilters(rows: ComputedShipment[], filters: Filters) {
  const query = filters.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.fy && filters.fy !== "all" && fiscalYear(row.date) !== filters.fy) return false;
    if (filters.businessUnit && filters.businessUnit !== "all" && row.businessUnit !== filters.businessUnit) return false;
    if (filters.mode && filters.mode !== "all" && !row.input.legs.some((leg) => leg.mode === filters.mode)) return false;
    if (filters.scope && filters.scope !== "all" && !row.input.legs.some((leg) => scopeOf(row, leg.method) === filters.scope)) return false;
    if (query && !`${row.ref} ${row.origin.label} ${row.destination.label} ${row.businessUnit} ${row.commodity}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

export interface Totals {
  wtwKg: number;
  ttwKg: number;
  wttKg: number;
  hubKg: number;
  tonneKm: number;
  tonnes: number;
  distanceKm: number;
  shipments: number;
  legs: number;
  errors: number;
  intensityG: number;
  kgPerTonne: number;
}

export function totals(rows: ComputedShipment[]): Totals {
  const t = { wtwKg: 0, ttwKg: 0, wttKg: 0, hubKg: 0, tonneKm: 0, tonnes: 0, distanceKm: 0, shipments: 0, legs: 0, errors: 0 };
  for (const row of rows) {
    if (!row.result) { t.errors += 1; continue; }
    t.wtwKg += row.result.wtwKg; t.ttwKg += row.result.ttwKg; t.wttKg += row.result.wttKg; t.hubKg += row.result.hubKg;
    t.tonneKm += row.result.tonneKm; t.tonnes += row.result.cargoTonnes; t.distanceKm += row.result.distanceKm;
    t.shipments += 1; t.legs += row.result.legs.length;
  }
  return { ...t, intensityG: t.tonneKm ? (t.wtwKg / t.tonneKm) * 1000 : 0, kgPerTonne: t.tonnes ? t.wtwKg / t.tonnes : 0 };
}

export interface Bucket {
  key: string;
  label: string;
  wtwKg: number;
  ttwKg: number;
  wttKg: number;
  tonneKm: number;
  count: number;
  share: number;
}

function finish(map: Map<string, Omit<Bucket, "share">>, total: number, sort: "value" | "key" = "value"): Bucket[] {
  const list = [...map.values()].map((bucket) => ({ ...bucket, share: total ? (bucket.wtwKg / total) * 100 : 0 }));
  return sort === "value" ? list.sort((a, b) => b.wtwKg - a.wtwKg) : list.sort((a, b) => a.key.localeCompare(b.key));
}

function add(map: Map<string, Omit<Bucket, "share">>, key: string, label: string, wtw: number, ttw: number, wtt: number, tkm: number, count = 1) {
  const bucket = map.get(key) ?? { key, label, wtwKg: 0, ttwKg: 0, wttKg: 0, tonneKm: 0, count: 0 };
  bucket.wtwKg += wtw; bucket.ttwKg += ttw; bucket.wttKg += wtt; bucket.tonneKm += tkm; bucket.count += count;
  map.set(key, bucket);
}

const MODE_NAMES: Record<TransportMode | "hub", string> = { road: "Road", rail: "Rail", air: "Air", sea: "Sea", iww: "Inland waterway", hub: "Hubs and terminals" };

export function byMode(rows: ComputedShipment[]): Bucket[] {
  const map = new Map<string, Omit<Bucket, "share">>();
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    for (const leg of row.result.legs) { add(map, leg.mode, MODE_NAMES[leg.mode], leg.wtwKg, leg.ttwKg, leg.wttKg, leg.tonneKm); total += leg.wtwKg; }
    for (const hub of row.result.hubs) { add(map, "hub", MODE_NAMES.hub, hub.wtwKg, hub.ttwKg, hub.wttKg, 0); total += hub.wtwKg; }
  }
  const order = [...MODE_ORDER, "hub"];
  return finish(map, total).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export function byMonth(rows: ComputedShipment[], fy?: string): Bucket[] {
  const map = new Map<string, Omit<Bucket, "share">>();
  if (fy && fy !== "all") {
    const start = Number(fy.slice(3, 7));
    for (let i = 0; i < 12; i += 1) {
      const month = ((3 + i) % 12) + 1;
      const year = month >= 4 ? start : start + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      map.set(key, { key, label: key, wtwKg: 0, ttwKg: 0, wttKg: 0, tonneKm: 0, count: 0 });
    }
  }
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    const key = row.date.slice(0, 7);
    add(map, key, key, row.result.wtwKg, row.result.ttwKg, row.result.wttKg, row.result.tonneKm);
    total += row.result.wtwKg;
  }
  return finish(map, total, "key");
}

function groupShipments(rows: ComputedShipment[], keyOf: (row: ComputedShipment) => string, labelOf = keyOf) {
  const map = new Map<string, Omit<Bucket, "share">>();
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    add(map, keyOf(row), labelOf(row), row.result.wtwKg, row.result.ttwKg, row.result.wttKg, row.result.tonneKm);
    total += row.result.wtwKg;
  }
  return finish(map, total);
}

export const byBusinessUnit = (rows: ComputedShipment[]) => groupShipments(rows, (row) => row.businessUnit || "Unassigned");
export const byLane = (rows: ComputedShipment[]) => groupShipments(rows, laneKey);

export function byScope(rows: ComputedShipment[]): Bucket[] {
  const labels: Record<ScopeKey, string> = { scope1: "Scope 1 · own fleet fuel", scope2: "Scope 2 · own fleet electricity", cat4: "Scope 3 · Category 4", cat9: "Scope 3 · Category 9" };
  const map = new Map<string, Omit<Bucket, "share">>();
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    for (const leg of row.result.legs) { const key = scopeOf(row, leg.method); add(map, key, labels[key], leg.wtwKg, leg.ttwKg, leg.wttKg, leg.tonneKm); total += leg.wtwKg; }
    // Hub services are purchased from logistics providers except for own-fleet movements.
    for (const hub of row.result.hubs) { const key = row.paidBy === "customer" ? "cat9" : "cat4"; add(map, key, labels[key], hub.wtwKg, hub.ttwKg, hub.wttKg, 0, 0); total += hub.wtwKg; }
  }
  return finish(map, total);
}

export function byQuality(rows: ComputedShipment[]): Bucket[] {
  const labels: Record<DataQuality, string> = { primary: "Primary data (measured fuel, energy or carrier value)", modelled: "Modelled data", default: "Default factors" };
  const map = new Map<string, Omit<Bucket, "share">>();
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    for (const leg of row.result.legs) { add(map, leg.dataQuality, labels[leg.dataQuality], leg.wtwKg, leg.ttwKg, leg.wttKg, leg.tonneKm); total += leg.wtwKg; }
    for (const hub of row.result.hubs) { add(map, "default", labels.default, hub.wtwKg, hub.ttwKg, hub.wttKg, 0, 0); total += hub.wtwKg; }
  }
  return finish(map, total);
}

export function byVehicleClass(rows: ComputedShipment[]): Bucket[] {
  const map = new Map<string, Omit<Bucket, "share">>();
  let total = 0;
  for (const row of rows) {
    if (!row.result) continue;
    row.result.legs.forEach((leg, index) => {
      if (leg.mode !== "road") return;
      const input = row.input.legs[index]!;
      const id = input.vehicleClass ?? "gvw-12-20";
      const vehicle = ROAD_CLASSES.find((item) => item.id === id);
      add(map, `${id}:${input.fuel ?? "diesel"}`, `${vehicle?.label ?? id} · ${input.fuel === "cng" ? "CNG" : input.fuel ?? "diesel"}`, leg.wtwKg, leg.ttwKg, leg.wttKg, leg.tonneKm);
      total += leg.wtwKg;
    });
  }
  return finish(map, total);
}

/** How far through an Indian financial year (April–March) today is. */
export function fyProgress(fy: string, today = todayIso()) {
  const start = Number(fy.slice(3, 7));
  const first = `${start}-04-01`, last = `${start + 1}-03-31`;
  if (!Number.isFinite(start) || today > last) return { ongoing: false, fraction: 1 };
  if (today < first) return { ongoing: false, fraction: 0 };
  const day = 86400000;
  const elapsed = (Date.parse(today) - Date.parse(first)) / day + 1;
  const length = (Date.parse(last) - Date.parse(first)) / day + 1;
  return { ongoing: true, fraction: elapsed / length };
}

/**
 * The previous financial year for year-on-year comparison. While the selected year is still running,
 * the previous year is cut to the same date so a part year is never compared with a full year.
 */
export function previousPeriod(all: ComputedShipment[], fy: string | undefined, filters: Filters = {}, today = todayIso()) {
  if (!fy || fy === "all") return undefined;
  const start = Number(fy.slice(3, 7));
  const label = `FY ${start - 1}–${String(start % 100).padStart(2, "0")}`;
  let rows = applyFilters(all, { ...filters, fy: label });
  const partial = fyProgress(fy, today).ongoing;
  if (partial) {
    const cutoff = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
    rows = rows.filter((row) => row.date <= cutoff);
  }
  if (!rows.some((row) => row.result)) return undefined;
  const through = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return { period: label, label: partial ? `the same period of ${label} (to ${through})` : label, short: partial ? `${label} to ${through}` : label, partial, totals: totals(rows) };
}

export function fiscalYears(rows: ComputedShipment[]) {
  return [...new Set(rows.map((row) => fiscalYear(row.date)))].sort().reverse();
}

// ─── Opportunities, computed with the same engine as the footprint ─────────

export interface Opportunity {
  id: string;
  title: string;
  body: string;
  savingKg: number;
  affected: number;
  lever: "modal-shift" | "right-size" | "air-shift" | "data" | "renewable-ev";
}

const DRAYAGE_KM = 30;

/** Rail with first- and last-mile road drayage, for a road leg of the same cargo and distance. */
export function railAlternativeKg(leg: LegInput, distanceKm: number, factorSet: FactorSetId) {
  const drayage = { mode: "road" as const, tonnes: leg.tonnes, distanceKm: DRAYAGE_KM, vehicleClass: "gvw-12-20" as const, fuel: "diesel" as const };
  return calculateLeg({ mode: "rail", tonnes: leg.tonnes, distanceKm: distanceKm * (1.15 / 1.22) }, factorSet).wtwKg + 2 * calculateLeg(drayage, factorSet).wtwKg;
}

export function opportunities(rows: ComputedShipment[], factorSet: FactorSetId): Opportunity[] {
  const found: Opportunity[] = [];
  let railSaving = 0, railCount = 0, sizeSaving = 0, sizeCount = 0, airSaving = 0, airCount = 0, defaultKg = 0, total = 0;
  const railLanes = new Map<string, number>();
  for (const row of rows) {
    if (!row.result) continue;
    total += row.result.wtwKg;
    row.result.legs.forEach((leg, index) => {
      const input = row.input.legs[index]!;
      if (leg.dataQuality === "default") defaultKg += leg.wtwKg;
      if (leg.mode === "road" && leg.method === "distance" && !input.courierLeg && leg.distanceKm >= 500 && leg.tonnes >= 8) {
        const alternative = railAlternativeKg(input, leg.distanceKm, factorSet);
        if (alternative < leg.wtwKg) {
          railSaving += leg.wtwKg - alternative; railCount += 1;
          const lane = laneKey(row);
          railLanes.set(lane, (railLanes.get(lane) ?? 0) + leg.wtwKg - alternative);
        }
      }
      if (leg.mode === "road" && leg.method === "distance" && ["gvw-3.5", "gvw-3-5", "gvw-5-12"].includes(input.vehicleClass ?? "") && leg.distanceKm >= 250 && !input.courierLeg) {
        try {
          const bigger = calculateLeg({ ...input, vehicleClass: "gvw-12-20", fuel: "diesel" }, factorSet).wtwKg;
          if (bigger < leg.wtwKg) { sizeSaving += leg.wtwKg - bigger; sizeCount += 1; }
        } catch { /* no comparable factor */ }
      }
      if (leg.mode === "air" && leg.distanceKm <= 2500) {
        const road = calculateLeg({ mode: "road", tonnes: leg.tonnes, distanceKm: leg.distanceKm * 1.22, vehicleClass: "gvw-5-12" }, factorSet).wtwKg;
        if (road < leg.wtwKg) { airSaving += leg.wtwKg - road; airCount += 1; }
      }
    });
  }
  if (railCount) {
    const topLanes = [...railLanes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([lane]) => lane).join("; ");
    found.push({ id: "modal-shift", lever: "modal-shift", savingKg: railSaving, affected: railCount, title: "Move long road hauls to rail",
      body: `${railCount} road legs of 500 km or more with at least 8 t of cargo could move by rail with ${DRAYAGE_KM} km road drayage at each end. Biggest lanes: ${topLanes}. Check rail access, capacity and transit time before committing.` });
  }
  if (airCount) found.push({ id: "air-shift", lever: "air-shift", savingKg: airSaving, affected: airCount, title: "Replace short air legs with road",
    body: `${airCount} air legs of up to 2,500 km. Moving time-flexible consignments to an intermediate truck would avoid most of their emissions.` });
  if (sizeCount) found.push({ id: "right-size", lever: "right-size", savingKg: sizeSaving, affected: sizeCount, title: "Consolidate long hauls into larger trucks",
    body: `${sizeCount} long-haul legs use trucks of 12 t GVW or less. Consolidating loads into a 12–20 t truck lowers emissions per tonne-kilometre.` });
  if (total > 0 && defaultKg / total > 0.5) found.push({ id: "data", lever: "data", savingKg: 0, affected: 0, title: "Replace default factors with primary data",
    body: `${Math.round((defaultKg / total) * 100)}% of emissions use default factors. Ask your top carriers for fuel or energy records; ISO 14083 prefers primary data and it usually shows the effect of your own improvements.` });
  return found.sort((a, b) => b.savingKg - a.savingKg);
}

export interface Insight {
  id: string;
  tone: "maroon" | "info" | "warn" | "ok";
  title: string;
  body: string;
}

export function insights(rows: ComputedShipment[]): Insight[] {
  const result: Insight[] = [];
  const modes = byMode(rows);
  const total = totals(rows);
  if (!total.shipments) return result;
  const tkm = total.tonneKm || 1;
  const top = modes.filter((mode) => mode.key !== "hub")[0];
  if (top) result.push({ id: "top-mode", tone: "maroon", title: `${top.label} is your largest source`, body: `${Math.round(top.share)}% of emissions from ${Math.round((top.tonneKm / tkm) * 100)}% of tonne-kilometres.` });
  const air = modes.find((mode) => mode.key === "air");
  if (air && air.share > 5) result.push({ id: "air", tone: "warn", title: "Air freight is emission-intensive", body: `Air moves ${((air.tonneKm / tkm) * 100).toFixed(1)}% of your tonne-kilometres but causes ${Math.round(air.share)}% of emissions.` });
  const rail = modes.find((mode) => mode.key === "rail");
  if (rail && rail.tonneKm / tkm > 0.15) result.push({ id: "rail", tone: "ok", title: "Rail is working for you", body: `Rail carries ${Math.round((rail.tonneKm / tkm) * 100)}% of tonne-kilometres for ${Math.round(rail.share)}% of emissions.` });
  const lanes = byLane(rows);
  if (lanes[0] && lanes.length > 3) result.push({ id: "lane", tone: "info", title: "Your heaviest lane", body: `${lanes[0].label} accounts for ${Math.round(lanes[0].share)}% of emissions across ${plural(lanes[0].count, "shipment")}.` });
  if (total.errors) result.push({ id: "errors", tone: "warn", title: `${plural(total.errors, "shipment")} ${total.errors === 1 ? "needs" : "need"} attention`, body: "They could not be calculated. Open the ledger to fix missing distances or unsupported combinations." });
  return result;
}
