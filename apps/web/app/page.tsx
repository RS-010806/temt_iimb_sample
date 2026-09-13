import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Check, ChevronRight, FileCheck2, Layers3, ShieldCheck } from 'lucide-react';
import { Header, Footer } from '@/components/site-chrome';
import { ModeExplorer, SectorExplorer, PipelinePreview, ReportingPreview } from '@/components/landing-interactions';
import { CinematicHero } from '@/components/cinematic-hero';

export default function HomePage() {
  return <>
    <Header />
    <main id="main" className="landing-page">
      <CinematicHero />

      <section className="trust-strip" aria-label="Institutional origins and methodology">
        <div className="page-width trust-inner"><div className="trust-intro">Built on research.<br /><strong>Grounded in India.</strong></div>
          <a href="https://www.iimb.ac.in/tci-supply-chain-sustainability-lab" target="_blank" rel="noreferrer" className="trust-brand"><span className="trust-wordmark iim-wordmark">IIM BANGALORE</span><span>RESEARCH & DEVELOPMENT</span></a>
          <a href="https://www.iimb.ac.in/tci-supply-chain-sustainability-lab" target="_blank" rel="noreferrer" className="trust-brand"><span className="trust-wordmark tci-wordmark">TCI<span className="tci-line" /></span><span>TCI–IIMB SUSTAINABILITY LAB</span></a>
          <a href="https://www.iimb.ac.in/node/14281" target="_blank" rel="noreferrer" className="trust-brand"><span className="trust-wordmark">DPIIT <ArrowUpRight size={17}/></span><span>DOCUMENTED PRODUCT ADOPTION</span></a>
          <a href="https://dpiit.freightemissions.com/certification.pdf" target="_blank" rel="noreferrer" className="trust-brand"><span className="trust-wordmark iso-wordmark"><ShieldCheck size={25} strokeWidth={1.5}/> ISO 14083</span><span>TEMT v1.3 METHODOLOGY VALIDATION</span></a>
        </div>
      </section>

      <section id="platform" className="platform-section section-padding page-width">
        <div className="section-heading"><div><p className="eyebrow">02 / ONE VIEW OF YOUR FREIGHT</p><h2>Every mode.<br /><span className="muted-heading">Nothing lost in transit.</span></h2></div><p>Road, rail, air, ocean. Connect the legs of your transport chain to see where emissions happen and where a different choice could matter.</p></div>
        <ModeExplorer />
        <div className="capability-footnotes"><span><Check size={15}/> Multi-leg shipment calculations</span><span><Check size={15}/> India-specific road and rail factors</span><span><Check size={15}/> Traceable, exportable results</span></div>
      </section>

      <section id="industries" className="sector-section">
        <div className="page-width section-padding"><div className="section-heading"><div><p className="eyebrow">03 / YOUR INDUSTRY. YOUR VARIABLES.</p><h2>Built for the way<br />India does business.</h2></div><p>Start with an operating context you recognize. Explore a sector scenario, then make it your own with shipment-level inputs.</p></div><SectorExplorer /></div>
      </section>

      <section id="workflow" className="workflow-section page-width section-padding">
        <div className="workflow-copy"><p className="eyebrow">04 / FROM SPREADSHEET TO SIGNAL</p><h2>Your data in.<br /><span className="muted-heading">Clarity out.</span></h2><p>A useful footprint starts with a traceable process. Watch shipment records become a decision-ready view, with every factor and exception visible.</p><ul className="check-list"><li><Check size={17}/> Validate each shipment and transport leg</li><li><Check size={17}/> Apply documented, versioned emission factors</li><li><Check size={17}/> Carry the calculation trail into your reports</li></ul><Link prefetch={false} className="button button-dark" href="/demo/">Open the working demo <ArrowUpRight size={17}/></Link><p className="small-note">Sample data. Real calculations. No account required.</p></div>
        <PipelinePreview />
      </section>

      <section className="reporting-section">
        <div className="page-width reporting-inner"><div className="reporting-heading"><p className="eyebrow light">05 / READY FOR THE NEXT CONVERSATION</p><h2>From operations.<br />To the boardroom.</h2><p>Give sustainability, finance, and logistics teams a shared view of freight emissions. Drill into the detail, then take the evidence with you.</p><Link prefetch={false} className="text-link light-link" href="/demo/">Explore sample analytics <ArrowUpRight size={18}/></Link></div>
          <ReportingPreview />
        </div>
        <div className="page-width reporting-features"><article><span className="feature-num">01</span><div><h3>See the whole network</h3><p>Compare modes, subsidiaries, and months. Move from the group view to individual shipment legs.</p><Link prefetch={false} href="/demo/">Explore sample analytics <ArrowUpRight size={14}/></Link></div><Layers3 size={25}/></article><article><span className="feature-num">02</span><div><h3>Keep the evidence attached</h3><p>Export inputs, calculations, factor versions, and assumptions together in CSV and PDF.</p><a href="/downloads/temt-example-report.pdf" download>Download an example report <ArrowUpRight size={14}/></a></div><FileCheck2 size={25}/></article><article><span className="feature-num">03</span><div><h3>Take it into Power BI</h3><p>Structured data, field definitions, Power Query guidance, and DAX measures. Ready to import.</p><a href="/downloads/temt-power-bi-pack.zip" download>Get the Power BI pack <ArrowUpRight size={14}/></a></div><span className="powerbi-bars" aria-hidden="true"><i/><i/><i/></span></article></div>
      </section>

      <section className="context-section page-width section-padding"><div className="context-stat"><p className="eyebrow">THE SCALE OF THE OPPORTUNITY</p><span className="huge-number">66<span>%</span></span><h3>of India’s freight activity<br />moves by road.</h3><p>A single modal decision can reshape a network’s footprint. Start by making that decision visible.</p><a className="source-link" href="https://www.niti.gov.in/sites/default/files/2026-02/Scenarios-Towards-Viksit-Bharat-and-Net-Zero-Sectoral-Insights-Transport.pdf" target="_blank" rel="noreferrer">NITI Aayog, 2025 baseline · published February 2026 <ArrowUpRight size={13}/></a></div><div className="cat-panel"><div className="cat-top"><span className="eyebrow">BEYOND THE SHIPMENT</span><span className="cat-mark">CAT</span></div><h2>A freight footprint.<br />A bigger picture.</h2><p>TEMT focuses on transportation. The related Carbon Accounting Tool extends the conversation to organizational Scope 1, 2, and 3 emissions.</p><div className="scope-chain"><span>Freight evidence</span><ChevronRight size={17}/><span>Corporate reporting</span></div><a className="text-link" href="https://www.iimb.ac.in/node/11573" target="_blank" rel="noreferrer">Discover Carbon Accounting Tool <ArrowUpRight size={18}/></a><p className="small-note">Freight estimates support the reporting process. They do not, on their own, establish BRSR compliance.</p></div></section>

      <section className="buyer-questions page-width"><div><p className="eyebrow">BEFORE YOU GO DEEPER</p><h2>A few useful<br/>answers.</h2><p>Clear boundaries make better decisions.</p></div><div className="question-list"><details><summary>Can I try it with my own shipment data?<span>+</span></summary><p>Yes. Import up to 1,000 shipment legs using the CSV template in the demo, or edit the sample records. Processing runs in memory. The preview does not retain shipment data, and browser processing is available if the API is waking up. <Link prefetch={false} href="/demo/">Open the demo →</Link></p></details><details><summary>Is this the certified production TEMT engine?<span>+</span></summary><p>This is an authorized product preview with a separate demonstration engine and published GLEC defaults. SGS validated the existing TEMT v1.3 methodology against ISO 14083:2023. That validation does not certify calculations from this preview. <Link prefetch={false} href="/methodology/">See the methodology →</Link></p></details><details><summary>How does the Power BI integration work?<span>+</span></summary><p>Download an import pack containing calculated shipment records, field definitions, Power Query instructions and DAX measures. Import it into your own Power BI workspace. The preview does not require Power BI credentials or provide a live enterprise connection.</p></details><details><summary>How do we move from a scenario to production?<span>+</span></summary><p>Use the preview to define your operating questions, modes and data requirements. Then contact the TEMT team to discuss the production platform and your network. Operational decisions still need review of routes, rail capacity, service levels and cost. <a href="https://iimb.freightemissions.com/register">Access production TEMT →</a></p></details></div></section>

      <section className="final-cta"><div className="page-width"><p className="eyebrow">YOUR NEXT SHIPMENT IS A NEW OPPORTUNITY.</p><h2>Make it an<br /><span>informed one.</span></h2><p className="final-description">Start with a scenario. Leave with a clearer decision.</p><div className="final-actions"><Link prefetch={false} href="/demo/" className="button button-dark">Run your scenario <ArrowUpRight size={19}/></Link><a href="mailto:aditya.gupta@iimb.ac.in?subject=TEMT%20enterprise%20walkthrough" className="text-link">Discuss your network <ArrowUpRight size={18}/></a></div><span className="cta-corner" aria-hidden="true">↗</span></div></section>
    </main>
    <Footer />
  </>;
}
