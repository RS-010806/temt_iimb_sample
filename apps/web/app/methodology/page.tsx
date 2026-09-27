import type { Metadata } from "next";
import Link from "next/link";
import { AIR_DISTANCE_ADJUSTMENT_KM, CIRCUITY, ENGINE_V2_VERSION, FACTOR_SETS, FUELS, GLEC_AIR, HUB_TYPES, INDIA_GRID_KG_PER_KWH, RAIL_FACTORS, REEFER_UPLIFT, ROAD_CLASSES, ROAD_FACTORS, SEA_DISTANCE_ADJUSTMENT, SOURCES } from "@temt/calculator";
import { Footer, Header } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Methodology and factors", description: "How TEMT calculates freight emissions: ISO 14083 structure, GLEC Framework v3.2 Indian factors, calculation methods, data quality and GHG Protocol scopes." };

const g = (kg: number) => (kg * 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 });

export default function MethodologyPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-paper">
        <section className="bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 py-16 text-white md:py-20">
          <div className="container-page max-w-4xl">
            <p className="eyebrow eyebrow-light">Methodology · engine {ENGINE_V2_VERSION}</p>
            <h1 className="display mt-3 text-[40px] md:text-[54px]">Know what goes into every number.</h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-maroon-100">TEMT follows ISO 14083:2023 and the GLEC Framework v3.2. Every emission is a published factor applied to an explicit input, and every step is shown in the calculation trace.</p>
          </div>
        </section>
        <article className="container-page prose-temt max-w-4xl py-14">
          <h2>Principles</h2>
          <ul>
            <li><strong>Transport chains.</strong> A shipment is a sequence of transport operations (legs) and hub operations (terminals, warehouses, cross-docks), as ISO 14083 defines a transport chain element.</li>
            <li><strong>Well-to-wheel.</strong> Every leg is reported as tank-to-wheel (vehicle operation) plus well-to-tank (producing and delivering the energy). Hubs are reported as totals because default values are published that way.</li>
            <li><strong>Traceable.</strong> Each result carries its factor, source, table reference, uplifts, data-quality label and a step-by-step trace.</li>
            <li><strong>Versioned.</strong> Factor sets can be switched without changing inputs, so years can be restated and records reconciled.</li>
          </ul>

          <h2>The calculation</h2>
          <p><code>Emissions (kg CO₂e) = cargo (t) × distance (km) × intensity (kg CO₂e per t-km)</code> for the distance-based method, applied separately to the WTT and TTW parts of the factor.</p>
          <p><code>Emissions = fuel quantity × fuel emission factor × allocation share</code> for the fuel-based method, and <code>Emissions = electricity (kWh) × grid or supplier factor × allocation share</code> for electric vehicles. Shipment totals sum unrounded leg and hub results. Intensity is total emissions divided by total tonne-kilometres.</p>

          <h2>Factor sets</h2>
          {Object.values(FACTOR_SETS).map((set) => <p key={set.id}><strong>{set.label}.</strong> {set.description}</p>)}

          <h3>Road (g CO₂e per tonne-km, well-to-wheel)</h3>
          <div className="table-wrap not-prose my-4">
            <table className="table"><thead><tr><th>Vehicle class</th><th>Payload</th><th className="right">Load factor</th><th className="right">GLEC diesel</th><th className="right">Production TEMT diesel</th></tr></thead>
              <tbody>{ROAD_CLASSES.map((item) => { const a = ROAD_FACTORS["glec-india"][item.id]?.diesel, b = ROAD_FACTORS["temt-legacy"][item.id]?.diesel; return <tr key={item.id}><td className="font-semibold">{item.label}, {item.gvw} GVW</td><td>{item.payload}</td><td className="right num">{Math.round(item.loadFactor * 100)}%</td><td className="right num">{a ? g(a.wtt + a.ttw) : "–"}</td><td className="right num">{b ? g(b.wtt + b.ttw) : "–"}</td></tr>; })}</tbody></table>
          </div>
          <p>GLEC v3.2 Table 13 publishes these Indian intensities from TCI–IIMB Supply Chain Sustainability Lab research, including a 5% distance adjustment. Petrol and CNG values exist for some classes. Refrigerated road legs are multiplied by {REEFER_UPLIFT}, the production TEMT uplift.</p>

          <h3>Rail, air, sea, inland waterways and hubs</h3>
          <ul>
            <li><strong>Rail:</strong> Indian average for mixed diesel and electric traction, {g(RAIL_FACTORS["glec-india"].wtt + RAIL_FACTORS["glec-india"].ttw)} g/t-km (GLEC v3.2).</li>
            <li><strong>Air:</strong> short-haul (≤1,500 km) and long-haul, by freighter, belly hold or unknown mix; for example unknown short-haul {g(GLEC_AIR.unknown.short.wtt + GLEC_AIR.unknown.short.ttw)} g/t-km. Distance is the great-circle distance; GLEC values include the +{AIR_DISTANCE_ADJUSTMENT_KM} km routing allowance, which the production set adds explicitly.</li>
            <li><strong>Sea:</strong> container end-user factors by trade lane (per TEU-km, converted with the chosen cargo per TEU), or IMO-based vessel types and sizes. Non-container values are multiplied by {SEA_DISTANCE_ADJUSTMENT} when the distance is an estimated shortest route.</li>
            <li><strong>Inland waterways:</strong> GLEC motor vessel, convoy, tanker and container vessel categories, based mainly on European operations.</li>
            <li><strong>Hubs:</strong> GLEC Table 3, for example transshipment {HUB_TYPES.transshipment.ambient} kg CO₂e per tonne, warehouse {HUB_TYPES.warehouse.ambient} kg per tonne and intermodal terminals {HUB_TYPES["container-terminal"].ambient} kg per container.</li>
          </ul>

          <h3>Fuels and electricity</h3>
          <p>Fuel-based calculations use GLEC v3.2 Indian fuel factors: diesel {FUELS.diesel.ttw} kg CO₂e per kg tank-to-wheel and {FUELS.diesel.wtw} well-to-wheel (density {FUELS.diesel.density} kg/l), petrol and CNG likewise; marine and aviation fuels follow GLEC Module 1. Electricity uses the Central Electricity Authority CO₂ Baseline Database V21.0 all-India weighted average, {INDIA_GRID_KG_PER_KWH} kg CO₂ per kWh for FY 2024–25, unless you enter your supplier's factor.</p>

          <h2>Distances</h2>
          <p>When you give a city or 6-digit PIN code, TEMT estimates distance from coordinates: road as straight-line distance × {CIRCUITY.road}, rail × {CIRCUITY.rail}, calibrated on Indian corridors. Air uses the great-circle distance between airports. Sea uses the shortest path through a sea-lane network, which routes west-to-east coast voyages around Sri Lanka. Estimates are typically within 10–15%; actual distances from your systems or e-way bills should replace them where available, and the ledger records which basis was used.</p>

          <h2>Data quality</h2>
          <p>Each leg is labelled <strong>primary</strong> (measured fuel or electricity, or a carrier-specific intensity), <strong>modelled</strong> or <strong>default</strong> (published factor). Reports show the share of emissions on each basis, and the shipment inherits its weakest leg's label.</p>

          <h2>Scopes and BRSR</h2>
          <p>Following the GHG Protocol, legs on your own fleet are Scope 1 (fuel) or Scope 2 (electricity for your EVs); transport your company buys is Scope 3 Category 4; transport of sold products paid for by customers is Scope 3 Category 9. Reports map these to SEBI's BRSR Principle 6, where Scope 3 is a leadership indicator, with intensity per tonne-km and per ₹ crore of revenue.</p>

          <h2>Limitations</h2>
          <ul>
            <li>Default factors describe typical operations; carrier-specific data is more accurate.</li>
            <li>Indian electric-truck energy defaults are not yet published; TEMT uses GLEC European proxies for trucks above 3.5 t and requires measured energy for lighter vehicles.</li>
            <li>Mode comparisons are emissions-only and assume drayage distances; check capacity, transit time and cost before switching modes.</li>
            <li>Production TEMT's ISO 14083 methodology validation and ISO/IEC 27001:2022 certification apply to that platform and their stated scope.</li>
          </ul>

          <h2>Compared with production TEMT</h2>
          <p>This version reproduces production TEMT's calculations exactly under the production factor set (for example the live Delhi–Bengaluru road and rail comparisons), and adds: GLEC v3.2 India defaults, fuel- and energy-based methods, hub operations beyond courier transshipment, inland waterways, container trade lanes, sea routing, data-quality labels, GHG scope classification and BRSR mapping. It also corrects one label: production TEMT lists bulk-carrier size bands as “Crude tanker”; they are mapped to bulk carriers.</p>

          <h2>Sources</h2>
          <ul>{Object.values(SOURCES).map((source) => <li key={source.id}>{source.publisher} ({source.year}). <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>.{source.note ? ` ${source.note}` : ""}</li>)}</ul>
          <h3>Location data</h3>
          <p>Cities and PIN codes: GeoNames (CC BY 4.0). Airports: OurAirports (public domain). Company directory: NSE Indices NIFTY 500 constituent list, retrieved 14 September 2026; company names personalise the workspace and do not indicate customers or company emissions.</p>
          <div className="not-prose mt-10 flex flex-wrap gap-3"><Link prefetch={false} href="/app/factors/" className="btn btn-primary">Browse every factor</Link><Link prefetch={false} href="/app/calculate/" className="btn btn-secondary">Try a calculation</Link></div>
        </article>
      </main>
      <Footer />
    </>
  );
}
