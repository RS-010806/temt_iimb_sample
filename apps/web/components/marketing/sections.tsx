"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { respond, type Block, type CopilotAction } from "@/lib/copilot/agent";
import type { ShipmentRecord } from "@/lib/records";
import { actions } from "@/lib/store";
import { BlockView, openCopilot } from "../copilot/copilot";
import { ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, Braces, Calculator, Check, ChevronDown, Database, FileArchive, FileSpreadsheet, FileText, FileType2, GitBranch, Landmark, Layers, Lock, PlayCircle, Route, ScrollText, Sheet, ShieldCheck, Sparkles, Target, Upload, X } from "lucide-react";
import { AnimatedNumber, Reveal, cx, useInView } from "../ui";

export function SectionHeading({ eyebrow, title, body, center = false, light = false }: { eyebrow: string; title: ReactNode; body?: ReactNode; center?: boolean; light?: boolean }) {
  return (
    <Reveal className={cx("max-w-3xl", center && "mx-auto text-center")}>
      <p className={cx("eyebrow", light && "eyebrow-light")}>{eyebrow}</p>
      <h2 className={cx("display mt-3 text-[34px] sm:text-[44px]", light ? "text-white" : "text-ink")}>{title}</h2>
      {body && <p className={cx("mt-4 text-[17px] leading-relaxed", light ? "text-maroon-100" : "text-grey-700")}>{body}</p>}
    </Reveal>
  );
}

const CREDENTIALS = [
  { icon: BadgeCheck, title: "First in India to certify its platform to ISO 14083", body: "TEMT's methodology was validated by SGS against ISO 14083:2023, the international standard for transport-chain emissions.", href: "https://dpiit.freightemissions.com/certification.pdf" },
  { icon: Lock, title: "ISO/IEC 27001:2022 information security", body: "Production TEMT's information security management system is certified by SGS.", href: "https://www.iimb.ac.in/node/11590" },
  { icon: Landmark, title: "Adopted by DPIIT and integrated with ULIP", body: "Hosted on the Department for Promotion of Industry and Internal Trade platform as a national digital resource.", href: "https://www.iimb.ac.in/node/14281" },
  { icon: ScrollText, title: "The source of GLEC's Indian road factors", body: "GLEC Framework v3.2 publishes Indian truck intensities from TCI–IIMB Supply Chain Sustainability Lab research.", href: "https://smartfreightcentre.org/news/13311209" },
];

