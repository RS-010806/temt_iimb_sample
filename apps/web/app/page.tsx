import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Check, ChevronRight, FileCheck2, Layers3, ShieldCheck } from 'lucide-react';
import { Header, Footer } from '@/components/site-chrome';
import { HeroSimulator, ModeExplorer, SectorExplorer, PipelinePreview } from '@/components/landing-interactions';

export default function HomePage() {
  return <>
    <Header />
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <picture><source media="(max-width: 700px)" srcSet="/images/freight-port-mobile.avif"/><img className="hero-image" src="/images/freight-port-desktop.avif" width="1600" height="1067" alt="Container stacks and gantry cranes at a freight terminal" fetchPriority="high" decoding="async" /></picture>
        <div className="hero-scrim" />
        <div className="hero-inner page-width">
          <div className="hero-copy">
            <div className="eyebrow light"><span className="status-dot" /> FOR THE ENTERPRISES MOVING INDIA</div>
            <h1 id="hero-title">Freight decisions.<br /><span>Backed by <br />carbon data.</span></h1>
            <p className="hero-description">From the first mile to the boardroom. Understand your freight footprint, compare the alternatives, and make every shipment count.</p>
            <div className="hero-actions"><Link prefetch={false} className="button button-orange" href="/demo/">Run your scenario <ArrowUpRight size={18} /></Link><a className="text-link light-link" href="#platform">Explore the platform <ArrowRight size={17} /></a></div>
            <div className="hero-audience"><span>NIFTY 500</span><span>SUSTAINABILITY</span><span>SUPPLY CHAIN</span></div>
          </div>
          <HeroSimulator />
        </div>
        <div className="hero-bottom page-width"><span>TRANSPORTATION EMISSIONS MEASUREMENT TOOL</span><span>01 / MEASURE THE POSSIBILITIES <span className="scroll-line" /></span></div>
      </section>

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
          <div className="reporting-features"><article><span className="feature-num">01</span><div><h3>See the whole network</h3><p>Compare modes, subsidiaries, and months. Move from the group view to individual shipment legs.</p></div><Layers3 size={25}/></article><article><span className="feature-num">02</span><div><h3>Keep the evidence attached</h3><p>Export inputs, calculations, factor versions, and assumptions together in CSV and PDF. <a href="/downloads/temt-example-report.pdf" download>Download an example report ↗</a></p></div><FileCheck2 size={25}/></article><article><span className="feature-num">03</span><div><h3>Take it into Power BI</h3><p>Download the import pack with structured data, field definitions, Power Query guidance, and DAX measures. <a href="/downloads/temt-power-bi-pack.zip" download>Get the Power BI pack ↗</a></p></div><span className="powerbi-bars" aria-hidden="true"><i/><i/><i/></span></article></div>
        </div>
      </section>

      <section className="context-section page-width section-padding"><div className="context-stat"><p className="eyebrow">THE SCALE OF THE OPPORTUNITY</p><span className="huge-number">66<span>%</span></span><h3>of India’s freight activity<br />moves by road.</h3><p>A single modal decision can reshape a network’s footprint. Start by making that decision visible.</p><a className="source-link" href="https://www.niti.gov.in/sites/default/files/2026-02/Scenarios-Towards-Viksit-Bharat-and-Net-Zero-Sectoral-Insights-Transport.pdf" target="_blank" rel="noreferrer">NITI Aayog, 2025 baseline · published February 2026 <ArrowUpRight size={13}/></a></div><div className="cat-panel"><div className="cat-top"><span className="eyebrow">BEYOND THE SHIPMENT</span><span className="cat-mark">CAT</span></div><h2>A freight footprint.<br />A bigger picture.</h2><p>TEMT focuses on transportation. The related Carbon Accounting Tool extends the conversation to organizational Scope 1, 2, and 3 emissions.</p><div className="scope-chain"><span>Freight evidence</span><ChevronRight size={17}/><span>Corporate reporting</span></div><a className="text-link" href="https://www.iimb.ac.in/node/11573" target="_blank" rel="noreferrer">Discover Carbon Accounting Tool <ArrowUpRight size={18}/></a><p className="small-note">Freight estimates support the reporting process. They do not, on their own, establish BRSR compliance.</p></div></section>

      <section className="final-cta"><div className="page-width"><p className="eyebrow">YOUR NEXT SHIPMENT IS A NEW OPPORTUNITY.</p><h2>Make it an<br /><span>informed one.</span></h2><div className="final-actions"><Link prefetch={false} href="/demo/" className="button button-dark">Run your scenario <ArrowUpRight size={19}/></Link><a href="mailto:aditya.gupta@iimb.ac.in?subject=TEMT%20enterprise%20walkthrough" className="text-link">Discuss your network <ArrowUpRight size={18}/></a></div><span className="cta-corner" aria-hidden="true">↗</span></div></section>
    </main>
    <Footer />
  </>;
}
