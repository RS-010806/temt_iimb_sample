"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { EV_ENERGY_PROXY_KWH_PER_TKM, FACTOR_SETS, FUELS, GLEC_AIR, HUB_TYPES, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, RAIL_FACTORS, ROAD_CLASSES, ROAD_FACTORS, SOURCES, TEMT_AIR, TRADE_LANES, VESSELS, type FactorSetId, type RoadClassId } from "@temt/calculator";
import { fmt } from "@/lib/format";
import { useSettings } from "@/lib/store";
import { BarList } from "../charts";
import { PageHeader, Segmented, Toggle, cx } from "../../ui";

type Tab = "road" | "rail-air" | "sea" | "iww-hubs" | "fuels" | "sources";
const g = (kg: number) => fmt(kg * 1000, 1);

function Table({ head, rows, right = 1 }: { head: string[]; rows: (string | number)[][]; right?: number }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((label, i) => <th key={label} className={i >= right ? "right" : undefined}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className={cx(i >= right && "right num", i === 0 && "font-semibold")}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function FactorsView() {
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>("road");
  const [compare, setCompare] = useState(false);
  const set = settings.factorSet;
  const other: FactorSetId = set === "temt" ? "glec-india" : "temt";
  const roadW = (id: FactorSetId, cls: RoadClassId, fuel: "diesel" | "cng" | "petrol") => { const f = ROAD_FACTORS[id][cls]?.[fuel]; return f ? f.wtt + f.ttw : undefined; };
  const road = (cls: RoadClassId) => roadW(set, cls, "diesel") ?? roadW(other, cls, "diesel")!;
  const air = (id: FactorSetId, haul: "short" | "long") => id === "glec-india" ? GLEC_AIR.unknown[haul].wtt + GLEC_AIR.unknown[haul].ttw : (haul === "short" ? TEMT_AIR.domestic.wtt + TEMT_AIR.domestic.ttw : TEMT_AIR.international.wtt + TEMT_AIR.international.ttw);
  const ladder = [
    { key: "rail", label: "Rail, India average", value: RAIL_FACTORS[set].wtt + RAIL_FACTORS[set].ttw, color: "var(--mode-rail)" },
    { key: "sea", label: "Container ship, Intra ME/India (10 t/TEU)", value: (20.5 + 94) / 1000 / 10, color: "var(--mode-sea)" },
    { key: "iww", label: "Inland vessel 85–110 m", value: (4.9 + 16.4) / 1000, color: "var(--mode-iww)" },
    { key: "trailer", label: "Tractor-trailer, diesel", value: road("trailer-30-60"), color: "var(--mode-road)" },
    { key: "hcv", label: "Multi-axle truck 30–50 t, diesel", value: road("gvw-30-50"), color: "var(--mode-road)" },
    { key: "icv", label: "Intermediate truck 5–12 t, diesel", value: road("gvw-5-12"), color: "var(--mode-road)" },
    { key: "lcv", label: "Light commercial vehicle, diesel", value: road("gvw-3.5"), color: "var(--mode-road)" },
    { key: "air-long", label: "Air, long-haul", value: air(set, "long"), color: "var(--mode-air)" },
    { key: "air-short", label: "Air, short-haul / domestic", value: air(set, "short"), color: "var(--mode-air)" },
  ];
  const cmp = compare ? [FACTOR_SETS[other].short] : [];

  return (
    <div>
      <PageHeader eyebrow="Factor library" title="Every factor, with its source" description="The emission factors TEMT applies, with their sources and versions, so your auditors can check any number." />
      <section className="card card-pad mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-bold">{set === "temt" ? "Calculations use TEMT's emission factors" : "Calculations currently use the GLEC v3.2 comparison set"}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-grey-700">{FACTOR_SETS[set].description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Toggle checked={compare} onChange={setCompare} label={`Show ${FACTOR_SETS[other].short} for comparison`} />
          {set !== "temt" && <Link prefetch={false} href="/app/settings/#factors" className="btn btn-secondary btn-sm">Return to TEMT factors</Link>}
        </div>
      </section>
      <section className="card card-pad mb-6">
        <h2 className="card-title">Intensity ladder</h2><p className="card-subtitle mb-5">g CO₂e per tonne-km, well-to-wheel. Same cargo, same distance, very different footprints.</p>
        <BarList items={ladder.map((item) => ({ ...item, value: item.value * 1000 }))} formatValue={(value) => `${fmt(value, value < 100 ? 1 : 0)} g/t-km`} showShare={false} />
      </section>
      <div className="mb-5 overflow-x-auto"><Segmented ariaLabel="Factor category" value={tab} onChange={setTab} options={[{ value: "road", label: "Road" }, { value: "rail-air", label: "Rail and air" }, { value: "sea", label: "Sea" }, { value: "iww-hubs", label: "Waterways and hubs" }, { value: "fuels", label: "Fuels and electricity" }, { value: "sources", label: "Sources" }]} /></div>

      {tab === "road" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Vehicle class", "Fuel", "WTT", "TTW", "WTW", ...cmp.map((label) => `${label} WTW`)]} right={2}
            rows={ROAD_CLASSES.flatMap((item) => (["diesel", "cng", "petrol"] as const).flatMap((fuel) => {
              const own = ROAD_FACTORS[set][item.id]?.[fuel] ?? ROAD_FACTORS[other][item.id]?.[fuel];
              if (!own) return [];
              const alt = roadW(other, item.id, fuel);
              return [[`${item.label} (${item.gvw})`, fuel === "cng" ? "CNG" : fuel, g(own.wtt), g(own.ttw), g(own.wtt + own.ttw), ...(compare ? [alt ? g(alt) : "–"] : [])]];
            }))} />
          <p className="text-[13px] leading-relaxed text-grey-600">g CO₂e per tonne-km, at the typical load factor of each class. Refrigerated road freight adds TEMT's refrigeration uplift. Courier and part-truckload shipments use TEMT's first-mile, line-haul and last-mile defaults with a transshipment at each hub.</p>
          <Table head={["Electric truck class", "Energy kWh/t-km", "At CEA grid, g/t-km"]} rows={ROAD_CLASSES.filter((item) => EV_ENERGY_PROXY_KWH_PER_TKM[item.id]).map((item) => [`${item.label} (${item.gvw})`, fmt(EV_ENERGY_PROXY_KWH_PER_TKM[item.id]!, 2), g(EV_ENERGY_PROXY_KWH_PER_TKM[item.id]! * INDIA_GRID_KG_PER_KWH)])} />
          <p className="text-[13px] text-grey-600">International energy proxies until Indian values are published. Enter measured kWh from charging logs for primary data.</p>
        </div>
      )}
      {tab === "rail-air" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Rail", "WTT", "TTW", "WTW"]} rows={[set, ...(compare ? [other] : [])].map((id) => [id === "temt" ? "Indian Railways average (TEMT)" : "Indian average (GLEC v3.2)", g(RAIL_FACTORS[id].wtt), g(RAIL_FACTORS[id].ttw), g(RAIL_FACTORS[id].wtt + RAIL_FACTORS[id].ttw)])} />
          {(set === "temt" || compare) && <Table head={["Air (TEMT)", "WTT", "TTW", "WTW"]} rows={(Object.keys(TEMT_AIR) as (keyof typeof TEMT_AIR)[]).map((scope) => [scope === "domestic" ? "Domestic" : "International", g(TEMT_AIR[scope].wtt), g(TEMT_AIR[scope].ttw), g(TEMT_AIR[scope].wtt + TEMT_AIR[scope].ttw)])} />}
          {(set === "glec-india" || compare) && <Table head={["Air (GLEC v3.2)", "Haul", "WTT", "TTW", "WTW"]} right={2} rows={(Object.keys(GLEC_AIR) as (keyof typeof GLEC_AIR)[]).flatMap((service) => (["short", "long"] as const).map((haul) => [service === "unknown" ? "Unknown aircraft mix" : service === "belly" ? "Belly hold" : "Freighter", haul === "short" ? "≤ 1,500 km" : "> 1,500 km", g(GLEC_AIR[service][haul].wtt), g(GLEC_AIR[service][haul].ttw), g(GLEC_AIR[service][haul].wtt + GLEC_AIR[service][haul].ttw)]))} />}
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km over the great-circle distance between airports, including the standard routing allowance.</p>
        </div>
      )}
      {tab === "sea" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Container trade lane", "Dry WTT", "Dry TTW", "Reefer WTT", "Reefer TTW"]} rows={TRADE_LANES.map((lane) => [lane.label, fmt(lane.dry.wtt, 1), fmt(lane.dry.ttw, 1), fmt(lane.reefer.wtt, 1), fmt(lane.reefer.ttw, 1)])} />
          <p className="text-[13px] text-grey-600">g CO₂e per TEU-km, ISO 14083-aligned international defaults (GLEC v3.2), converted to tonne-km with the cargo per TEU you choose. TEMT suggests the lane from the route.</p>
          <Table head={["Vessel", "Size", "TEMT TTW", ...(compare ? ["GLEC v3.2 WTT", "GLEC v3.2 TTW"] : [])]} right={2} rows={VESSELS.map((vessel) => [vessel.type, vessel.size, vessel.temtTtw !== undefined ? g(vessel.temtTtw) : "–", ...(compare ? [vessel.glec ? fmt(vessel.glec.wtt, 1) : "–", vessel.glec ? fmt(vessel.glec.ttw, 1) : "–"] : [])])} />
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km. Where TEMT has no value for a vessel, the international default is used. Estimated routes are adjusted to typical sailed distances.</p>
        </div>
      )}
      {tab === "iww-hubs" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Inland vessel", "WTT", "TTW", "WTW"]} rows={IWW_VESSELS.map((vessel) => [vessel.label, g(vessel.f.wtt), g(vessel.f.ttw), g(vessel.f.wtt + vessel.f.ttw)])} />
          <Table head={["Logistics hub", "Unit", "Ambient", "Mixed / temperature-controlled"]} right={2} rows={Object.values(HUB_TYPES).map((hub) => [hub.label, `kg CO₂e per ${hub.unit}`, fmt(hub.ambient, 1), fmt(hub.mixed, 1)])} />
          <p className="text-[13px] text-grey-600">ISO 14083-aligned international defaults (GLEC v3.2), based mainly on European operations. Use operator data for Indian National Waterways where available.</p>
        </div>
      )}
      {tab === "fuels" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Energy carrier", "Unit", "TTW", "WTW", "Density kg/l", "Source"]} right={2} rows={Object.values(FUELS).map((fuel) => [fuel.label, `kg CO₂e/${fuel.unit}`, fmt(fuel.ttw, 2), fmt(fuel.wtw, 3), fuel.density ? fmt(fuel.density, 3) : "–", `${SOURCES[fuel.source].publisher}, ${fuel.ref}`])} />
          <p className="text-[13px] text-grey-600">Diesel works out at {fmt(FUELS.diesel.ttw * FUELS.diesel.density!, 3)} kg CO₂e per litre tank-to-wheel and {fmt(FUELS.diesel.wtw * FUELS.diesel.density!, 3)} well-to-wheel. Grid electricity uses the CEA V21.0 weighted average for FY 2024–25.</p>
        </div>
      )}
      {tab === "sources" && (
        <ul className="grid gap-3 animate-fade">
          {[SOURCES.temt, ...Object.values(SOURCES).filter((source) => source.id !== "temt")].map((source) => (
            <li key={source.id} className="card card-pad">
              <a href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 font-bold hover:text-maroon-700">{source.title}<ExternalLink size={15} className="mt-1 shrink-0" aria-hidden="true" /></a>
              <p className="mt-1 text-[13px] text-grey-600">{source.publisher} · {source.year}</p>
              {source.note && <p className="mt-2 text-[13.5px] text-grey-700">{source.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
