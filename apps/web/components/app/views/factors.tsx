"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CEA_GRID_KG_PER_KWH, EV_ENERGY_PROXY_KWH_PER_TKM, FACTOR_SETS, FUELS, HUB_TYPES, INDIA_DOMESTIC_AIR, INDIA_ELECTRIC_TRUCKS, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, RAIL_FACTORS, ROAD_CLASSES, ROAD_FACTORS, SOURCES, TEMT_AIR, TRADE_LANES, VESSELS, type RoadClassId } from "@temt/calculator";
import { fmt } from "@/lib/format";
import { BarList } from "../charts";
import { PageHeader, Segmented, cx } from "../../ui";

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
  const [tab, setTab] = useState<Tab>("road");
  const road = (cls: RoadClassId) => { const f = ROAD_FACTORS.temt[cls]!.diesel!; return f.wtt + f.ttw; };
  const ladder = [
    { key: "rail", label: "Rail, India average", value: RAIL_FACTORS.temt.wtt + RAIL_FACTORS.temt.ttw, color: "var(--mode-rail)" },
    { key: "sea", label: "Container ship, Intra ME/India (10 t/TEU)", value: (20.5 + 94) / 1000 / 10, color: "var(--mode-sea)" },
    { key: "iww", label: "Inland vessel 85–110 m", value: (4.9 + 16.4) / 1000, color: "var(--mode-iww)" },
    { key: "trailer", label: "Tractor-trailer, diesel", value: road("trailer-30-60"), color: "var(--mode-road)" },
    { key: "hcv", label: "Multi-axle truck 30–50 t, diesel", value: road("gvw-30-50"), color: "var(--mode-road)" },
    { key: "icv", label: "Intermediate truck 5–12 t, diesel", value: road("gvw-5-12"), color: "var(--mode-road)" },
    { key: "lcv", label: "Light commercial vehicle, diesel", value: road("gvw-3.5"), color: "var(--mode-road)" },
    { key: "air-long", label: "Air, international", value: TEMT_AIR.international.wtt + TEMT_AIR.international.ttw, color: "var(--mode-air)" },
    { key: "air-domestic", label: "Air, Indian domestic", value: INDIA_DOMESTIC_AIR.wtt + INDIA_DOMESTIC_AIR.ttw, color: "var(--mode-air)" },
  ];

  return (
    <div>
      <PageHeader eyebrow="Factor library" title="Every factor, with its source" description="The emission factors TEMT applies, with their sources and versions, so your auditors can check any number." />
      <section className="card card-pad mb-6">
        <p className="font-bold">TEMT's emission factors, following the GLEC Framework v3.3</p>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-grey-700">{FACTOR_SETS.temt.description}</p>
      </section>
      <section className="card card-pad mb-6">
        <h2 className="card-title">Intensity ladder</h2><p className="card-subtitle mb-5">g CO₂e per tonne-km, well-to-wheel. Same cargo, same distance, very different footprints.</p>
        <BarList items={ladder.map((item) => ({ ...item, value: item.value * 1000 }))} formatValue={(value) => `${fmt(value, value < 100 ? 1 : 0)} g/t-km`} showShare={false} />
      </section>
      <div className="mb-5 overflow-x-auto"><Segmented ariaLabel="Factor category" value={tab} onChange={setTab} options={[{ value: "road", label: "Road" }, { value: "rail-air", label: "Rail and air" }, { value: "sea", label: "Sea" }, { value: "iww-hubs", label: "Waterways and hubs" }, { value: "fuels", label: "Fuels and electricity" }, { value: "sources", label: "Sources" }]} /></div>

      {tab === "road" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Vehicle class", "Fuel", "WTT", "TTW", "WTW"]} right={2}
            rows={ROAD_CLASSES.flatMap((item) => (["diesel", "cng", "petrol"] as const).flatMap((fuel) => {
              const own = ROAD_FACTORS.temt[item.id]?.[fuel];
              return own ? [[`${item.label} (${item.gvw})`, fuel === "cng" ? "CNG" : fuel, g(own.wtt), g(own.ttw), g(own.wtt + own.ttw)]] : [];
            }))} />
          <p className="text-[13px] leading-relaxed text-grey-600">g CO₂e per tonne-km, at the typical load factor of each class. Refrigerated road freight adds TEMT's refrigeration uplift. Courier and part-truckload shipments use TEMT's first-mile, line-haul and last-mile defaults with a transshipment at each hub.</p>
          <Table head={["Electric truck class", "GLEC v3.3 India row", "kWh/t-km", "WTW, g/t-km", "Diesel, g/t-km"]} right={2} rows={ROAD_CLASSES.filter((item) => EV_ENERGY_PROXY_KWH_PER_TKM[item.id]).map((item) => {
            const indian = INDIA_ELECTRIC_TRUCKS[item.id];
            return [`${item.label} (${item.gvw})`, indian ? indian.row : "Not covered: TEMT estimate", fmt(indian ? indian.kwhPerTkm : EV_ENERGY_PROXY_KWH_PER_TKM[item.id]!, 3), indian ? fmt(indian.wtwG, 1) : g(EV_ENERGY_PROXY_KWH_PER_TKM[item.id]! * INDIA_GRID_KG_PER_KWH), g(ROAD_FACTORS.temt[item.id]!.diesel!.wtt + ROAD_FACTORS.temt[item.id]!.diesel!.ttw)];
          })} />
          <p className="text-[13px] leading-relaxed text-grey-600">GLEC v3.3 publishes Indian electric-truck values from manufacturer specifications and industry pilots, with TCI–IIMB load factors. Their WTW intensity includes a 10% charging loss, 5% out-of-route distance and grid electricity at the point of use. Each TEMT class takes the row with its own operating assumptions. For heavy rigid trucks of 20–50 t, which have no Indian value, TEMT applies GLEC v3.3 Table 11's ratio of electricity to diesel to its Indian diesel factor, so the estimate reflects Indian loading. Enter kWh from charging records for primary data.</p>
        </div>
      )}
      {tab === "rail-air" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Rail and air", "WTT", "TTW", "WTW"]} rows={[
            ["Indian Railways, mixed diesel and electric traction (GLEC v3.3, India)", g(RAIL_FACTORS.temt.wtt), g(RAIL_FACTORS.temt.ttw), g(RAIL_FACTORS.temt.wtt + RAIL_FACTORS.temt.ttw)],
            ["Indian domestic air, all aircraft (GLEC v3.3, India)", g(INDIA_DOMESTIC_AIR.wtt), g(INDIA_DOMESTIC_AIR.ttw), g(INDIA_DOMESTIC_AIR.wtt + INDIA_DOMESTIC_AIR.ttw)],
            ["International air (TEMT)", g(TEMT_AIR.international.wtt), g(TEMT_AIR.international.ttw), g(TEMT_AIR.international.wtt + TEMT_AIR.international.ttw)],
          ]} />
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km over the great-circle distance between airports. The Indian rail and domestic air values are built from Indian Railways and DGCA data for FY 2022–23 to 2024–25 by SFC India and the TCI–IIMB Lab. Domestic air comes from actual fuel use, so no routing allowance is added; international flights include GLEC's 95 km allowance.</p>
        </div>
      )}
      {tab === "sea" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Container trade lane", "Dry WTT", "Dry TTW", "Reefer WTT", "Reefer TTW"]} rows={TRADE_LANES.map((lane) => [lane.label, fmt(lane.dry.wtt, 1), fmt(lane.dry.ttw, 1), fmt(lane.reefer.wtt, 1), fmt(lane.reefer.ttw, 1)])} />
          <p className="text-[13px] text-grey-600">g CO₂e per TEU-km, ISO 14083-aligned international defaults (GLEC v3.3 Tables 18–19), converted to tonne-km with the cargo per TEU you choose. TEMT suggests the lane from the route.</p>
          <Table head={["Vessel", "Size", "WTT", "TTW", "Source"]} right={2} rows={VESSELS.map((vessel) => vessel.temtTtw !== undefined
            ? [vessel.type, vessel.size, g(vessel.temtTtw / 5), g(vessel.temtTtw), "TEMT"]
            : [vessel.type, vessel.size, fmt(vessel.glec!.wtt, 1), fmt(vessel.glec!.ttw, 1), "GLEC v3.3, +15% distance"])} />
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km. Where TEMT has no value for a vessel, the GLEC v3.3 default (VLSFO) is used, with GLEC's 15% adjustment from the shortest to the sailed distance.</p>
        </div>
      )}
      {tab === "iww-hubs" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Inland vessel", "WTT", "TTW", "WTW"]} rows={IWW_VESSELS.map((vessel) => [vessel.label, g(vessel.f.wtt), g(vessel.f.ttw), g(vessel.f.wtt + vessel.f.ttw)])} />
          <Table head={["Logistics hub", "Unit", "Ambient", "Mixed / temperature-controlled"]} right={2} rows={Object.values(HUB_TYPES).map((hub) => [hub.label, `kg CO₂e per ${hub.unit}`, fmt(hub.ambient, 1), fmt(hub.mixed, 1)])} />
          <p className="text-[13px] text-grey-600">ISO 14083-aligned international defaults (GLEC v3.3). Waterway values are based mainly on European operations: use operator data for Indian National Waterways where available. Hub values are Fraunhofer IML's global defaults, which include Indian hubs, and apply in both factor sets.</p>
        </div>
      )}
      {tab === "fuels" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Energy carrier", "Unit", "TTW", "WTW", "Density kg/l", "Source"]} right={2} rows={Object.values(FUELS).map((fuel) => [fuel.label, `kg CO₂e/${fuel.unit}`, fmt(fuel.ttw, 2), fmt(fuel.wtw, 3), fuel.density ? fmt(fuel.density, 3) : "–", `${SOURCES[fuel.source].publisher}, ${fuel.ref}`])} />
          <p className="text-[13px] text-grey-600">Diesel works out at {fmt(FUELS.diesel.ttw * FUELS.diesel.density!, 3)} kg CO₂e per litre tank-to-wheel and {fmt(FUELS.diesel.wtw * FUELS.diesel.density!, 3)} well-to-wheel. Grid electricity is the CEA V22.0 all-India average for FY 2025–26 ({fmt(CEA_GRID_KG_PER_KWH, 3)} kg CO₂ per kWh at generation), applied at the point of use with transmission and distribution losses and upstream fuel production, as in GLEC v3.3: {fmt(INDIA_GRID_KG_PER_KWH, 3)} kg CO₂e per kWh.</p>
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