export function Credentials() {
  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="container-page grid gap-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-grey-600 sm:col-span-2 lg:col-span-4">Credentials held by the production TEMT platform (iimb.freightemissions.com)</p>
        {CREDENTIALS.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal key={item.title} delay={index * 90}>
              <a href={item.href} target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-2xl border border-stone-200 p-5 transition hover:-translate-y-1 hover:border-maroon-300 hover:shadow-[var(--shadow-float)]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-maroon-50 text-maroon-600 transition group-hover:bg-maroon-600 group-hover:text-white"><Icon size={21} aria-hidden="true" /></span>
                <h3 className="mt-4 text-[15px] font-bold leading-snug">{item.title}</h3>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-grey-600">{item.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-maroon-700">Source <ArrowUpRight size={13} aria-hidden="true" /></span>
              </a>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function Counter({ value, suffix, decimals = 0 }: { value: number; suffix: string; decimals?: number }) {
  const [ref, visible] = useInView<HTMLSpanElement>(0.4);
  return <span ref={ref}><AnimatedNumber value={visible ? value : 0} duration={1400} format={(v) => `${v.toFixed(decimals)}${suffix}`} /></span>;
}

export function ProblemStats() {
  const stats = [
    { value: 14, suffix: "%", label: "of India's greenhouse gas emissions come from transport", source: "IIM Bangalore" },
    { value: 40, suffix: "%", label: "of transport CO₂ comes from moving freight", source: "IIM Bangalore" },
    { value: 4, suffix: "×", label: "projected rise in transport emissions between 2016 and 2050 without intervention", source: "IIM Bangalore" },
    { value: 66, suffix: "%", label: "of India's freight activity moves by road", source: "NITI Aayog, 2026" },
  ];
  return (
    <section className="bg-paper py-20 md:py-28">
      <div className="container-page">
        <SectionHeading eyebrow="Why it matters" title={<>You can't reduce what you <span className="italic text-maroon-700">don't measure.</span></>} body="Freight sits in Scope 3 for most companies and in Scope 1 for fleet owners. SEBI's BRSR asks India's largest listed companies to disclose greenhouse gas emissions, with Scope 3 as a leadership indicator. Measurement is the first step, and it has to be credible." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 100} className="rounded-2xl border border-stone-200 bg-white p-6">
              <p className="display text-[52px] leading-none text-maroon-700"><Counter value={stat.value} suffix={stat.suffix} /></p>
              <p className="mt-4 text-[14.5px] leading-relaxed text-grey-800">{stat.label}</p>
              <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-grey-500">{stat.source}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const MODULES = [
  { icon: Calculator, title: "Calculate any shipment", body: "Road (7 truck classes, diesel, CNG, petrol or electric), courier and PTL, rail, air, sea and inland waterways. Road can also use measured fuel or electricity.", href: "/app/calculate/" },
  { icon: Route, title: "Compare modes door to door", body: "Road, rail with drayage, air via airports and coastal shipping via ports, ranked by emissions for the same cargo.", href: "/app/compare/" },
  { icon: GitBranch, title: "Build multimodal chains", body: "Legs and hubs, exactly as ISO 14083 defines a transport chain, with templates for intermodal, export, air express and courier.", href: "/app/chain/" },
  { icon: Upload, title: "Import in bulk", body: "TEMT template, your existing production TEMT files, or GST e-way bill JSON. Distances from city names or PIN codes.", href: "/app/import/" },
  { icon: BarChart3, title: "See the whole network", body: "Monthly trends, modes, business units, lanes, GHG scopes and data quality, filtered by financial year.", href: "/app/" },
  { icon: FileText, title: "Report in every format", body: "PDF, Excel and Word reports with methodology and BRSR mapping, plus CSV, JSON and a Power BI pack for your own tools.", href: "/app/reports/" },
  { icon: Target, title: "Plan reductions", body: "Rail shift, electric trucks, consolidation and loading levers, recalculated on your own shipments against your target.", href: "/app/planner/" },
  { icon: Sparkles, title: "Ask the Copilot", body: "Type “20 t Mumbai to Delhi by 32 ft truck” or “export Excel”. It calculates, compares, analyses and exports inside your browser, and can use a local AI model.", href: "/app/" },
  { icon: Layers, title: "Versioned factor library", body: "GLEC v3.2 India defaults or the production TEMT set, every value with its source table. Switch and restate instantly.", href: "/app/factors/" },
];

export function ProductModules() {
  return (
    <section id="product" className="scroll-mt-24 bg-white py-20 md:py-28">
      <div className="container-page">
        <SectionHeading eyebrow="The product" title="Everything from one shipment to a board report." body="One workspace for sustainability, logistics and finance teams. Nothing to install, no account needed to start, and your data stays in your browser." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={(index % 3) * 90}>
                <Link prefetch={false} href={item.href} className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-paper p-6 transition hover:-translate-y-1 hover:border-maroon-300 hover:bg-white hover:shadow-[var(--shadow-float)]">
                  <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-maroon-100/0 transition group-hover:bg-maroon-100/60" aria-hidden="true" />
                  <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-maroon-700 text-white shadow-[0_10px_24px_-12px_rgba(116,0,0,.8)]"><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="relative mt-5 text-[18px] font-bold">{item.title}</h3>
                  <p className="relative mt-2 flex-1 text-[14.5px] leading-relaxed text-grey-700">{item.body}</p>
                  <span className="relative mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-maroon-700">Open <ArrowRight size={14} className="transition group-hover:translate-x-1" aria-hidden="true" /></span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { n: "01", title: "Record", body: "Enter a shipment, build a chain, or import a year of LRs, TEMT files or e-way bills. TEMT locates cities, PIN codes, airports and ports and estimates distances.", icon: Database },
    { n: "02", title: "Calculate", body: "Each leg and hub is calculated well-to-wheel with Indian factors, split into tank-to-wheel and well-to-tank, labelled by data quality and GHG scope.", icon: Calculator },
    { n: "03", title: "Report and reduce", body: "Read the analysis, export in six formats (PDF, Excel and Word include the BRSR mapping), and plan reductions against a target, with every number traceable.", icon: FileText },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-24 relative overflow-hidden bg-maroon-950 py-20 text-white md:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_10%_0%,rgba(177,35,34,.45),transparent)]" />
      <div className="container-page relative">
        <SectionHeading light eyebrow="How it works" title="Three steps. Full traceability." body="ISO 14083 structure under the hood; a simple flow on the surface." />
        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div aria-hidden="true" className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-maroon-300/50 to-transparent md:block"><span className="flow-dot absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-sand" /></div>
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.n} delay={index * 150} className="relative">
                <span className="relative z-10 grid h-[72px] w-[72px] place-items-center rounded-2xl border border-white/15 bg-maroon-900 shadow-lg"><Icon size={28} className="text-maroon-100" aria-hidden="true" /></span>
                <p className="mt-6 font-mono text-[12px] text-sand">{step.n}</p>
                <h3 className="display mt-1 text-[28px]">{step.title}</h3>
                <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-maroon-100">{step.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
      <style>{`.flow-dot{animation:flow 5s cubic-bezier(.5,0,.5,1) infinite}@keyframes flow{0%{left:0%;opacity:0}10%{opacity:1}90%{opacity:1}100%{left:100%;opacity:0}}@media (prefers-reduced-motion:reduce){.flow-dot{display:none}}`}</style>
    </section>
  );
}

