"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Calculator, ChevronDown, Compass, FileText, Mail, PlayCircle, Search, Sparkles, Upload } from "lucide-react";
import { ARTICLES, searchKnowledge, type Article } from "@/lib/copilot/knowledge";
import { PageHeader, cx } from "../../ui";
import { openCopilot } from "../../copilot/copilot";
import { startTour } from "../../copilot/tour";

function Body({ text }: { text: string }) {
  return (
    <div className="grid gap-2 text-[14px] leading-relaxed text-grey-700">
      {text.split("\n").filter(Boolean).map((line, i) => {
        const html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^\s*(?:[-•]|\d+\.)\s+/, "");
        return /^\s*(?:[-•]|\d+\.)\s+/.test(line) ? <p key={i} className="flex gap-2"><span aria-hidden="true" className="text-maroon-600">•</span><span dangerouslySetInnerHTML={{ __html: html }} /></p> : <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

function Accordion({ article }: { article: Article }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>{article.title}<ChevronDown size={17} className={cx("shrink-0 text-grey-500 transition", open && "rotate-180")} aria-hidden="true" /></button>
      {open && (
        <div className="border-t border-stone-200 px-5 py-4 animate-fade">
          <Body text={article.body} />
          {article.actions?.length ? <div className="mt-4 flex flex-wrap gap-2">{article.actions.map((action) => action.href ? <Link key={action.label} href={action.href} className="btn btn-secondary btn-sm">{action.label}</Link> : null)}</div> : null}
        </div>
      )}
    </div>
  );
}

export function HelpView() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? searchKnowledge(query, 8).map((hit) => hit.article) : null), [query]);
  const groups: [string, Article["kind"]][] = [["How to", "howto"], ["Concepts", "concept"], ["About TEMT", "product"]];
  return (
    <div>
      <PageHeader eyebrow="Help" title="Help, guides and the tour" description="Everything you need to go from first shipment to board-ready report." />
      <section className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 p-7 text-white">
          <p className="eyebrow eyebrow-light">New here?</p>
          <h2 className="display mt-2 text-[30px]">Take the guided tour</h2>
          <p className="mt-3 max-w-lg text-[15px] text-maroon-100">Fourteen steps across the overview, calculator, comparisons, chains, import, reports and planner, with sample data loaded if your workspace is empty.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-light" onClick={() => startTour()}><Compass size={17} aria-hidden="true" /> Start the tour</button>
            <button type="button" className="btn btn-outline-light" onClick={() => openCopilot()}><Sparkles size={17} aria-hidden="true" /> Ask the Copilot</button>
            <Link prefetch={false} href="/tour/" className="btn btn-outline-light"><PlayCircle size={17} aria-hidden="true" /> Watch the video</Link>
          </div>
        </div>
        <div className="card card-pad">
          <p className="eyebrow">Quick start</p>
          <ol className="mt-4 grid gap-4">
            {[[Calculator, "Calculate a shipment", "Mode, route, weight. The result is live.", "/app/calculate/"], [Upload, "Import your data", "TEMT template, old TEMT files or e-way bills.", "/app/import/"], [FileText, "Export a report", "PDF, Excel, Word, CSV, JSON or Power BI.", "/app/reports/"]].map(([Icon, title, body, href], index) => {
              const I = Icon as typeof Calculator;
              return (
                <li key={String(title)}><Link href={String(href)} className="flex items-start gap-3 rounded-lg p-1 transition hover:bg-stone-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-maroon-50 text-maroon-600"><I size={17} aria-hidden="true" /></span><span><span className="block font-semibold">{index + 1}. {String(title)}</span><span className="text-[13px] text-grey-600">{String(body)}</span></span></Link></li>
              );
            })}
          </ol>
        </div>
      </section>
      <div className="relative mb-6"><Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-grey-400" aria-hidden="true" /><input className="input !min-h-[50px] pl-11 text-[15px]" placeholder="Search help: e-way bill, Scope 3, BRSR, refrigerated, factor set…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search help" /></div>
      {results ? (
        <div className="grid gap-3">{results.length ? results.map((article) => <Accordion key={article.id} article={article} />) : <p className="text-sm text-grey-600">No articles match. Try the Copilot, which can also answer from your own data.</p>}</div>
      ) : (
        <div className="grid gap-8">
          {groups.map(([title, kind]) => (
            <section key={kind}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><BookOpen size={18} className="text-maroon-600" aria-hidden="true" />{title}</h2>
              <div className="grid gap-3 md:grid-cols-2">{ARTICLES.filter((article) => article.kind === kind).map((article) => <Accordion key={article.id} article={article} />)}</div>
            </section>
          ))}
        </div>
      )}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-6">
        <div><p className="font-bold">Talk to the TEMT team</p><p className="text-[13.5px] text-grey-600">TCI–IIMB Supply Chain Sustainability Lab, Indian Institute of Management Bangalore.</p></div>
        <a href="mailto:aditya.gupta@iimb.ac.in?subject=TEMT%20enquiry" className="btn btn-primary"><Mail size={16} aria-hidden="true" /> Email the team</a>
      </section>
    </div>
  );
}
