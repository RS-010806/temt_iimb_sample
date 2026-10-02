import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Cpu, FileSpreadsheet, GitBranch, Landmark, Layers, MapPin, ShieldCheck, Upload } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { ComparisonTeaser } from "@/components/marketing/sections";
import { JsonLd, breadcrumbs, pageMetadata } from "@/components/seo";

export const metadata: Metadata = pageMetadata({
  title: "Why TEMT",
  description: "Why Indian companies choose TEMT for freight emissions: India-specific factors from IIM Bangalore research, ISO 14083 certification, DPIIT adoption, multimodal transport chains, e-way bill import, BRSR-ready reports and a private AI Copilot.",
  path: "/why-temt/",
});

const PILLARS = [
  { icon: MapPin, title: "Indian from the ground up", body: "Emission factors for Indian truck classes, terrain and fuel mix come from IIM Bangalore's own research, with Indian PIN codes, e-way bills, financial years and ₹ built in." },
  { icon: BadgeCheck, title: "Certified methodology", body: "TEMT was the first platform in India certified to ISO 14083 (December 2024), and its information security is certified to ISO/IEC 27001:2022 by SGS." },
  { icon: Landmark, title: "Government adoption", body: "TEMT is adopted by DPIIT, Ministry of Commerce and Industry, hosted on DPIIT's platform and integrated with the Unified Logistics Interface Platform (ULIP)." },
  { icon: GitBranch, title: "True transport chains", body: "Legs and hubs, fuel- and energy-based methods, courier three-leg models, sea routing and inland waterways: the full ISO 14083 structure, not just a tonne-km multiplier." },
  { icon: Upload, title: "Your data, as it already is", body: "Import bulk templates from earlier TEMT versions, GST e-way bill JSON or a simple CSV. Distances come from city names and PIN codes; every row is validated before saving." },
  { icon: FileSpreadsheet, title: "Reports people can use", body: "PDF, Excel and Word reports with factor sources, data quality, GHG scopes and BRSR Principle 6 mapping; CSV, JSON and Power BI with the same leg-level figures." },
  { icon: Cpu, title: "A Copilot that stays private", body: "Calculate, compare, analyse, export and learn in plain English. It runs in the browser, and can use a local AI model on your own computer instead of a cloud AI service." },
  { icon: Layers, title: "Transparent and auditable", body: "Every result records its activity, distance type, factor source and data quality, the disclosures ISO 14083 asks for, and every factor is versioned in the library." },
];

export default function WhyTemtPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([["Home", "/"], ["Why TEMT", "/why-temt/"]])} />
      <Header />
      <main id="main" className="bg-paper">
        <section className="bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 py-16 text-white md:py-24">
          <div className="container-page max-w-4xl">
            <p className="eyebrow eyebrow-light">Why TEMT</p>
            <h1 className="display mt-3 text-[40px] md:text-[56px]">The freight emissions tool built in India, for India.</h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-maroon-100">Global calculators bring international methods; ESG platforms bring reporting workflows. TEMT brings both to Indian freight, with the research, certification and government adoption behind it.</p>
          </div>
        </section>
        <section className="container-page py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div key={pillar.title} className="rounded-2xl border border-stone-200 bg-white p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-maroon-700 text-white"><Icon size={20} aria-hidden="true" /></span>
                  <h2 className="mt-4 text-[17px] font-bold">{pillar.title}</h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-grey-700">{pillar.body}</p>
                </div>
              );
            })}
          </div>
        </section>
        <ComparisonTeaser />
        <section className="container-page py-16">
          <div className="grid gap-8 rounded-3xl border border-stone-200 bg-white p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
            <div>
              <p className="eyebrow">For NIFTY 500 sustainability, logistics and finance teams</p>
              <h2 className="display mt-3 text-[32px]">What a first month with TEMT looks like</h2>
              <ol className="mt-6 grid gap-4">
                {["Week 1: import last year's freight from TMS exports, e-way bills or old TEMT files; check the auto-estimated distances.", "Week 2: replace default factors with fuel records from your top carriers; the data-quality share rises.", "Week 3: review hotspots, compare modes on the heaviest lanes and model levers in the planner.", "Week 4: export the BRSR-ready report and Power BI pack; set next year's target."].map((line) => <li key={line} className="flex gap-3 text-[15px] leading-relaxed"><span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-maroon-600 text-white"><Check size={12} aria-hidden="true" /></span>{line}</li>)}
              </ol>
            </div>
            <div className="grid content-start gap-3 rounded-2xl bg-maroon-50 p-6">
              <ShieldCheck size={26} className="text-maroon-700" aria-hidden="true" />
              <p className="text-[15px] leading-relaxed text-maroon-900">Developed by the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore. For enterprise onboarding, <a href="mailto:scmc.office@iimb.ac.in?subject=TEMT%20enterprise%20onboarding" className="font-semibold underline">email the lab</a>.</p>
              <Link prefetch={false} href="/app/" className="btn btn-primary mt-2">Open TEMT <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
