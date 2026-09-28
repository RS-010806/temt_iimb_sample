import type { RoadClassId, RoadFuel, TransportMode } from "@temt/calculator";
import type { ExportFormat } from "../exports/common";

export type Intent =
  | "followup" | "greeting" | "thanks" | "capabilities" | "tour" | "navigate" | "export" | "calculate" | "add" | "compare" | "scenario"
  | "summary" | "reduce" | "quality" | "explain" | "howto" | "sample" | "factor-set" | "clear" | "unknown";

export interface Slots {
  tonnes?: number;
  distanceKm?: number;
  origin?: string;
  destination?: string;
  mode?: TransportMode | "courier";
  vehicleClass?: RoadClassId;
  fuel?: RoadFuel;
  refrigerated?: boolean;
  percent?: number;
  litres?: number;
  kwh?: number;
  trips?: number;
  format?: ExportFormat;
  page?: string;
  fy?: string;
  sector?: "fmcg" | "automotive" | "pharma" | "materials";
  factorSet?: "glec-india" | "temt";
  airService?: "freighter" | "belly";
}

export interface Parsed {
  intent: Intent;
  slots: Slots;
  text: string;
}

const PAGES: [RegExp, string][] = [
  [/\b(dashboard|overview|home)\b/, "/app/"],
  [/\b(calculat(or|e)|new shipment)\b/, "/app/calculate/"],
  [/\bcompare\b/, "/app/compare/"],
  [/\b(chain|multimodal|intermodal)\b/, "/app/chain/"],
  [/\b(import|upload|bulk)\b/, "/app/import/"],
  [/\b(shipments|ledger|history|records)\b/, "/app/shipments/"],
  [/\b(reports?|exports?)\b/, "/app/reports/"],
  [/\b(planner|targets?|pathway|reduction plan)\b/, "/app/planner/"],
  [/\b(factors?|factor library|methodology)\b/, "/app/factors/"],
  [/\b(settings|preferences|organisation|organization|backup)\b/, "/app/settings/"],
  [/\b(help|guide|faq)\b/, "/app/help/"],
];

const MODE_WORDS: [RegExp, Slots["mode"]][] = [
  [/\b(courier|ptl|part[- ]truck(load)?|ltl|express parcel|surface express)\b/, "courier"],
  [/\b(rail|train|railways?|rake|wagons?|freight train|dfc)\b/, "rail"],
  [/\b(air|flight|fly|plane|aircraft|air ?freight|air ?cargo|by air)\b/, "air"],
  [/\b(inland waterway|waterway|barge|river)\b/, "iww"],
  [/\b(sea|ship|shipping|vessel|coastal|ocean|container ship|by sea|maritime)\b/, "sea"],
  [/\b(road|truck|lorry|trailer|trucks|tempo|by road|ftl|pickup|van)\b/, "road"],
];

const VEHICLE_WORDS: [RegExp, RoadClassId][] = [
  [/\b(40 ?ft|40 ?feet|tractor[- ]trailer|trailer|semi[- ]trailer)\b/, "trailer-30-60"],
  [/\b(32 ?ft|32 ?feet|mxl|sxl|multi[- ]axle|12[- ]wheeler|14[- ]wheeler|16[- ]wheeler|ultra heavy)\b/, "gvw-30-50"],
  [/\b(24 ?ft|24 ?feet|10[- ]wheeler|heavy truck|hcv)\b/, "gvw-20-30"],
  [/\b(19 ?ft|20 ?ft|22 ?ft|6[- ]wheeler|medium truck|mcv)\b/, "gvw-12-20"],
  [/\b(14 ?ft|17 ?ft|icv|intermediate)\b/, "gvw-5-12"],
  [/\b(10 ?ft|small truck|scv)\b/, "gvw-3-5"],
  [/\b(mini ?truck|pickup|pick-up|lcv|tata ace|chota hathi|small van|three[- ]wheeler|3w)\b/, "gvw-3.5"],
];

const FORMAT_WORDS: [RegExp, ExportFormat][] = [
  [/\bpower ?bi|pbi\b/, "powerbi"], [/\b(excel|xlsx|spreadsheet|workbook)\b/, "xlsx"], [/\b(word|docx|doc)\b/, "docx"], [/\bpdf\b/, "pdf"], [/\bcsv\b/, "csv"], [/\bjson\b/, "json"],
];

const num = (value: string) => Number(value.replace(/,/g, ""));

