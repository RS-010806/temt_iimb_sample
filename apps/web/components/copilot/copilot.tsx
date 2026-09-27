"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, CircleAlert, Cpu, Mic, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { respond, suggestionsFor, type Block, type CopilotAction, type Pending } from "@/lib/copilot/agent";
import { askLocalModel } from "@/lib/copilot/local-llm";
import { emissionsText, fmt } from "@/lib/format";
import { MODE_LABELS, scopeOf, SCOPE_LABELS, type ShipmentRecord } from "@/lib/records";
import { actions, getState, hydrate, selectComputed, useStore } from "@/lib/store";
import { applyFilters, fiscalYears, totals } from "@/lib/analytics";
import { StageBar, BarList } from "../app/charts";
import { CalculationBasis } from "../app/basis";
import { cx } from "../ui";
import { startTour } from "./tour";

// ─── Global open API ───────────────────────────────────────────────────────

type OpenListener = (prompt?: string) => void;
const openListeners = new Set<OpenListener>();
export function openCopilot(prompt?: string) {
  openListeners.forEach((listener) => listener(prompt));
}

/** The landing page's live Copilot demo hides the floating launcher while it is on screen, so only one Copilot shows. */
const launcherListeners = new Set<(hidden: boolean) => void>();
export function setLauncherHidden(hidden: boolean) {
  launcherListeners.forEach((listener) => listener(hidden));
}

interface Message {
  id: number;
  role: "user" | "assistant";
  text?: string;
  blocks?: Block[];
  suggestions?: string[];
}

const STORAGE_KEY = "temt:copilot-chat";

// ─── Markdown-lite ─────────────────────────────────────────────────────────

function inline(value: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g;
  let last = 0, match: RegExpExecArray | null, index = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > last) parts.push(value.slice(last, match.index));
    if (match[1]) parts.push(<strong key={`${key}-${index++}`} className="font-semibold text-ink">{match[1]}</strong>);
    else parts.push(match[3]!.startsWith("/") ? <Link key={`${key}-${index++}`} href={match[3]!} className="font-semibold text-maroon-700 underline">{match[2]}</Link> : <a key={`${key}-${index++}`} href={match[3]} target="_blank" rel="noreferrer" className="font-semibold text-maroon-700 underline">{match[2]}</a>);
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push(value.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={`l${out.length}`} className={cx("my-1.5 grid gap-1 pl-5", list.ordered ? "list-decimal" : "list-disc")}>{list.items.map((item, i) => <li key={i}>{inline(item, `li${out.length}-${i}`)}</li>)}</Tag>);
    list = null;
  };
  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-•]\s+(.*)/), numbered = line.match(/^\s*\d+\.\s+(.*)/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flush();
      if (line.trim()) out.push(<p key={`p${i}`} className="[&+p]:mt-2">{inline(line, `p${i}`)}</p>);
    }
  });
  flush();
  return <div className="text-[14px] leading-relaxed text-grey-800">{out}</div>;
}

// ─── Block renderers ───────────────────────────────────────────────────────

function CalcCard({ block }: { block: Extract<Block, { type: "calc" }> }) {
  const { result, record } = block;
  const legs = result.legs;
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="bg-gradient-to-br from-maroon-800 to-maroon-950 px-4 py-3 text-white">
        <p className="truncate text-xs text-maroon-200">{block.title}</p>
        <p className="mt-1 flex items-baseline gap-1.5"><span className="num text-2xl font-bold">{emissionsText(result.wtwKg).split(" ")[0]}</span><span className="text-sm text-maroon-100">{emissionsText(result.wtwKg).split(" ").slice(1).join(" ")} well-to-wheel</span></p>
      </div>
      <div className="grid gap-3 p-4">
        <StageBar ttw={result.ttwKg} wtt={result.wttKg} hub={result.hubKg} compact />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <dt className="text-grey-600">Mode</dt><dd className="text-right font-semibold">{[...new Set(legs.map((leg) => MODE_LABELS[leg.mode]))].join(" + ")}</dd>
          <dt className="text-grey-600">Cargo · distance</dt><dd className="num text-right font-semibold">{fmt(result.cargoTonnes, 2)} t · {fmt(result.distanceKm, 0)} km</dd>
          <dt className="text-grey-600">Intensity</dt><dd className="num text-right font-semibold">{fmt(result.intensityG, 1)} g/t-km</dd>
          <dt className="text-grey-600">GHG scope</dt><dd className="text-right font-semibold">{SCOPE_LABELS[scopeOf(record, legs[0]?.method)].short}</dd>
          <dt className="text-grey-600">Data quality</dt><dd className="text-right font-semibold capitalize">{result.dataQuality}</dd>
        </dl>
        <CalculationBasis result={result} legMeta={record.legMeta} size="sm" />
        {block.notes.length > 0 && <ul className="grid gap-1 text-[12px] text-grey-600">{block.notes.map((note, i) => <li key={i} className="flex gap-1.5"><span aria-hidden="true">•</span>{note}</li>)}</ul>}
        {block.saved && <p className="flex items-center gap-1.5 text-xs font-semibold text-ok"><Check size={14} aria-hidden="true" /> Saved to shipments as {record.ref}</p>}
      </div>
    </div>
  );
}