const SHOWCASE_PROMPTS = ["20 t Mumbai to Delhi by 32 ft truck", "Compare that with rail", "What is well-to-tank?"];

type ShowcaseMessage = { id: number; role: "user" | "assistant"; text?: string; blocks?: Block[] };

/** Runs the real Copilot agent in the visitor's browser: nothing here is pre-recorded. */
export function CopilotShowcase() {
  const [ref, visible] = useInView<HTMLDivElement>(0.3);
  const router = useRouter();
  const [messages, setMessages] = useState<ShowcaseMessage[]>([]);
  const [typing, setTyping] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [scripted, setScripted] = useState(false);
  const last = useRef<ShipmentRecord | undefined>(undefined);
  const counter = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, typing, busy]);

  const ask = useCallback(async (prompt: string) => {
    setMessages((list) => [...list, { id: ++counter.current, role: "user", text: prompt }]);
    setBusy(true);
    try {
      const reply = await respond(prompt, { pathname: "/", last: last.current, navigate: (href) => router.push(href) });
      if (reply.last) last.current = reply.last;
      setMessages((list) => [...list, { id: ++counter.current, role: "assistant", blocks: reply.blocks }]);
    } catch (error) {
      setMessages((list) => [...list, { id: ++counter.current, role: "assistant", text: error instanceof Error ? error.message : "Something went wrong." }]);
    } finally { setBusy(false); }
  }, [router]);

  useEffect(() => {
    if (!visible || scripted) return;
    setScripted(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    (async () => {
      for (const prompt of SHOWCASE_PROMPTS) {
        if (!reduced) for (let i = 1; i <= prompt.length && !cancelled; i += 1) { setTyping(prompt.slice(0, i)); await new Promise((r) => setTimeout(r, 38)); }
        if (cancelled) return;
        setTyping("");
        await ask(prompt);
        await new Promise((r) => setTimeout(r, reduced ? 0 : 1400));
      }
    })();
    return () => { cancelled = true; };
  }, [visible, scripted, ask]);

  const onAction = (action: CopilotAction) => {
    if (action.kind === "navigate") router.push(action.href);
    else if (action.kind === "prompt") void ask(action.text);
    else if (action.kind === "save") { actions.addShipments([action.record]); setMessages((list) => [...list, { id: ++counter.current, role: "assistant", text: `Saved ${action.record.ref} to your workspace. Open TEMT to see it.` }]); }
    else openCopilot();
  };

  return (
    <section className="bg-paper py-20 md:py-28">
      <div className="container-page grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="TEMT Copilot" title={<>An assistant that <span className="italic text-maroon-700">does the work</span>, not just the talking.</>} body="Ask in plain English, or speak. The Copilot calculates, compares, saves shipments, finds reductions, runs what-ifs, exports reports and explains every term, using the same engine as the rest of TEMT." />
          <ul className="mt-8 grid gap-3 text-[15px]">
            {["Runs entirely in your browser: shipment data never leaves your device", "Understands Indian freight language: 32 ft, MXL, PIN codes, quintals, FY 2025–26", "Remembers context: “compare that with rail” refers to your last shipment", "Multi-step: “load sample data, then export a PDF” runs as a plan", "Optional local AI model (Ollama or LM Studio) for open conversation; numbers always come from the TEMT engine"].map((line) => (
              <li key={line} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-maroon-600 text-white"><Check size={12} aria-hidden="true" /></span>{line}</li>
            ))}
          </ul>
        </div>
        <div ref={ref} className="flex h-[600px] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-float)]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-maroon-800 to-maroon-700 px-4 py-3 text-white">
            <Sparkles size={18} aria-hidden="true" />
            <div className="flex-1"><p className="text-sm font-bold">TEMT Copilot</p><p className="text-[11px] text-maroon-100">Live: the real Copilot, running in your browser</p></div>
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />Live</span>
          </div>
          <div ref={scroller} className="scroll-thin grid flex-1 content-start gap-3 overflow-y-auto bg-paper p-4" aria-live="polite">
            {messages.map((message) => message.role === "user" ? (
              <p key={message.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-maroon-700 px-3.5 py-2 text-[14px] text-white animate-rise">{message.text}</p>
            ) : (
              <div key={message.id} className="grid gap-2.5 animate-rise">{message.text ? <p className="text-[14px] text-grey-800">{message.text}</p> : message.blocks?.map((block, i) => <BlockView key={i} block={block} onAction={onAction} />)}</div>
            ))}
            {busy && <span className="flex gap-1 px-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-maroon-300" style={{ animationDelay: `${i * 120}ms` }} />)}</span>}
          </div>
          <form className="flex gap-2 border-t border-stone-200 p-3" onSubmit={(event) => { event.preventDefault(); if (input.trim() && !busy) { void ask(input.trim()); setInput(""); } }}>
            <input className="input flex-1" value={typing || input} readOnly={!!typing} onChange={(event) => setInput(event.target.value)} placeholder="Try your own: “compare 12 t Surat to Kolkata”" aria-label="Ask the Copilot" />
            <button type="submit" className="btn btn-primary" disabled={busy || !!typing || !input.trim()}>Ask</button>
          </form>
        </div>
      </div>
    </section>
  );
}

