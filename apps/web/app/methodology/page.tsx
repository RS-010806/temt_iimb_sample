import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Gauge, Landmark, Lock, Route, Truck, Zap } from "lucide-react";
import { ENGINE_V2_VERSION, INDIA_GRID_KG_PER_KWH, SOURCES } from "@temt/calculator";
import { Footer, Header } from "@/components/site-chrome";
import { JsonLd, ORGANIZATION, SITE_URL, breadcrumbs, pageMetadata } from "@/components/seo";

export const metadata: Metadata = pageMetadata({
  title: "Methodology",
  description: "How TEMT measures freight emissions: ISO 14083 transport chains, well-to-wheel results, India-specific emission factors from IIM Bangalore, distance types, data quality, GHG Protocol scopes and BRSR mapping.",
  path: "/methodology/",
});

const STEPS = [
  { icon: Route, title: "Build the transport chain", body: "A shipment is split into legs (road, rail, air, sea, waterway) and hub operations such as terminals and warehouses, as ISO 14083 defines them." },
  { icon: Truck, title: "Establish the activity", body: "Tonnes moved over the distance travelled, or better, the fuel or electricity actually used, which counts as primary data." },
  { icon: Gauge, title: "Apply India-specific intensity", body: "The emission intensity for that vehicle class, fuel, train, aircraft or vessel, from TEMT's validated factor library." },
  { icon: Zap, title: "Report well-to-wheel", body: "Emissions from operating the vehicle (tank-to-wheel) plus producing and delivering its energy (well-to-tank), in CO₂ equivalent." },
];

const GOVERNANCE = [
  { icon: BadgeCheck, title: "ISO 14083:2023", body: "TEMT was the first platform in India certified to the international standard for transport-chain emissions (December 2024)." },
  { icon: Lock, title: "ISO/IEC 27001:2022", body: "TEMT's information security management system is certified by SGS." },
  { icon: Landmark, title: "DPIIT and ULIP", body: "Adopted by the Department for Promotion of Industry and Internal Trade; TEMT's emission factors API is integrated with the Unified Logistics Interface Platform." },
  { icon: Building2, title: "IIM Bangalore", body: "Developed by the TCI–IIMB Supply Chain Sustainability Lab, part of the Supply Chain Management Centre." },
];

