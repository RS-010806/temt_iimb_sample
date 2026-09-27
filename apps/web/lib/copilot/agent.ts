import { calculateShipment, FACTOR_SETS, greatCircleKm, ROAD_CLASSES, seaRoute, type HubInput, type LegInput, type ShipmentResult } from "@temt/calculator";
import { applyFilters, byLane, byMode, byQuality, fiscalYears, insights, opportunities, totals } from "../analytics";
import { buildAlternatives, buildRecord, vehicleForTonnes } from "../builders";
import { emissionsText, fmt, pct } from "../format";
import { estimateDistance, hasCoords, nearestAirport, nearestIndianPort, resolvePlace, type Place, type PlaceKind } from "../places";
import { DEFAULT_LEVERS, runScenario, type Levers } from "../planner";
import { MODE_HEX, type LegMeta, type ShipmentRecord } from "../records";
import { makeSampleWorkspace, SAMPLE_SECTORS, type SampleSector } from "../sample-data";
import { actions, getState, selectComputed } from "../store";
import type { ExportFormat } from "../exports/common";
import { ARTICLES, searchKnowledge } from "./knowledge";
import { parse, splitSteps, type Intent, type Slots } from "./nlu";

export type CopilotAction =
  | { kind: "navigate"; href: string; label: string }
  | { kind: "prompt"; text: string; label: string }
  | { kind: "save"; record: ShipmentRecord; label: string }
  | { kind: "export"; format: ExportFormat; fy?: string; label: string }
  | { kind: "tour"; label: string }
  | { kind: "sample"; sector: SampleSector; label: string }
  | { kind: "clear"; label: string };

export type Block =
  | { type: "text"; text: string }
  | { type: "calc"; title: string; record: ShipmentRecord; result: ShipmentResult; notes: string[]; saved?: boolean }
  | { type: "compare"; title: string; options: { id: string; label: string; summary: string; kg: number; practical: boolean; record: ShipmentRecord }[] }
  | { type: "stats"; items: { label: string; value: string; sub?: string }[] }
  | { type: "bars"; title: string; items: { key: string; label: string; value: number; color: string; share?: number }[] }
  | { type: "list"; title?: string; items: { title: string; body: string; value?: string }[] }
  | { type: "steps"; steps: { label: string; status: "done" | "error" }[] }
  | { type: "actions"; actions: CopilotAction[] };

export interface Pending {
  intent: Intent;
  slots: Slots;
  missing: "tonnes" | "route";
}

export interface Reply {
  blocks: Block[];
  suggestions?: string[];
  pending?: Pending;
  /** The shipment this reply was about, so follow-ups like "compare that with rail" can refer to it. */
  last?: ShipmentRecord;
  effects?: { tour?: boolean; exportFormat?: ExportFormat; exportFy?: string };
}

export interface AgentContext {
  pathname: string;
  pending?: Pending;
  last?: ShipmentRecord;
  navigate: (href: string) => void;
}

const text = (value: string): Block => ({ type: "text", text: value });

export function suggestionsFor(pathname: string): string[] {
  if (pathname.startsWith("/app/calculate")) return ["18 t Bengaluru to Mumbai by 32 ft truck", "What is well-to-tank?", "How is air freight calculated?"];
  if (pathname.startsWith("/app/compare")) return ["Compare 25 t Chennai to Delhi", "Why is rail cleaner?", "Save the rail option"];
  if (pathname.startsWith("/app/import")) return ["What columns does the template need?", "Can I import e-way bills?", "Import my old TEMT templates"];
  if (pathname.startsWith("/app/reports")) return ["Export an Excel workbook", "How does this map to BRSR?", "Create a Power BI pack"];
  if (pathname.startsWith("/app/planner")) return ["What if we move 40% of long road hauls to rail?", "Do electric trucks help in India?", "Where can I reduce emissions?"];
  if (pathname.startsWith("/app/chain")) return ["What counts as a hub?", "How are courier shipments calculated?", "Compare 10 t Pune to Guwahati"];
  if (pathname.startsWith("/app/factors")) return ["Where do the Indian factors come from?", "Switch to the production TEMT factors", "What is ISO 14083?"];
  if (pathname.startsWith("/app")) return ["Summarise my footprint", "Where can I reduce emissions?", "Export a PDF report"];
  return ["What is TEMT?", "Calculate 10 t Pune to Delhi", "Give me a tour"];
}