export function extractSlots(raw: string): Slots {
  const text = ` ${raw.toLowerCase().replace(/\s+/g, " ")} `;
  const slots: Slots = {};
  const weight = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(tonnes?|tons?|mt|metric tons?|t|kgs?|kilograms?|kilos?|quintals?|qtl)\b/);
  if (weight) {
    const value = num(weight[1]!);
    const unit = weight[2]!;
    slots.tonnes = /^kg|kilo/.test(unit) ? value / 1000 : /quintal|qtl/.test(unit) ? value / 10 : value;
  }
  const distance = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(km|kms|kilomet(?:re|er)s?|nm|nautical miles?)\b/);
  if (distance) slots.distanceKm = /nm|nautical/.test(distance[2]!) ? num(distance[1]!) * 1.852 : num(distance[1]!);
  const litres = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(l|litres?|liters?|ltrs?)\b/);
  if (litres) slots.litres = num(litres[1]!);
  const kwh = text.match(/(\d[\d,]*(?:\.\d+)?)\s*kwh\b/);
  if (kwh) slots.kwh = num(kwh[1]!);
  const percent = text.match(/(\d{1,3}(?:\.\d+)?)\s*(%|percent|per cent)/);
  if (percent) slots.percent = Math.min(100, num(percent[1]!));
  const trips = text.match(/(\d+)\s*(trips?|truckloads?|loads?|trucks)\b/);
  if (trips && !/\bton/.test(trips[0])) slots.trips = num(trips[1]!);
  const fy = text.match(/\bfy\s*'?(\d{2,4})(?:\s*[-–/]\s*(\d{2,4}))?/);
  if (fy) {
    // "FY 2025-26" and "FY 25-26" name both years; a single year ("FY26") names the year the FY ends.
    let first = num(fy[1]!);
    if (first < 100) first += 2000;
    const start = fy[2] ? first : first - 1;
    slots.fy = `FY ${start}–${String((start + 1) % 100).padStart(2, "0")}`;
  }

  for (const [pattern, mode] of MODE_WORDS) if (pattern.test(text)) { slots.mode = mode; break; }
  for (const [pattern, vehicle] of VEHICLE_WORDS) if (pattern.test(text)) { slots.vehicleClass = vehicle; if (!slots.mode) slots.mode = "road"; break; }
  if (/\b(cng|gas truck)\b/.test(text)) slots.fuel = "cng";
  else if (/\b(electric|ev|battery|e-truck|e-van)\b/.test(text)) slots.fuel = "electric";
  else if (/\b(petrol|gasoline)\b/.test(text)) slots.fuel = "petrol";
  else if (/\bdiesel\b/.test(text)) slots.fuel = "diesel";
  if (/\b(refrigerated|reefer|cold chain|temperature[- ]controlled|chilled|frozen)\b/.test(text)) slots.refrigerated = true;
  if (/\bfreighter\b/.test(text)) slots.airService = "freighter";
  else if (/\bbelly\b/.test(text)) slots.airService = "belly";
  for (const [pattern, format] of FORMAT_WORDS) if (pattern.test(text)) { slots.format = format; break; }
  for (const [pattern, page] of PAGES) if (pattern.test(text)) { slots.page = page; break; }
  if (/\bfmcg|consumer\b/.test(text)) slots.sector = "fmcg";
  else if (/\bauto(motive)?|vehicle maker\b/.test(text)) slots.sector = "automotive";
  else if (/\bpharma|healthcare|medicine\b/.test(text)) slots.sector = "pharma";
  else if (/\bcement|materials|steel|metals\b/.test(text)) slots.sector = "materials";
  if (/\b(temt production|production temt|legacy|old factors|temt factors|temt set|own factors|india factors)\b/.test(text)) slots.factorSet = "temt";
  else if (/\bglec\b/.test(text)) slots.factorSet = "glec-india";

  const route = raw.match(/\bfrom\s+(.+?)\s+(?:to|→|->|till|until)\s+(.+?)(?=\s+(?:by|via|using|in|on|with|for|carrying|and|,|\.|\?|$)|[,.?]|$)/i)
    ?? raw.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?=\s+(?:by|via|using|in|on|with|for|carrying)|[,.?]|$)/i)
    ?? raw.match(/(?:^|\s)([A-Za-z][A-Za-z .'-]{1,40}?|\d{6})\s+(?:to|→|->)\s+([A-Za-z][A-Za-z .'-]{1,40}?|\d{6})(?=\s+(?:by|via|using|in|on|with|for|carrying|and|\d)|[,.?]|$)/i);
  if (route) {
    const clean = (value: string) => value
      .replace(/\b(\d[\d,.]*\s*(tonnes?|tons?|mt|t|kgs?|km|quintals?))\b/gi, "")
      .replace(/^\s*(?:(?:kgs?|t|mt|tonnes?|tons?|km|of|the|a|an)\s+)+/i, "")
      .replace(/\b(by|via|using)\b.*$/i, "")
      .replace(/\s+(refrigerated|reefer|cold chain|frozen|chilled|urgent|today|tomorrow|yesterday|daily|weekly|monthly)\b.*$/i, "")
      .replace(/\b(truck|rail|train|road|air|sea|ship|the|a)\b\s*$/i, "")
      .trim();
    slots.origin = clean(route[1]!);
    slots.destination = clean(route[2]!);
    if (!slots.origin || !slots.destination) { delete slots.origin; delete slots.destination; }
  }
  return slots;
}