export default function MethodologyPage() {
  return (
    <>
      <Header />
      <JsonLd data={[breadcrumbs([["Home", "/"], ["Methodology", "/methodology/"]]), {
        "@context": "https://schema.org", "@type": "TechArticle", headline: "How TEMT measures freight emissions", url: `${SITE_URL}/methodology/`,
        description: "TEMT quantifies freight emissions to ISO 14083:2023 with India-specific emission factors developed at IIM Bangalore.",
        about: ["ISO 14083", "Freight emissions", "Scope 3 Category 4", "BRSR Principle 6"], inLanguage: "en-IN", image: `${SITE_URL}/og.png`,
        author: ORGANIZATION, publisher: ORGANIZATION,
      }]} />
      <main id="main" className="bg-paper">
        <section className="bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 py-16 text-white md:py-20">
          <div className="container-page max-w-4xl">
            <p className="eyebrow eyebrow-light">Methodology</p>
            <h1 className="display mt-3 text-[40px] md:text-[54px]">How TEMT measures freight emissions.</h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-maroon-100">TEMT quantifies emissions to ISO 14083:2023, the international standard for transport chains, using India-specific emission factors developed at IIM Bangalore. Every result states the basis an auditor needs to check it.</p>
          </div>
        </section>

        <section className="container-page max-w-5xl py-14">
          <h2 className="display text-[30px]">From a shipment to a number</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-maroon-700 text-white"><Icon size={19} aria-hidden="true" /></span><span className="text-[12px] font-bold uppercase tracking-[0.12em] text-maroon-700">Step {index + 1}</span></div>
                  <h3 className="mt-4 text-[16px] font-bold">{step.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-grey-700">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <article className="container-page prose-temt max-w-4xl pb-6">
          <h2>Emission factors</h2>
          <p>TEMT uses its own India-specific emission factors, developed from research at the TCI–IIMB Supply Chain Sustainability Lab and validated through TEMT's ISO 14083 certification. They cover seven Indian truck classes on diesel, petrol, CNG and electricity, Indian Railways' mixed diesel and electric traction, domestic and international air cargo, and coastal and international shipping. Electric vehicles use the Central Electricity Authority's all-India grid factor ({INDIA_GRID_KG_PER_KWH} kg CO₂ per kWh, CO₂ Baseline Database V21.0) unless you enter your supplier's factor.</p>
          <p>Where TEMT does not publish its own value, for example container trade lanes, inland waterways and most hub operations, it uses the ISO 14083-aligned international defaults of the GLEC Framework v3.2. Every value, with its source and version, is listed in the factor library inside TEMT.</p>

          <h2>Distances</h2>
          <p>ISO 14083 asks for the distance type to be stated. Road, rail, waterway and sea legs use the <strong>shortest feasible distance (SFD)</strong>; air legs use the <strong>great-circle distance (GCD)</strong> between airports. When you give a city or 6-digit PIN code, TEMT estimates the distance with a model calibrated on Indian corridors, typically within 10–15%. Actual distances from your systems or e-way bills replace estimates, and every leg records which type was used.</p>

          <h2>Data quality</h2>
          <p>Each leg is labelled <strong>primary</strong> (measured fuel or electricity, or a carrier-specific intensity), <strong>modelled</strong> or <strong>default</strong> (a published factor). Reports show the share of emissions on each basis, and a shipment inherits the label of its weakest leg.</p>

          <h2>Scopes and BRSR</h2>
          <p>Following the GHG Protocol, legs on your own fleet are Scope 1 (fuel) or Scope 2 (electricity for your EVs); transport your company buys is Scope 3 Category 4; transport of sold products paid for by customers is Scope 3 Category 9. Reports map these to SEBI's BRSR Principle 6, with intensity per tonne-km and per ₹ crore of revenue.</p>

          <h2>What each report discloses</h2>
          <p>In line with ISO 14083's reporting requirements, TEMT's reports state the services covered, total and per-mode emissions and intensities, transport activity, the distance type per mode, hub activity, the factor sources used and the share of primary data. Detailed modelling parameters are documented for assurance providers on request.</p>
        </article>

        <section className="container-page max-w-5xl py-10">
          <h2 className="display text-[30px]">Certification and governance</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GOVERNANCE.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-stone-200 bg-white p-5">
                  <Icon size={22} className="text-maroon-700" aria-hidden="true" />
                  <h3 className="mt-3 text-[15px] font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-grey-700">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <article className="container-page prose-temt max-w-4xl pb-16">
          <h2>Limitations</h2>
          <ul>
            <li>Default factors describe typical operations; fuel records or carrier-specific data are more accurate and raise the primary-data share.</li>
            <li>Indian energy-intensity data for electric trucks above 3.5 tonnes is not yet published; TEMT uses international proxies and recommends entering measured charging energy.</li>
            <li>Mode comparisons cover emissions only; check capacity, transit time and cost before switching modes.</li>
          </ul>

          <h2>Sources</h2>
          <ul>{Object.values(SOURCES).map((source) => <li key={source.id}>{source.publisher} ({source.year}). <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>.</li>)}</ul>
          <p>Location data: GeoNames (CC BY 4.0) for cities and PIN codes; OurAirports (public domain) for airports. Company directory: NSE Indices NIFTY 500 constituents, retrieved 14 September 2026. Calculation engine {ENGINE_V2_VERSION}.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link prefetch={false} href="/app/factors/" className="btn btn-primary">Open the factor library <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link prefetch={false} href="/app/calculate/" className="btn btn-secondary">Try a calculation</Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