function latestFy(): string | undefined {
  return fiscalYears(selectComputed(getState()))[0];
}

async function place(label: string | undefined, kinds: PlaceKind[]): Promise<Place | undefined> {
  if (!label) return undefined;
  const direct = await resolvePlace(label, kinds).catch(() => undefined);
  if (direct) return direct;
  // Fall back to the trailing words, so "ship Pune" or "our Hosur plant" still resolve.
  const words = label.split(/\s+/).filter((word) => !/^(plant|factory|warehouse|depot|dc|hub|office|our|the)$/i.test(word));
  for (const size of [2, 1]) {
    if (words.length < size) continue;
    const found = await resolvePlace(words.slice(-size).join(" "), kinds).catch(() => undefined);
    if (found) return found;
  }
  return undefined;
}

const SEA_LANE_BY_COUNTRY: Record<string, string> = { IN: "intra-me-india", AE: "intra-me-india", OM: "intra-me-india", SA: "intra-me-india", LK: "intra-me-india", BD: "intra-me-india",
  NL: "europe-me-india", BE: "europe-me-india", DE: "europe-me-india", GB: "europe-me-india", IT: "europe-me-india", ES: "europe-me-india", GR: "europe-me-india",
  SG: "asia-me-india", MY: "asia-me-india", CN: "asia-me-india", HK: "asia-me-india", KR: "asia-me-india", JP: "asia-me-india" };