const FORMATS = [
  { icon: FileText, label: "PDF", body: "Board-ready report" },
  { icon: FileSpreadsheet, label: "Excel", body: "10 formatted sheets" },
  { icon: FileType2, label: "Word", body: "Editable narrative" },
  { icon: Sheet, label: "CSV", body: "Leg-level data" },
  { icon: Braces, label: "JSON", body: "For ERP and APIs" },
  { icon: FileArchive, label: "Power BI", body: "Star schema, DAX, theme" },
];

export function ReportsSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-page grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading eyebrow="Reports" title="From the dispatch desk to the boardroom." body="The PDF, Excel and Word reports carry the factor set and engine version, the data-quality split, a GHG Protocol scope table and a BRSR Principle 6 mapping. CSV, JSON and the Power BI pack carry the same leg-level figures with factor, scope and data quality, so every team reads one version of the truth." />
          <Link prefetch={false} href="/app/reports/" className="btn btn-primary btn-lg mt-8">See a sample report <ArrowRight size={17} aria-hidden="true" /></Link>
          <p className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[13.5px] font-semibold text-maroon-700">
            <span className="text-grey-600">Download samples:</span>
            <a href="/downloads/temt-sample-report.pdf" download className="hover:underline">PDF</a>
            <a href="/downloads/temt-sample-report.xlsx" download className="hover:underline">Excel</a>
            <a href="/downloads/temt-sample-report.docx" download className="hover:underline">Word</a>
            <a href="/downloads/temt-sample-power-bi.zip" download className="hover:underline">Power BI pack</a>
            <a href="/downloads/TEMT-import-template.xlsx" download className="hover:underline">Import template</a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FORMATS.map((format, index) => {
            const Icon = format.icon;
            return (
              <Reveal key={format.label} delay={index * 70} className="group rounded-2xl border border-stone-200 bg-paper p-5 text-center transition hover:-translate-y-1 hover:border-maroon-300 hover:bg-white">
                <span className="relative mx-auto grid h-16 w-14 place-items-center rounded-lg border border-stone-300 bg-white shadow-sm transition group-hover:rotate-[-4deg]"><span className="absolute right-0 top-0 h-4 w-4 rounded-bl-md border-b border-l border-stone-300 bg-stone-100" aria-hidden="true" /><Icon size={24} className="text-maroon-600" aria-hidden="true" /></span>
                <p className="mt-4 font-bold">{format.label}</p>
                <p className="text-[12.5px] text-grey-600">{format.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VideoSection() {
  return (
    <section className="bg-maroon-950 py-20 text-white md:py-28">
      <div className="container-page">
        <SectionHeading light center eyebrow="Video tour" title="See TEMT end to end." body="From a single shipment to a board report, with the Copilot along the way." />
        <Reveal className="mx-auto mt-10 max-w-5xl">
          <Link prefetch={false} href="/tour/" className="group relative block overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/video/temt-tour-poster.jpg" alt="TEMT product tour" className="aspect-video w-full object-cover transition duration-700 group-hover:scale-[1.02]" />
            <span className="absolute inset-0 grid place-items-center bg-maroon-950/30 transition group-hover:bg-maroon-950/10"><span className="grid h-20 w-20 place-items-center rounded-full bg-white text-maroon-700 shadow-2xl transition group-hover:scale-110"><PlayCircle size={40} aria-hidden="true" /></span></span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function ScopesSection() {
  const scopes = [
    { title: "Scope 1", tag: "Own fleet fuel", body: "Diesel, CNG or petrol burned in trucks you own or control.", tone: "bg-[#fbf1dc] text-warn" },
    { title: "Scope 2", tag: "Own EV electricity", body: "Grid electricity bought to charge your own electric vehicles.", tone: "bg-[#e8f0fa] text-[#1d5aa0]" },
    { title: "Scope 3 · Category 4", tag: "Transport you buy", body: "Inbound, outbound and inter-site freight paid for by your company.", tone: "bg-maroon-50 text-maroon-700" },
    { title: "Scope 3 · Category 9", tag: "Customer-paid delivery", body: "Downstream transport of sold products that your customers pay for.", tone: "bg-maroon-100 text-maroon-800" },
  ];
  return (
    <section className="bg-paper py-20 md:py-28">
      <div className="container-page">
        <SectionHeading eyebrow="Built for NIFTY 500 and BRSR" title="Every leg lands in the right scope, automatically." body="Tell TEMT who operates or pays for each shipment. It classifies every leg under the GHG Protocol and maps totals to BRSR Principle 6, with intensity per tonne-km and per ₹ crore of revenue." />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {scopes.map((scope, index) => (
            <Reveal key={scope.title} delay={index * 90} className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className={cx("badge !text-[12px]", scope.tone)}>{scope.tag}</span>
              <h3 className="display mt-4 text-[24px]">{scope.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-grey-700">{scope.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ComparisonTeaser() {
  const rows: [string, boolean | string, boolean | string, boolean | string][] = [
    ["Indian factors from the source research", true, "Partial", false],
    ["Platform certified to ISO 14083 in India", true, "Global", false],
    ["Adopted by the Government of India (DPIIT, ULIP)", true, false, false],
    ["Legs, hubs and multimodal chains", true, true, "Partial"],
    ["Reads production TEMT files and e-way bills", true, false, false],
    ["Copilot that runs in your browser, with an optional local AI model", true, false, "Cloud AI"],
    ["BRSR scope and Principle 6 mapping", true, false, true],
    ["Free to start, no account", true, "Limited", false],
  ];
  const cell = (value: boolean | string) => value === true ? <Check size={18} className="mx-auto text-ok" aria-label="Yes" /> : value === false ? <X size={18} className="mx-auto text-grey-400" aria-label="No" /> : <span className="text-[12.5px] font-semibold text-grey-600">{value}</span>;
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-page">
        <SectionHeading eyebrow="Why TEMT" title="Built for Indian freight, not adapted to it." body="Global freight calculators and ESG platforms each cover part of the job. TEMT combines Indian source factors, certified methodology and government adoption with enterprise reporting." />
        <Reveal className="mt-10 overflow-x-auto rounded-2xl border border-stone-200">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead><tr className="bg-stone-50 text-left"><th className="px-5 py-4 font-bold">Capability</th><th className="bg-maroon-700 px-5 py-4 text-center font-bold text-white">TEMT</th><th className="px-5 py-4 text-center font-bold">Global freight calculators</th><th className="px-5 py-4 text-center font-bold">ESG platforms</th></tr></thead>
            <tbody>{rows.map(([label, a, b, c]) => <tr key={label} className="border-t border-stone-200"><td className="px-5 py-3.5 font-semibold">{label}</td><td className="bg-maroon-50/50 px-5 py-3.5 text-center">{cell(a)}</td><td className="px-5 py-3.5 text-center">{cell(b)}</td><td className="px-5 py-3.5 text-center">{cell(c)}</td></tr>)}</tbody>
          </table>
        </Reveal>
        <Link prefetch={false} href="/why-temt/" className="btn btn-secondary mt-6">Read the full comparison <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

const FAQ = [
  { q: "Is TEMT free to use?", a: "Yes. Open the workspace and start calculating; no account is needed. For enterprise onboarding on the production platform, contact the TCI–IIMB Supply Chain Sustainability Lab." },
  { q: "Where is my data stored?", a: "In your own browser (IndexedDB). Nothing is uploaded unless you choose the server check or export a file. Download a backup to move your workspace to another device." },
  { q: "Which factors does TEMT use?", a: "By default the GLEC Framework v3.2 India defaults, whose Indian road intensities come from the TCI–IIMB Lab's own research. You can switch to the production TEMT factor set to reconcile with existing records. Every factor is listed with its source table." },
  { q: "Can I bring my existing TEMT data?", a: "Yes. The bulk importer reads the production TEMT bulk templates for road, courier, rail, air, coastal and international water, as well as GST e-way bill JSON and the new TEMT template." },
  { q: "Does this complete our BRSR?", a: "It covers freight: Scope 3 Categories 4 and 9 and own-fleet Scope 1 and 2, with a Principle 6 mapping. BRSR also needs your site-level emissions and other disclosures." },
  { q: "How accurate are estimated distances?", a: "Road and rail distances are estimated from city or PIN-code locations with network factors calibrated on Indian corridors, typically within 10–15%. Enter actual distances from your TMS or e-way bills whenever you have them." },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-paper py-20 md:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading eyebrow="Questions" title="Good questions, straight answers." />
        <div className="grid gap-3">
          {FAQ.map((item, index) => (
            <div key={item.q} className="rounded-2xl border border-stone-200 bg-white">
              <button type="button" className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-[16px] font-bold" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>{item.q}<ChevronDown size={18} className={cx("shrink-0 text-maroon-600 transition", open === index && "rotate-180")} aria-hidden="true" /></button>
              {open === index && <p className="px-6 pb-5 text-[15px] leading-relaxed text-grey-700 animate-fade">{item.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-maroon-700 via-maroon-800 to-maroon-950 py-20 text-white md:py-24">
      <svg aria-hidden="true" className="absolute -right-24 -top-24 h-[420px] w-[420px] text-white/[0.05]" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" /></svg>
      <div className="container-page relative flex flex-wrap items-end justify-between gap-8">
        <div className="max-w-2xl">
          <p className="eyebrow eyebrow-light">Start today</p>
          <h2 className="display mt-3 text-[40px] sm:text-[52px]">Your next shipment is a measurement opportunity.</h2>
          <p className="mt-4 text-[17px] text-maroon-100">Calculate one, import a year, or explore a sample. It takes a minute.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} href="/app/" className="btn btn-light btn-lg">Open TEMT <ArrowRight size={18} aria-hidden="true" /></Link>
          <a href="mailto:aditya.gupta@iimb.ac.in?subject=TEMT%20enterprise%20onboarding" className="btn btn-outline-light btn-lg"><ShieldCheck size={18} aria-hidden="true" /> Enterprise onboarding</a>
        </div>
      </div>
    </section>
  );
}