export function parse(raw: string): Parsed {
  const text = raw.toLowerCase().trim();
  const slots = extractSlots(raw);
  const has = (pattern: RegExp) => pattern.test(text);
  let intent: Intent = "unknown";
  if (!text) intent = "unknown";
  else if (has(/^(hi|hello|hey|namaste|good (morning|afternoon|evening))\b/) && text.split(" ").length <= 4) intent = "greeting";
  else if (has(/^(thanks|thank you|thx|great|awesome|perfect|cool)\b/) && text.split(" ").length <= 5) intent = "thanks";
  else if (has(/\b(tour|walk ?through|walk me|show me around|guide me|getting started|onboard|how to use (this|temt|the tool))\b/)) intent = "tour";
  else if (has(/\b(what can you do|who are you|what are you|your capabilities|help me$|^help$)\b/)) intent = "capabilities";
  else if (has(/\b(load|use|try|show|give me)\b.*\b(sample|demo|example)\b|\bsample data\b/)) intent = "sample";
  else if (has(/\b(clear|delete|remove|reset|wipe)\b.*\b(all|workspace|everything|data)\b/)) intent = "clear";
  else if (slots.factorSet && has(/\b(switch|use|change|set|move)\b/)) intent = "factor-set";
  else if (has(/\b(export|download|generate|create|make|send|share)\b/) && (slots.format || has(/\breport\b/))) intent = "export";
  else if (has(/\b(what if|what happens if|scenario|simulate)\b/) || (slots.percent !== undefined && has(/\b(shift|move|switch|convert|replace)\b/))) intent = "scenario";
  else if (has(/\b(compare|comparison|which mode|best mode|greenest|cleanest|lowest[- ]emission|versus|\bvs\b|alternatives?|options for)\b/)) intent = "compare";
  else if (has(/\b(add|save|log|record|enter|book)\b/) && (slots.tonnes !== undefined || slots.origin)) intent = "add";
  else if ((has(/\b(calculate|calc|estimate|compute|how much|emissions? (for|of)|footprint of|co2|carbon)\b/) || slots.tonnes !== undefined || slots.trips !== undefined || slots.litres !== undefined) && (slots.tonnes !== undefined || slots.trips !== undefined || slots.origin || slots.distanceKm !== undefined || slots.litres !== undefined || slots.kwh !== undefined)) intent = "calculate";
  else if (has(/\b(reduce|lower|cut|decarboni[sz]e|opportunit|recommend|improve my|save emissions|abate|levers?)\b/)) intent = "reduce";
  else if (has(/\b(data quality|primary data|accuracy|how accurate|confidence|uncertain)\b/)) intent = "quality";
  else if (has(/\b(summary|summari[sz]e|overview of my|insights?|hotspots?|biggest|largest|top (lanes?|sources?|routes?)|how am i doing|how are we doing|analy[sz]e|total emissions|my emissions|my footprint|breakdown)\b/)) intent = "summary";
  else if (has(/^(go to|open|take me|navigate|show me the|show)\b/) && slots.page) intent = "navigate";
  else if (has(/\b(how (do|can|should) (i|we)|where (do|can) i|steps to|how to)\b/)) intent = "howto";
  else if (has(/\b(what is|what are|what's|whats|explain|define|meaning|mean by|why|difference between|tell me about|how does|how is)\b/)) intent = "explain";
  else if (slots.page && text.split(" ").length <= 3) intent = "navigate";
  // Follow-ups that refer to the previous shipment: "what about rail?", "same route by air", "now 30 t".
  if ((intent === "unknown" || intent === "explain") && !slots.origin && (slots.mode || slots.tonnes !== undefined || slots.vehicleClass || slots.fuel) && has(/\b(what about|how about|same (route|lane|shipment)|instead|now|by|with|and)\b/)) intent = "followup";
  return { intent, slots, text: raw };
}

/** Split a compound request ("load sample data and then export a PDF") into ordered steps. */
export function splitSteps(raw: string): string[] {
  const parts = raw.split(/\s*(?:,?\s*and then\s+|;\s*|\bthen\b\s+|,\s*after that\s+)/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  const verbs = /\b(load|calculate|compare|export|download|open|show|add|save|summari[sz]e|switch|start|take)\b/gi;
  const matches = raw.match(verbs);
  if (matches && matches.length >= 2 && /\band\b/i.test(raw)) {
    const split = raw.split(/\s+and\s+(?=(?:then\s+)?(?:load|calculate|compare|export|download|open|show|add|save|summari[sz]e|switch|start|take)\b)/i);
    if (split.length > 1) return split.map((part) => part.trim());
  }
  return [raw];
}