/** Build a shipment from parsed slots. Returns a question when something essential is missing. */
async function buildFromSlots(slots: Slots): Promise<{ record?: ShipmentRecord; notes: string[]; ask?: Pending["missing"]; error?: string }> {
  const mode = slots.mode ?? "road";
  let tonnes = slots.tonnes;
  const notes: string[] = [];
  if (tonnes === undefined && slots.trips && mode === "road") {
    const vehicle = ROAD_CLASSES.find((item) => item.id === (slots.vehicleClass ?? "gvw-30-50"))!;
    tonnes = slots.trips * vehicle.payloadMaxT * vehicle.loadFactor;
    notes.push(`Estimated cargo: ${slots.trips} trips × ${vehicle.payloadMaxT} t payload × ${pct(vehicle.loadFactor * 100, 0)} average loading = ${fmt(tonnes, 1)} t.`);
  } else if (tonnes !== undefined && slots.trips && slots.trips > 1) {
    notes.push(`Treated ${fmt(tonnes, 2)} t as the total across ${slots.trips} trips.`);
  }
  if (tonnes === undefined && slots.litres === undefined && slots.kwh === undefined) return { notes, ask: "tonnes" };
  tonnes ??= 1;
  const kinds: PlaceKind[] = mode === "air" ? ["airport", "city", "pin"] : mode === "sea" ? ["port", "city", "pin"] : ["city", "pin"];
  const [from, to] = await Promise.all([place(slots.origin, kinds), place(slots.destination, kinds)]);
  if ((!slots.origin || !slots.destination) && slots.distanceKm === undefined && slots.litres === undefined && slots.kwh === undefined) return { notes, ask: "route" };
  if ((slots.origin && !from) || (slots.destination && !to)) {
    if (slots.distanceKm === undefined) return { notes, error: `I couldn't find ${!from ? `“${slots.origin}”` : `“${slots.destination}”`}. Try a city name, a 6-digit PIN code${mode === "air" ? " or an airport code such as BLR" : ""}, or add the distance in km.` };
  }
  const origin: Place = from ?? { label: slots.origin ?? "Origin", kind: "custom" };
  const destination: Place = to ?? { label: slots.destination ?? "Destination", kind: "custom" };
  const legs: LegInput[] = [];
  const legMeta: LegMeta[] = [];
  const hubs: HubInput[] = [];
  let kind: ShipmentRecord["kind"] = "single";
  const distance = (m: "road" | "rail" | "iww", a?: Place, b?: Place) => estimateDistance(m, a, b);

  if (mode === "courier") {
    kind = "courier";
    const mid = slots.distanceKm ?? distance("road", from, to)?.km;
    if (!mid) return { notes, ask: "route" };
    legs.push({ mode: "road", tonnes, distanceKm: 25, vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "first" }, { mode: "road", tonnes, distanceKm: Math.round(mid), vehicleClass: "gvw-20-30", fuel: "diesel", courierLeg: "mid" }, { mode: "road", tonnes, distanceKm: 25, vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "last" });
    legMeta.push({ from: origin, distanceMethod: "user" }, { distanceMethod: slots.distanceKm ? "user" : "road-estimate" }, { to: destination, distanceMethod: "user" });
    hubs.push({ type: "transshipment", tonnes, label: "Origin hub" }, { type: "transshipment", tonnes, label: "Destination hub" });
    notes.push("Courier model: 25 km first mile, line haul between hubs, 25 km last mile and two hub transshipments. Adjust in the transport chain builder.");
  } else if (mode === "air") {
    const [a, b] = await Promise.all([from && from.kind !== "airport" && hasCoords(from) ? nearestAirport(from) : from, to && to.kind !== "airport" && hasCoords(to) ? nearestAirport(to) : to]);
    const km = slots.distanceKm ?? (hasCoords(a) && hasCoords(b) ? greatCircleKm(a, b) : undefined);
    if (!km) return { notes, ask: "route" };
    legs.push({ mode: "air", tonnes, distanceKm: Math.round(km), airService: slots.airService ?? "unknown", airScope: a?.country && b?.country && (a.country !== "IN" || b.country !== "IN") ? "international" : "domestic" });
    legMeta.push({ from: a, to: b, distanceMethod: slots.distanceKm ? "user" : "great-circle" });
    if (a && b && (a !== from || b !== to)) notes.push(`Airport to airport: ${a.label} → ${b.label}. Road collection legs aren't included; use Compare modes for door to door.`);
  } else if (mode === "sea") {
    const a = from && from.kind !== "port" && hasCoords(from) ? nearestIndianPort(from) : from;
    const b = to && to.kind !== "port" && hasCoords(to) ? nearestIndianPort(to) : to;
    const route = a?.code && b?.code ? seaRoute(a.code, b.code) : undefined;
    const km = slots.distanceKm ?? route?.km;
    if (!km) return { notes, ask: "route" };
    legs.push({ mode: "sea", tonnes, distanceKm: Math.round(km), seaBasis: "lane", tradeLane: SEA_LANE_BY_COUNTRY[b?.country ?? "IN"] ?? "industry-average", containerType: slots.refrigerated ? "reefer" : "dry", tonnesPerTeu: 10 });
    legMeta.push({ from: a, to: b, distanceMethod: slots.distanceKm ? "user" : "sea-route" });
    if (route) notes.push(`Port to port: ${a!.label} → ${b!.label}, ${fmt(route.nauticalMiles, 0)} nautical miles.`);
  } else {
    const m = mode === "rail" ? "rail" : mode === "iww" ? "iww" : "road";
    const estimate = distance(m, from, to);
    const km = slots.distanceKm ?? estimate?.km;
    if (!km && slots.litres === undefined && slots.kwh === undefined) return { notes, ask: "route" };
    if (m === "road") {
      const vehicleClass = slots.vehicleClass ?? vehicleForTonnes(slots.trips ? tonnes / slots.trips : tonnes);
      const leg: LegInput = { mode: "road", tonnes, distanceKm: km ? Math.round(km) : undefined, vehicleClass, fuel: slots.fuel ?? "diesel", refrigerated: slots.refrigerated };
      if (slots.litres !== undefined) Object.assign(leg, { method: "fuel", fuelId: slots.fuel === "cng" ? "cng" : slots.fuel === "petrol" ? "petrol" : "diesel", fuelQuantity: slots.litres, fuelUnit: slots.fuel === "cng" ? "kg" : "l" });
      if (slots.kwh !== undefined) Object.assign(leg, { method: "energy", fuel: "electric", energyKwh: slots.kwh });
      legs.push(leg);
      if (!slots.vehicleClass) notes.push(`Truck class chosen for ${fmt(tonnes, 1)} t: ${ROAD_CLASSES.find((item) => item.id === vehicleClass)!.label} (${ROAD_CLASSES.find((item) => item.id === vehicleClass)!.gvw} GVW). Say “by 32 ft truck” or similar to change it.`);
    } else {
      legs.push({ mode: m, tonnes, distanceKm: Math.round(km!) });
      if (m === "rail") notes.push("Station to station only. Use Compare modes to include road drayage at each end.");
    }
    legMeta.push({ from, to, distanceMethod: slots.distanceKm ? "user" : estimate?.method ?? "user" });
    if (!slots.distanceKm && estimate) notes.push(estimate.note);
  }
  const record = buildRecord({ origin, destination, kind, legs, legMeta, hubs, source: "copilot" });
  return { record, notes };
}