function CompareCard({ block, onAction }: { block: Extract<Block, { type: "compare" }>; onAction: (action: CopilotAction) => void }) {
  const max = Math.max(...block.options.map((option) => option.kg));
  const best = block.options.find((option) => option.practical);
  const colors: Record<string, string> = { road: "var(--mode-road)", rail: "var(--mode-rail)", air: "var(--mode-air)", sea: "var(--mode-sea)" };
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="mb-3 text-sm font-bold">{block.title}</p>
      <ul className="grid gap-3">
        {block.options.map((option) => (
          <li key={option.id} className={cx(!option.practical && "opacity-60")}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
              <span className="font-semibold">{option.label}{option === best && <span className="badge badge-ok ml-2 !py-0 text-[10px]">Lowest</span>}{!option.practical && <span className="badge badge-stone ml-2 !py-0 text-[10px]">Not practical</span>}</span>
              <span className="num font-semibold">{emissionsText(option.kg)}</span>
            </div>
            <div className="h-2 rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, (option.kg / max) * 100)}%`, background: colors[option.id] }} /></div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-grey-600"><span className="truncate">{option.summary}</span>{option.practical && <button type="button" className="shrink-0 font-semibold text-maroon-700 hover:underline" onClick={() => onAction({ kind: "save", record: option.record, label: "Save" })}>Save</button>}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BlockView({ block, onAction }: { block: Block; onAction: (action: CopilotAction) => void }) {
  switch (block.type) {
    case "text": return <Markdown text={block.text} />;
    case "calc": return <CalcCard block={block} />;
    case "compare": return <CompareCard block={block} onAction={onAction} />;
    case "stats": return (
      <div className="grid grid-cols-3 gap-2">
        {block.items.map((item) => <div key={item.label} className="rounded-lg border border-stone-200 bg-white p-2.5"><p className="text-[11px] text-grey-600">{item.label}</p><p className="num mt-0.5 text-[15px] font-bold leading-tight">{item.value}</p>{item.sub && <p className="mt-0.5 text-[10.5px] text-grey-500">{item.sub}</p>}</div>)}
      </div>
    );
    case "bars": return <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-grey-600">{block.title}</p><BarList items={block.items} /></div>;
    case "list": return (
      <div className="grid gap-2">
        {block.title && <p className="text-xs font-bold uppercase tracking-wide text-grey-600">{block.title}</p>}
        {block.items.map((item, i) => <div key={i} className="rounded-lg border border-stone-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-semibold">{item.title}</p>{item.value && <p className="num shrink-0 text-[12.5px] font-bold text-maroon-700">{item.value}</p>}</div><p className="mt-1 text-[12px] leading-relaxed text-grey-600">{item.body}</p></div>)}
      </div>
    );
    case "steps": return (
      <ol className="grid gap-1.5 rounded-lg border border-stone-200 bg-white p-3 text-[12.5px]">
        <li className="text-[11px] font-bold uppercase tracking-wide text-grey-600">Plan</li>
        {block.steps.map((step, i) => <li key={i} className="flex items-center gap-2">{step.status === "done" ? <Check size={14} className="text-ok" aria-hidden="true" /> : <CircleAlert size={14} className="text-warn" aria-hidden="true" />}<span>{step.label}</span></li>)}
      </ol>
    );
    case "actions": return (
      <div className="flex flex-wrap gap-2">
        {block.actions.map((action, i) => <button key={i} type="button" className={cx("btn btn-sm", i === 0 ? "btn-primary" : "btn-secondary")} onClick={() => onAction(action)}>{action.label}</button>)}
      </div>
    );
  }
}

// ─── Panel ─────────────────────────────────────────────────────────────────

export function Copilot() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | undefined>();
  const [last, setLast] = useState<ShipmentRecord | undefined>();
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const counter = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engine = useStore((state) => state.settings.copilot);
  const pendingPrompt = useRef<string | undefined>(undefined);

  useEffect(() => {
    hydrate();
    try { const saved = sessionStorage.getItem(STORAGE_KEY); if (saved) { const parsed = JSON.parse(saved) as Message[]; setMessages(parsed); counter.current = parsed.length + 1; } } catch { /* storage blocked */ }
    setVoice(typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window));
  }, []);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch { /* storage blocked */ } }, [messages]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  const push = (message: Omit<Message, "id">) => setMessages((list) => [...list, { ...message, id: ++counter.current }]);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    push({ role: "user", text: message });
    setInput("");
    setBusy(true);
    try {
      const ctx = { pathname: window.location.pathname, pending, last, navigate: (href: string) => router.push(href) };
      let reply;
      if (engine.engine === "local-llm" && !pending) {
        try {
          const state = getState();
          const rows = selectComputed(state);
          const fy = fiscalYears(rows)[0];
          const t = totals(applyFilters(rows, { fy }));
          const history = messages.slice(-6).map((item) => ({ role: item.role, content: item.text ?? item.blocks?.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n") ?? "" }));
          const answer = await askLocalModel(engine, message, history, `${state.shipments.length} shipments; latest ${fy ?? "none"} total ${emissionsText(t.wtwKg)}; factor set ${state.settings.factorSet}; page ${ctx.pathname}`);
          reply = answer.instruction ? await respond(answer.instruction, ctx) : { blocks: [{ type: "text" as const, text: answer.content ?? "The local model returned no answer." }], suggestions: suggestionsFor(ctx.pathname) };
        } catch (error) {
          reply = await respond(message, ctx);
          reply.blocks.unshift({ type: "text", text: `Local model unavailable (${error instanceof Error ? error.message : "no response"}); answered with the built-in engine.` });
        }
      } else {
        reply = await respond(message, ctx);
      }
      setPending(reply.pending);
      if (reply.last) setLast(reply.last);
      push({ role: "assistant", blocks: reply.blocks, suggestions: reply.suggestions });
      if (reply.effects?.tour) { setOpen(false); setTimeout(() => startTour(), 500); }
      if (reply.effects?.exportFormat) {
        const { exportWorkspace } = await import("@/lib/exports");
        await exportWorkspace(reply.effects.exportFormat, { fy: reply.effects.exportFy });
      }
    } catch (error) {
      push({ role: "assistant", blocks: [{ type: "text", text: `Something went wrong: ${error instanceof Error ? error.message : "unknown error"}.` }] });
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [busy, pending, last, router, engine, messages]);

  useEffect(() => {
    const listener: OpenListener = (prompt) => { setOpen(true); if (prompt) pendingPrompt.current = prompt; setTimeout(() => inputRef.current?.focus(), 80); };
    openListeners.add(listener);
    return () => { openListeners.delete(listener); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);
  useEffect(() => { if (open && pendingPrompt.current && !busy) { const prompt = pendingPrompt.current; pendingPrompt.current = undefined; send(prompt); } }, [open, busy, send]);

  const onAction = (action: CopilotAction) => {
    if (action.kind === "navigate") router.push(action.href);
    else if (action.kind === "prompt") send(action.text);
    else if (action.kind === "save") {
      actions.addShipments([action.record]);
      push({ role: "assistant", blocks: [{ type: "text", text: `Saved as **${action.record.ref}**. [Open shipments](/app/shipments/)` }], suggestions: ["Summarise my footprint", "Compare other modes"] });
    } else if (action.kind === "export") import("@/lib/exports").then(({ exportWorkspace }) => exportWorkspace(action.format, { fy: action.fy }));
    else if (action.kind === "tour") { setOpen(false); startTour(); }
    else if (action.kind === "clear") { actions.clearShipments(); push({ role: "assistant", blocks: [{ type: "text", text: "Workspace cleared. Your settings are unchanged." }] }); }
    else if (action.kind === "sample") send(`load sample ${action.sector} data`);
  };

  const listen = () => {
    const Recognition = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript; if (transcript) setInput(transcript); };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const suggestions = messages.length ? messages[messages.length - 1]?.suggestions ?? [] : suggestionsFor(pathname);
  const onApp = pathname.startsWith("/app");
  const [launcherHidden, setHidden] = useState(false);
  useEffect(() => { launcherListeners.add(setHidden); return () => { launcherListeners.delete(setHidden); }; }, []);
  useEffect(() => { setHidden(false); }, [pathname]);

  return (
    <>
      {!open && !onApp && !launcherHidden && (
        <button type="button" onClick={() => setOpen(true)} data-tour="copilot-launcher" aria-label="Open TEMT Copilot"
          className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-gradient-to-br from-maroon-600 to-maroon-800 py-3 pl-3.5 pr-4 text-white shadow-[var(--shadow-float)] transition hover:-translate-y-0.5 hover:shadow-2xl">
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-white/15"><Sparkles size={16} aria-hidden="true" /><span className="absolute inset-0 animate-ping rounded-full bg-white/20 [animation-duration:2.6s]" /></span>
          <span className="text-sm font-semibold">Ask TEMT</span>
        </button>
      )}
      {open && (
        <section role="dialog" aria-label="TEMT Copilot" className="fixed inset-x-2 bottom-2 top-16 z-[70] flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-paper shadow-2xl animate-rise sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[min(720px,calc(100dvh-100px))] sm:w-[440px]">
          <header className="flex items-center gap-3 bg-gradient-to-r from-maroon-800 via-maroon-700 to-maroon-800 px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/12"><Sparkles size={18} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">TEMT Copilot</p>
              <p className="flex items-center gap-1 text-[11px] text-maroon-100">{engine.engine === "local-llm" ? <><Cpu size={11} aria-hidden="true" /> Local model · {engine.model}</> : <><ShieldCheck size={11} aria-hidden="true" /> Runs in your browser · data stays with you</>}</p>
            </div>
            <button type="button" className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => { setMessages([]); setPending(undefined); setLast(undefined); }} aria-label="New conversation" title="New conversation"><RotateCcw size={16} /></button>
            <button type="button" className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label="Close Copilot"><X size={18} /></button>
          </header>
          <div ref={scroller} className="scroll-thin flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="animate-rise">
                <p className="display text-[22px] text-maroon-800">How can I help?</p>
                <p className="mt-2 text-sm leading-relaxed text-grey-700">Ask in plain English. I can calculate a shipment from a sentence, compare modes, analyse your footprint, find reductions, export reports, explain any term, or take you on a tour.</p>
                <div className="mt-4 grid gap-2">
                  {[["Calculate", "20 t Mumbai to Delhi by 32 ft truck"], ["Compare", "Compare 25 t Chennai to Kolkata"], ["Analyse", "Summarise my footprint"], ["Learn", "What is Scope 3 Category 4?"]].map(([tag, prompt]) => (
                    <button key={prompt} type="button" onClick={() => send(prompt!)} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm transition hover:border-maroon-300 hover:bg-maroon-50">
                      <span className="badge badge-maroon !text-[10px]">{tag}</span><span className="text-grey-800">{prompt}</span>
                    </button>
                  ))}
                  <button type="button" onClick={() => send("Give me a tour")} className="flex items-center gap-3 rounded-xl border border-dashed border-maroon-300 bg-maroon-50/50 px-3 py-2.5 text-left text-sm font-semibold text-maroon-800 hover:bg-maroon-50"><Sparkles size={15} aria-hidden="true" /> Take the guided tour</button>
                </div>
              </div>
            )}
            <div className="grid gap-4">
              {messages.map((message) => (
                <Fragment key={message.id}>
                  {message.role === "user" ? (
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-maroon-700 px-3.5 py-2 text-[14px] text-white animate-fade">{message.text}</div>
                  ) : (
                    <div className="grid max-w-full gap-2.5 animate-rise">{message.blocks?.map((block, i) => <BlockView key={i} block={block} onAction={onAction} />)}</div>
                  )}
                </Fragment>
              ))}
              {busy && <div className="flex items-center gap-1.5 px-1" aria-label="Copilot is thinking">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-maroon-400" style={{ animationDelay: `${i * 120}ms` }} />)}</div>}
            </div>
          </div>
          {suggestions.length > 0 && !busy && (
            <div className="scroll-thin flex gap-2 overflow-x-auto border-t border-stone-200 bg-white px-3 pt-2.5">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1 text-[12.5px] font-semibold text-grey-700 transition hover:border-maroon-300 hover:text-maroon-700">{suggestion}</button>)}
            </div>
          )}
          <form className="flex items-end gap-2 bg-white p-3" onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <textarea ref={inputRef} rows={1} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Message the Copilot"
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input); } }}
              placeholder={pending ? "Type the missing detail…" : "Ask or instruct, e.g. “export Excel for FY 2025–26”"}
              className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5" />
            {voice && <button type="button" className={cx("btn btn-secondary btn-icon", listening && "!border-maroon-400 !text-maroon-700")} onClick={listen} aria-label="Speak your question" title="Speak"><Mic size={16} /></button>}
            <button type="submit" className="btn btn-primary btn-icon" disabled={!input.trim() || busy} aria-label="Send"><ArrowUp size={17} /></button>
          </form>
        </section>
      )}
    </>
  );
}

interface SpeechLike {
  lang: string;
  interimResults: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
}
