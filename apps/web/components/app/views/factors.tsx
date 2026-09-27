"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { EV_ENERGY_PROXY_KWH_PER_TKM, FACTOR_SETS, FUELS, GLEC_AIR, HUB_TYPES, INDIA_GRID_KG_PER_KWH, IWW_VESSELS, RAIL_FACTORS, ROAD_CLASSES, ROAD_FACTORS, SOURCES, TEMT_AIR, TEMT_COURIER, TRADE_LANES, VESSELS, type FactorSetId } from "@temt/calculator";
import { fmt, pct } from "@/lib/format";
import { actions, useSettings } from "@/lib/store";
import { BarList } from "../charts";
import { PageHeader, Segmented, cx, useToast } from "../../ui";

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
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("road");
  const set = settings.factorSet;
  const ladder = [
    { key: "rail", label: "Rail, India average", value: RAIL_FACTORS[set].wtt + RAIL_FACTORS[set].ttw, color: "var(--mode-rail)" },
    { key: "sea", label: "Container ship, Intra ME/India (10 t/TEU)", value: (20.5 + 94) / 1000 / 10, color: "var(--mode-sea)" },
    { key: "iww", label: "Inland vessel 85–110 m", value: (4.9 + 16.4) / 1000, color: "var(--mode-iww)" },
    { key: "trailer", label: "Tractor-trailer, diesel", value: (ROAD_FACTORS[set]["trailer-30-60"]!.diesel!.wtt + ROAD_FACTORS[set]["trailer-30-60"]!.diesel!.ttw), color: "var(--mode-road)" },
    { key: "hcv", label: "Multi-axle truck 30–50 t, diesel", value: (ROAD_FACTORS[set]["gvw-30-50"]!.diesel!.wtt + ROAD_FACTORS[set]["gvw-30-50"]!.diesel!.ttw), color: "var(--mode-road)" },
    { key: "icv", label: "Intermediate truck 5–12 t, diesel", value: (ROAD_FACTORS[set]["gvw-5-12"]!.diesel!.wtt + ROAD_FACTORS[set]["gvw-5-12"]!.diesel!.ttw), color: "var(--mode-road)" },
    { key: "lcv", label: "Light commercial vehicle, diesel", value: (ROAD_FACTORS[set]["gvw-3.5"]!.diesel!.wtt + ROAD_FACTORS[set]["gvw-3.5"]!.diesel!.ttw), color: "var(--mode-road)" },
    { key: "air-long", label: "Air, long-haul", value: set === "glec-india" ? GLEC_AIR.unknown.long.wtt + GLEC_AIR.unknown.long.ttw : TEMT_AIR.international.wtt + TEMT_AIR.international.ttw, color: "var(--mode-air)" },
    { key: "air-short", label: "Air, short-haul / domestic", value: set === "glec-india" ? GLEC_AIR.unknown.short.wtt + GLEC_AIR.unknown.short.ttw : TEMT_AIR.domestic.wtt + TEMT_AIR.domestic.ttw, color: "var(--mode-air)" },
  ];

  return (
    <div>
      <PageHeader eyebrow="Factor library" title="Know what goes into every number" description="Every factor TEMT uses, with its source and table reference. Factor sets are versioned, so you can restate or reconcile without changing your inputs." />
      <section id="factors" className="card card-pad mb-6 grid gap-5 lg:grid-cols-2">
        {(Object.keys(FACTOR_SETS) as FactorSetId[]).map((id) => (
          <button key={id} type="button" onClick={() => { if (id !== set) { actions.updateSettings({ factorSet: id }); toast({ tone: "ok", message: `Now using ${FACTOR_SETS[id].short}. All shipments recalculated.` }); } }}
            className={cx("rounded-xl border p-5 text-left transition", id === set ? "border-maroon-600 bg-maroon-50 shadow-[inset_0_0_0_1px_var(--color-maroon-600)]" : "border-stone-200 hover:border-maroon-300")} aria-pressed={id === set}>
            <p className="flex items-center justify-between gap-3"><span className="font-bold">{FACTOR_SETS[id].label}</span>{id === set && <span className="badge bg-maroon-600 text-white">Active</span>}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-grey-700">{FACTOR_SETS[id].description}</p>
          </button>
        ))}
      </section>
      <section className="card card-pad mb-6">
        <h2 className="card-title">Intensity ladder</h2><p className="card-subtitle mb-5">g CO₂e per tonne-km, well-to-wheel, {FACTOR_SETS[set].short}. Same cargo, same distance, very different footprints.</p>
        <BarList items={ladder.map((item) => ({ ...item, value: item.value * 1000 }))} formatValue={(value) => `${fmt(value, value < 100 ? 1 : 0)} g/t-km`} showShare={false} />
      </section>
      <div className="mb-5 overflow-x-auto"><Segmented ariaLabel="Factor category" value={tab} onChange={setTab} options={[{ value: "road", label: "Road" }, { value: "rail-air", label: "Rail and air" }, { value: "sea", label: "Sea" }, { value: "iww-hubs", label: "Waterways and hubs" }, { value: "fuels", label: "Fuels and electricity" }, { value: "sources", label: "Sources" }]} /></div>

      {tab === "road" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Vehicle class", "Fuel", "GLEC WTT", "GLEC TTW", "GLEC WTW", "TEMT WTW", "Difference"]} right={2}
            rows={ROAD_CLASSES.flatMap((item) => (["diesel", "cng", "petrol"] as const).flatMap((fuel) => {
              const a = ROAD_FACTORS["glec-india"][item.id]?.[fuel], b = ROAD_FACTORS["temt-legacy"][item.id]?.[fuel];
              if (!a && !b) return [];
              const aw = a ? a.wtt + a.ttw : undefined, bw = b ? b.wtt + b.ttw : undefined;
              return [[`${item.label} (${item.gvw})`, fuel === "cng" ? "CNG" : fuel, a ? g(a.wtt) : "–", a ? g(a.ttw) : "–", aw ? g(aw) : "–", bw ? g(bw) : "–", aw && bw ? `${aw > bw ? "+" : ""}${pct(((aw - bw) / bw) * 100, 0)}` : "–"]];
            }))} />
          <p className="text-[13px] leading-relaxed text-grey-600">g CO₂e per tonne-km. GLEC v3.2 Table 13 values come from TCI–IIMB Supply Chain Sustainability Lab research and include a 5% distance adjustment and the load factors shown in the calculator. Refrigerated road freight carries the production TEMT refrigeration uplift. Courier defaults (production TEMT): first and last mile {g(TEMT_COURIER.firstMile.wtt + TEMT_COURIER.firstMile.ttw)}, line haul {g(TEMT_COURIER.midMile.wtt + TEMT_COURIER.midMile.ttw)} g/t-km, and {TEMT_COURIER.transshipmentKgPerTonne} kg CO₂e per tonne per transshipment.</p>
          <Table head={["Electric truck class", "Energy proxy kWh/t-km", "At CEA grid, g/t-km"]} rows={ROAD_CLASSES.filter((item) => EV_ENERGY_PROXY_KWH_PER_TKM[item.id]).map((item) => [`${item.label} (${item.gvw})`, fmt(EV_ENERGY_PROXY_KWH_PER_TKM[item.id]!, 2), g(EV_ENERGY_PROXY_KWH_PER_TKM[item.id]! * INDIA_GRID_KG_PER_KWH)])} />
          <p className="text-[13px] text-grey-600">GLEC v3.2 Table 11 European/South American averages, used as proxies until Indian values are published. Enter measured kWh for primary data.</p>
        </div>
      )}
      {tab === "rail-air" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Rail", "WTT", "TTW", "WTW", "Source"]} right={1} rows={(Object.keys(RAIL_FACTORS) as FactorSetId[]).map((id) => [FACTOR_SETS[id].short, g(RAIL_FACTORS[id].wtt), g(RAIL_FACTORS[id].ttw), g(RAIL_FACTORS[id].wtt + RAIL_FACTORS[id].ttw), RAIL_FACTORS[id].ref])} />
          <Table head={["Air (GLEC v3.2)", "Haul", "WTT", "TTW", "WTW"]} right={2} rows={(Object.keys(GLEC_AIR) as (keyof typeof GLEC_AIR)[]).flatMap((service) => (["short", "long"] as const).map((haul) => [service === "unknown" ? "Unknown aircraft mix" : service === "belly" ? "Belly hold" : "Freighter", haul === "short" ? "≤ 1,500 km" : "> 1,500 km", g(GLEC_AIR[service][haul].wtt), g(GLEC_AIR[service][haul].ttw), g(GLEC_AIR[service][haul].wtt + GLEC_AIR[service][haul].ttw)]))} />
          <Table head={["Air (production TEMT)", "WTT", "TTW", "WTW"]} rows={(Object.keys(TEMT_AIR) as (keyof typeof TEMT_AIR)[]).map((scope) => [scope === "domestic" ? "Domestic" : "International", g(TEMT_AIR[scope].wtt), g(TEMT_AIR[scope].ttw), g(TEMT_AIR[scope].wtt + TEMT_AIR[scope].ttw)])} />
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km. GLEC air values already include the +95 km routing allowance; the production set adds 95 km to the great-circle distance.</p>
        </div>
      )}
      {tab === "sea" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Container trade lane", "Dry WTT", "Dry TTW", "Reefer WTT", "Reefer TTW"]} rows={TRADE_LANES.map((lane) => [lane.label, fmt(lane.dry.wtt, 1), fmt(lane.dry.ttw, 1), fmt(lane.reefer.wtt, 1), fmt(lane.reefer.ttw, 1)])} />
          <p className="text-[13px] text-grey-600">g CO₂e per TEU-km, GLEC v3.2 Table 18 end-user values (70% load factor, +15% distance adjustment included). Converted to tonne-km with the cargo per TEU you choose.</p>
          <Table head={["Vessel", "Size", "GLEC WTT", "GLEC TTW", "TEMT TTW"]} right={2} rows={VESSELS.map((vessel) => [vessel.type, vessel.size, vessel.glec ? fmt(vessel.glec.wtt, 1) : "–", vessel.glec ? fmt(vessel.glec.ttw, 1) : "–", vessel.temtTtw !== undefined ? g(vessel.temtTtw) : "–"])} />
          <p className="text-[13px] text-grey-600">g CO₂e per tonne-km. GLEC Tables 14–17 (VLSFO, IMO Fourth GHG Study basis) before the 15% distance adjustment TEMT applies to estimated routes. Production TEMT takes WTT as one fifth of TTW.</p>
        </div>
      )}
      {tab === "iww-hubs" && (
        <div className="grid gap-4 animate-fade">
          <Table head={["Inland vessel", "WTT", "TTW", "WTW"]} rows={IWW_VESSELS.map((vessel) => [vessel.label, g(vessel.f.wtt), g(vessel.f.ttw), g(vessel.f.wtt + vessel.f.ttw)])} />
          <Table head={["Logistics hub (GLEC v3.2 Table 3)", "Unit", "Ambient", "Mixed / temperature-controlled"]} right={2} rows={Object.values(HUB_TYPES).map((hub) => [hub.label, `kg CO₂e per ${hub.unit}`, fmt(hub.ambient, 1), fmt(hub.mixed, 1)])} />
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
          {Object.values(SOURCES).map((source) => (
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