function calcBlock(record: ShipmentRecord, notes: string[], saved: boolean): Block[] {
  const result = calculateShipment(record.input, getState().settings.factorSet);
  const blocks: Block[] = [{ type: "calc", title: `${record.origin.label} → ${record.destination.label}`, record, result, notes, saved }];
  if (!saved) blocks.push({ type: "actions", actions: [
    { kind: "save", record, label: "Save to shipments" },
    { kind: "prompt", text: `Compare ${fmt(result.cargoTonnes, 1)} t ${record.origin.label.replace(/^\d{6} · /, "")} to ${record.destination.label.replace(/^\d{6} · /, "")}`, label: "Compare modes" },
  ] });
  return blocks;
}

async function handle(raw: string, ctx: AgentContext, carried?: Pending): Promise<Reply> {
  const parsed = parse(raw);
  let { intent } = parsed;
  let slots = parsed.slots;
  if (carried) {
    // Follow-up answer: merge new details into the pending request.
    const merged: Slots = { ...carried.slots, ...Object.fromEntries(Object.entries(slots).filter(([, value]) => value !== undefined)) };
    if (carried.missing === "route" && !slots.origin) {
      const bits = raw.split(/\s+(?:to|and|->|→)\s+/i);
      if (bits.length === 2) { merged.origin = bits[0]!.replace(/^from\s+/i, "").trim(); merged.destination = bits[1]!.trim(); }
      else if (merged.origin && !merged.destination) merged.destination = raw.trim();
    }
    if (carried.missing === "tonnes" && merged.tonnes === undefined) { const n = Number(raw.replace(/[^\d.]/g, "")); if (n > 0) merged.tonnes = n; }
    slots = merged;
    if (intent === "unknown" || intent === "calculate" || intent === "add" || intent === "compare") intent = carried.intent;
  }
  // Fill a missing route and weight from the previous shipment for follow-ups and "compare that".
  const refersBack = /\b(that|this|it|same|previous|above|the shipment|the lane)\b/i.test(raw);
  if (ctx.last && !slots.origin && (intent === "followup" || ((intent === "compare" || intent === "calculate") && refersBack))) {
    const last = ctx.last;
    const clean = (place: Place) => (place.kind === "pin" && place.code ? place.code : place.label.replace(/ \([A-Z]{3}\)$/, ""));
    slots = { ...slots, origin: clean(last.origin), destination: clean(last.destination), tonnes: slots.tonnes ?? Math.max(...last.input.legs.map((leg) => leg.tonnes)) };
    if (intent === "followup") intent = slots.mode && /\bcompare\b/i.test(raw) ? "compare" : "calculate";
  }
  if (intent === "followup") intent = "calculate";
  const state = getState();
  const rows = selectComputed(state);
  const suggestions = suggestionsFor(ctx.pathname);

  switch (intent) {
    case "greeting":
      return { blocks: [text(`Namaste! I'm the TEMT Copilot. I work inside your browser, so your data stays with you. I can calculate shipments from a sentence, compare modes, analyse your footprint, find reductions and export reports. What would you like to do?`)], suggestions };
    case "thanks":
      return { blocks: [text("Happy to help. Anything else about your freight emissions?")], suggestions };
    case "capabilities": {
      const article = ARTICLES.find((item) => item.id === "copilot")!;
      return { blocks: [text(article.body)], suggestions: ["Give me a tour", "20 t Pune to Delhi by road", "Summarise my footprint", "Export a PDF report"] };
    }
    case "tour":
      if (!ctx.pathname.startsWith("/app")) ctx.navigate("/app/");
      if (!state.shipments.length) { const records = makeSampleWorkspace("fmcg"); actions.replaceAll(records, "Sample workspace for the guided tour"); actions.updateSettings({ onboarded: true, organisation: { name: SAMPLE_SECTORS.fmcg.company }, businessUnits: SAMPLE_SECTORS.fmcg.units }); }
      return { blocks: [text("Starting the guided tour. Use the arrow keys or the buttons to move between steps; press Esc to leave.")], effects: { tour: true } };
    case "navigate":
      if (slots.page) { ctx.navigate(slots.page); return { blocks: [text(`Opening ${slots.page === "/app/" ? "the overview" : slots.page.replace(/\/app\/|\//g, " ").trim()}.`)], suggestions }; }
      break;
    case "sample": {
      const sector = slots.sector ?? "fmcg";
      const records = makeSampleWorkspace(sector);
      actions.replaceAll(records, `Sample workspace: ${SAMPLE_SECTORS[sector].label}`);
      actions.updateSettings({ onboarded: true, organisation: { name: SAMPLE_SECTORS[sector].company }, businessUnits: SAMPLE_SECTORS[sector].units });
      if (!ctx.pathname.startsWith("/app")) ctx.navigate("/app/");
      return { blocks: [text(`Loaded ${records.length} sample shipments for a ${SAMPLE_SECTORS[sector].label} company across FY 2024–25 and FY 2025–26. Everything is synthetic; replace it with your own data any time.`)], suggestions: ["Summarise my footprint", "Where can I reduce emissions?", "Export a PDF report"] };
    }
    case "clear":
      if (!state.shipments.length) return { blocks: [text("Your workspace is already empty.")], suggestions };
      return { blocks: [text(`This removes all ${state.shipments.length} shipments from this browser. Settings are kept. Download a backup first if you may need them.`), { type: "actions", actions: [{ kind: "clear", label: "Clear workspace" }, { kind: "navigate", href: "/app/settings/#data", label: "Back up first" }] }] };
    case "factor-set": {
      const next = slots.factorSet!;
      const before = totals(rows).wtwKg;
      actions.updateSettings({ factorSet: next });
      const after = totals(selectComputed(getState())).wtwKg;
      return { blocks: [text(`Switched to **${FACTOR_SETS[next].label}**. All ${rows.length} shipments were recalculated; your inputs are unchanged.${rows.length ? ` Total footprint: ${emissionsText(before)} → ${emissionsText(after)}.` : ""}`)], suggestions };
    }
    case "export": {
      if (!rows.length) return { blocks: [text("There's nothing to export yet. Add a shipment, import a file or load sample data first.")], suggestions: ["Load sample data", "How do I import shipments?"] };
      const format = slots.format ?? "pdf";
      const fy = slots.fy ?? latestFy();
      return { blocks: [text(`Preparing your ${format === "powerbi" ? "Power BI pack" : format.toUpperCase()} for ${fy ?? "all periods"}. It downloads in a moment.`)], effects: { exportFormat: format, exportFy: fy }, suggestions: ["Export an Excel workbook", "Create a Power BI pack", "How does this map to BRSR?"] };
    }
    case "calculate":
    case "add": {
      const built = await buildFromSlots(slots);
      if (built.error) return { blocks: [text(built.error)], suggestions };
      if (built.ask === "tonnes") return { blocks: [text("How much cargo is it? For example “18 tonnes” or “750 kg”.")], pending: { intent, slots, missing: "tonnes" } };
      if (built.ask === "route") return { blocks: [text(slots.origin ? `Where is it going from ${slots.origin}?` : "From where to where? For example “from Pune to Delhi” or two PIN codes.")], pending: { intent, slots, missing: "route" } };
      const record = built.record!;
      try {
        const saved = intent === "add";
        if (saved) actions.addShipments([record]);
        const blocks = calcBlock(record, built.notes, saved);
        if (saved) blocks.push(text(`Saved as **${record.ref}**. It now appears in your shipments and reports.`));
        return { blocks, last: record, suggestions: ["Compare that with rail", "What about by air?", "What is well-to-tank?"] };
      } catch (error) {
        return { blocks: [text(error instanceof Error ? error.message : "That combination couldn't be calculated.")], suggestions };
      }
    }
    case "compare": {
      if (!slots.origin || !slots.destination) return { blocks: [text("Which route should I compare? For example “compare 20 t Chennai to Delhi”.")], pending: { intent, slots, missing: "route" } };
      const tonnes = slots.tonnes ?? 10;
      const [from, to] = await Promise.all([place(slots.origin, ["city", "pin"]), place(slots.destination, ["city", "pin"])]);
      if (!from || !to) return { blocks: [text(`I couldn't find ${!from ? `“${slots.origin}”` : `“${slots.destination}”`}. Try a city name or a 6-digit PIN code.`)], suggestions };
      const options = await buildAlternatives(from, to, tonnes, state.settings.factorSet, { refrigerated: slots.refrigerated });
      const practical = options.filter((option) => option.practical);
      const best = practical[0]!, road = options.find((option) => option.id === "road")!;
      const saving = road.result.wtwKg - best.result.wtwKg;
      const focus = slots.mode && slots.mode !== "courier" && slots.mode !== "iww" ? options.find((option) => option.id === slots.mode) : undefined;
      const focusLine = focus && focus.id !== "road" ? ` ${focus.label} comes to ${emissionsText(focus.result.wtwKg)}, ${focus.result.wtwKg <= road.result.wtwKg ? `${pct(((road.result.wtwKg - focus.result.wtwKg) / road.result.wtwKg) * 100, 0)} below` : `${pct(((focus.result.wtwKg - road.result.wtwKg) / road.result.wtwKg) * 100, 0)} above`} direct road.` : "";
      return { last: buildRecord({ origin: from, destination: to, kind: "single", legs: road.input.legs, legMeta: road.legMeta, source: "copilot" }), blocks: [
        { type: "compare", title: `${fmt(tonnes, 1)} t · ${from.label} → ${to.label}`, options: options.map((option) => ({ id: option.id, label: option.label, summary: option.summary, kg: option.result.wtwKg, practical: option.practical,
          record: buildRecord({ origin: from, destination: to, kind: option.input.legs.length > 1 ? "chain" : "single", legs: option.input.legs, legMeta: option.legMeta, hubs: option.input.hubs, source: "compare" }) })) },
        text(`${best.id === "road" ? "Direct road is the lowest-emission practical option for this pair." : `**${best.label}** is the lowest-emission practical option, ${pct((saving / road.result.wtwKg) * 100, 0)} below direct road (${emissionsText(saving)} less).`}${focusLine}${slots.tonnes === undefined ? " I assumed 10 t; tell me the actual weight to refine it." : ""}`),
      ], suggestions: ["Why is rail cleaner?", "Open Compare modes", "What about refrigerated cargo?"] };
    }
    case "scenario": {
      const fy = slots.fy ?? latestFy();
      const scope = applyFilters(rows, { fy });
      if (!scope.length) return { blocks: [text("I need some shipments to run a what-if. Load sample data or add your own first.")], suggestions: ["Load sample data"] };
      const text2 = parsed.text.toLowerCase();
      const levers: Levers = { ...DEFAULT_LEVERS, railShift: 0, airToRoad: 0, consolidate: 0, evShare: 0, loadFactorGain: 0 };
      const share = slots.percent ?? 30;
      let label = "";
      if (/\bair\b/.test(text2)) { levers.airToRoad = share; label = `move ${share}% of air legs up to 2,500 km to road`; }
      else if (/\b(electric|ev|battery)\b/.test(text2)) { levers.evShare = share; if (/\b(renewable|green|solar|wind)\b/.test(text2)) levers.evGrid = 0.05; label = `electrify ${share}% of road legs up to 150 km (${levers.evGrid === 0.05 ? "renewable electricity" : "CEA grid average"})`; }
      else if (/\b(load|fill|utili[sz]ation)\b/.test(text2)) { levers.loadFactorGain = Math.min(20, slots.percent ?? 5); label = `raise truck loading by ${levers.loadFactorGain} percentage points`; }
      else if (/\b(consolidat|bigger trucks?|larger trucks?)\b/.test(text2)) { levers.consolidate = share; label = `consolidate ${share}% of long hauls in small trucks`; }
      else { levers.railShift = share; label = `move ${share}% of road legs of ${levers.railMinKm}+ km to rail`; }
      const result = runScenario(scope, state.settings.factorSet, levers);
      const change = result.resultKg - result.baselineKg;
      const step = result.steps.find((item) => item.deltaKg !== 0) ?? result.steps[0]!;
      return { blocks: [
        text(`What if you ${label} in ${fy}?`),
        { type: "stats", items: [{ label: "Baseline", value: emissionsText(result.baselineKg) }, { label: "Scenario", value: emissionsText(result.resultKg) }, { label: "Change", value: `${change <= 0 ? "" : "+"}${pct((change / result.baselineKg) * 100)}`, sub: `${step.legs} legs affected` }] },
        ...(result.notes.length ? [text(result.notes[0]!)] : []),
        { type: "actions", actions: [{ kind: "navigate", href: "/app/planner/", label: "Open the planner" }] },
      ], suggestions: ["What if we move 50% of long road hauls to rail?", "What if 30% of short trips go electric with renewable power?", "Where can I reduce emissions?"] };
    }
    case "summary": {
      const fy = slots.fy ?? latestFy();
      const scope = applyFilters(rows, { fy });
      if (!scope.length) return { blocks: [text("Your workspace is empty. Load sample data to explore, or add your first shipment.")], suggestions: ["Load sample data", "How do I calculate a shipment?"] };
      const t = totals(scope);
      const prevStart = fy ? Number(fy.slice(3, 7)) - 1 : undefined;
      const prev = prevStart ? totals(applyFilters(rows, { fy: `FY ${prevStart}–${String((prevStart + 1) % 100).padStart(2, "0")}` })) : undefined;
      const modes = byMode(scope);
      const lanes = byLane(scope).slice(0, 3);
      return { blocks: [
        { type: "stats", items: [
          { label: `Total, ${fy}`, value: emissionsText(t.wtwKg), sub: prev?.shipments ? `${t.wtwKg <= prev.wtwKg ? "▼" : "▲"} ${pct(Math.abs((t.wtwKg - prev.wtwKg) / prev.wtwKg) * 100)} vs previous year` : undefined },
          { label: "Intensity", value: `${fmt(t.intensityG, 1)} g/t-km` },
          { label: "Shipments", value: fmt(t.shipments), sub: `${fmt(t.legs)} legs` },
        ] },
        { type: "bars", title: "By mode", items: modes.map((mode) => ({ key: mode.key, label: mode.label, value: mode.wtwKg, color: MODE_HEX[mode.key as keyof typeof MODE_HEX] ?? "#636363", share: mode.share })) },
        { type: "list", title: "Heaviest lanes", items: lanes.map((lane) => ({ title: lane.label, body: `${lane.count} shipments`, value: emissionsText(lane.wtwKg) })) },
        ...insights(scope).slice(1, 3).map((item) => text(`**${item.title}.** ${item.body}`)),
      ], suggestions: ["Where can I reduce emissions?", "Export a PDF report", "How good is my data quality?"] };
    }
    case "reduce": {
      const fy = slots.fy ?? latestFy();
      const scope = applyFilters(rows, { fy });
      if (!scope.length) return { blocks: [text(ARTICLES.find((item) => item.id === "howto-planner")!.body)], suggestions: ["Load sample data"] };
      const found = opportunities(scope, state.settings.factorSet);
      const total = totals(scope).wtwKg;
      return { blocks: [
        text(found.length ? `Here's where ${fy} emissions could come down, recalculated with the same factors:` : "I didn't find large reduction opportunities in this data."),
        { type: "list", items: found.map((item) => ({ title: item.title, body: item.body, value: item.savingKg > 0 ? `−${emissionsText(item.savingKg)} (${pct((item.savingKg / total) * 100, 1)})` : undefined })) },
        { type: "actions", actions: [{ kind: "navigate", href: "/app/planner/", label: "Model these in the planner" }] },
      ], suggestions: ["What if we move 40% of long road hauls to rail?", "Do electric trucks help in India?"] };
    }
    case "quality": {
      const scope = applyFilters(rows, { fy: slots.fy ?? latestFy() });
      const article = ARTICLES.find((item) => item.id === "quality")!;
      const q = byQuality(scope);
      return { blocks: [...(q.length ? [{ type: "bars" as const, title: "Emissions by data basis", items: q.map((item) => ({ key: item.key, label: item.label, value: item.wtwKg, color: item.key === "primary" ? "#1f7a45" : item.key === "modelled" ? "#bb7a08" : "#636363", share: item.share })) }] : []), text(article.body)], suggestions: ["What is the fuel-based method?", "Where can I reduce emissions?"] };
    }
  }

  // Concept questions, how-tos and anything else: search the knowledge base.
  const hits = searchKnowledge(parsed.text, 3);
  if (hits.length) {
    const [top, ...rest] = hits;
    const acts = (top!.article.actions ?? []).map<CopilotAction>((action) => action.href ? { kind: "navigate", href: action.href, label: action.label } : { kind: "prompt", text: action.prompt!, label: action.label });
    return { blocks: [text(`**${top!.article.title}**\n\n${top!.article.body}`), ...(acts.length ? [{ type: "actions" as const, actions: acts }] : [])], suggestions: rest.length ? rest.map((hit) => hit.article.title) : suggestions };
  }
  return { blocks: [text("I'm not sure I understood. I can calculate a shipment (“12 t Surat to Kolkata by rail”), compare modes, summarise your footprint, find reductions, export reports or explain terms like WTW, Scope 3 or BRSR.")], suggestions };
}

/** Respond to a user message. Compound requests run as an ordered plan. */
export async function respond(message: string, ctx: AgentContext): Promise<Reply> {
  if (ctx.pending) return handle(message, ctx, ctx.pending);
  const steps = splitSteps(message);
  if (steps.length === 1) return handle(message, ctx);
  const blocks: Block[] = [];
  const status: { label: string; status: "done" | "error" }[] = [];
  const effects: Reply["effects"] = {};
  let suggestions: string[] | undefined;
  for (const step of steps) {
    try {
      const reply = await handle(step, ctx);
      status.push({ label: step, status: reply.pending ? "error" : "done" });
      blocks.push(...reply.blocks);
      Object.assign(effects, reply.effects);
      suggestions = reply.suggestions;
      if (reply.pending) { blocks.push(text("I stopped here because I need that detail to continue.")); return { blocks: [{ type: "steps", steps: status }, ...blocks], pending: reply.pending, effects }; }
    } catch (error) {
      status.push({ label: step, status: "error" });
      blocks.push(text(error instanceof Error ? error.message : "That step failed."));
    }
  }
  return { blocks: [{ type: "steps", steps: status }, ...blocks], suggestions, effects };
}
