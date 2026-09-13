import type { AnalysisResult, CalculatedLeg, ShipmentLeg } from "@temt/calculator";

export type Sector = "automotive" | "fmcg" | "materials" | "pharma";
export type Company = { name: string; symbol: string; industry: string; sector: Sector | "general" };
export type DemoLeg = ShipmentLeg & { origin: string; destination: string };
export type Filters = { mode: string; subsidiary: string; from: string; to: string };
export const DEFAULT_FILTERS: Filters = { mode: "all", subsidiary: "all", from: "2025-10-01", to: "2026-09-30" };
export const SECTORS: Record<Sector, { label: string; company: string; description: string }> = {
  automotive: { label: "Automotive", company: "India automotive group", description: "Plants, suppliers and dealer distribution" },
  fmcg: { label: "FMCG", company: "India consumer group", description: "Factories, distribution centres and retail" },
  materials: { label: "Materials", company: "India materials group", description: "Bulk movements and long-distance corridors" },
  pharma: { label: "Pharma", company: "India healthcare group", description: "Manufacturing, air cargo and distribution" },
};
export const MODE_LABELS: Record<string, string> = { road: "Road", rail: "Rail", ocean: "Ocean", air: "Air" };
export const MODE_COLORS: Record<string, string> = { road: "#71894f", rail: "#b8c999", ocean: "#8fa6a2", air: "#d9895f" };
export const REQUIRED_CSV_COLUMNS = ["shipmentId", "legIndex", "date", "subsidiary", "mode", "profile", "tonnes", "kilometres"] as const;

/** Preserve absent and invalid profiles for engine validation; never infer a CSV profile. */
export function normalizeCSVRows(records: Record<string, string>[]): DemoLeg[] {
  return records.map(row => ({ shipmentId: row.shipmentId?.trim(), legIndex: Number(row.legIndex), date: row.date?.trim(), subsidiary: row.subsidiary?.trim(), mode: row.mode?.trim().toLowerCase() as ShipmentLeg["mode"], profile: row.profile?.trim() as ShipmentLeg["profile"], tonnes: Number(row.tonnes), kilometres: Number(row.kilometres), origin: row.origin?.trim() || "Origin", destination: row.destination?.trim() || "Destination" }));
}

export function parseDemoQuery(search: string) {
  const params = new URLSearchParams(search); const sector = params.get("sector"); const mode = params.get("mode"); const rail = params.get("rail");
  return { sector: sector && Object.hasOwn(SECTORS, sector) ? sector as Sector : "fmcg" as Sector, company: params.get("company"), mode: mode && Object.hasOwn(MODE_LABELS, mode) ? mode : "all", rail: rail !== null && Number.isFinite(Number(rail)) ? Math.min(100, Math.max(0, Number(rail))) : 30 };
}

export function backendErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  }
  return `The server returned HTTP ${status}.`;
}
const LANES = [
  ["Mumbai", "Delhi", 1420], ["Chennai", "Bengaluru", 350], ["Pune", "Ahmedabad", 660], ["Kolkata", "Delhi", 1530],
  ["Hyderabad", "Mumbai", 710], ["Chennai", "Kolkata", 1660], ["Ahmedabad", "Delhi", 950], ["Bengaluru", "Pune", 840],
] as const;

export function profileFor(mode: string, kilometres: number): ShipmentLeg["profile"] {
  return mode === "rail" ? "rail-india" : mode === "ocean" ? "ocean-container" : mode === "air" ? (kilometres <= 1500 ? "air-short" : "air-long") : "road-hcv";
}

export function makeScenario(sector: Sector): DemoLeg[] {
  const base = { automotive: 155, fmcg: 320, materials: 760, pharma: 21 }[sector];
  const prefix = { automotive: "AUT", fmcg: "FMC", materials: "MAT", pharma: "PHA" }[sector];
  const subsidiaries = { automotive: ["Auto components", "Vehicle assembly", "Distribution"], fmcg: ["Foods division", "Home & personal care", "Distribution"], materials: ["Cement division", "Metals division", "Industrial materials"], pharma: ["Formulations", "Active ingredients", "Healthcare distribution"] }[sector];
  const result: DemoLeg[] = [];
  for (let index = 0; index < 24; index += 1) {
    const month = index % 12;
    const date = `${month < 3 ? 2025 : 2026}-${String(month < 3 ? month + 10 : month - 2).padStart(2, "0")}-${String(7 + (index * 3) % 18).padStart(2, "0")}`;
    const lane = LANES[index % LANES.length];
    const isAir = sector === "pharma" ? index % 3 === 2 : index % 11 === 5;
    const mode: ShipmentLeg["mode"] = index % 8 === 6 ? "ocean" : isAir ? "air" : index % 5 === 3 ? "rail" : "road";
    const tonnes = Math.round(base * (0.58 + ((index * 7) % 12) / 10) * (mode === "air" ? 0.08 : mode === "ocean" ? 1.7 : 1) * 10) / 10;
    const kilometres = mode === "ocean" ? 2080 + index * 19 : lane[2] + (index % 4) * 12;
    result.push({ shipmentId: `${prefix}-${String(index + 1001)}`, legIndex: 1, date, subsidiary: subsidiaries[index % 3], mode, profile: profileFor(mode, kilometres), tonnes, kilometres, origin: mode === "ocean" ? "JNPT" : lane[0], destination: mode === "ocean" ? "Chennai port" : lane[1] });
    if (index % 3 === 0) result.push({ shipmentId: `${prefix}-${String(index + 1001)}`, legIndex: 2, date, subsidiary: subsidiaries[index % 3], mode: "road", profile: "road-hcv", tonnes, kilometres: 38 + index * 3, origin: lane[1], destination: "Distribution centre" });
  }
  return result;
}

export function matchesFilters(row: Pick<ShipmentLeg, "mode" | "subsidiary" | "date">, filters: Filters) {
  return (filters.mode === "all" || row.mode === filters.mode) && (filters.subsidiary === "all" || row.subsidiary === filters.subsidiary) && (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to);
}

export function filteredAnalysis(analysis: AnalysisResult, filters: Filters): AnalysisResult {
  const rows = analysis.rows.filter(row => matchesFilters(row, filters));
  const byMode = new Map<string, { mode: ShipmentLeg["mode"]; emissionsKg: number; tonneKm: number; legCount: number }>();
  const bySubsidiary = new Map<string, { subsidiary: string; emissionsKg: number; tonneKm: number; legCount: number }>();
  const byMonth = new Map<string, { month: string; emissionsKg: number; tonneKm: number; legCount: number }>();
  for (const row of rows) {
    const mode = byMode.get(row.mode) || { mode: row.mode, emissionsKg: 0, tonneKm: 0, legCount: 0 };
    mode.emissionsKg += row.emissionsKg; mode.tonneKm += row.tonneKm; mode.legCount += 1; byMode.set(row.mode, mode);
    const subsidiary = bySubsidiary.get(row.subsidiary) || { subsidiary: row.subsidiary, emissionsKg: 0, tonneKm: 0, legCount: 0 };
    subsidiary.emissionsKg += row.emissionsKg; subsidiary.tonneKm += row.tonneKm; subsidiary.legCount += 1; bySubsidiary.set(row.subsidiary, subsidiary);
    const month = row.date.slice(0, 7); const monthValue = byMonth.get(month) || { month, emissionsKg: 0, tonneKm: 0, legCount: 0 };
    monthValue.emissionsKg += row.emissionsKg; monthValue.tonneKm += row.tonneKm; monthValue.legCount += 1; byMonth.set(month, monthValue);
  }
  return { ...analysis, rows, totals: { emissionsKg: rows.reduce((n, row) => n + row.emissionsKg, 0), tonneKm: rows.reduce((n, row) => n + row.tonneKm, 0), shipmentCount: new Set(rows.map(row => row.shipmentId)).size, legCount: rows.length }, byMode: [...byMode.values()], bySubsidiary: [...bySubsidiary.values()], byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) };
}

export function legKey(row: Pick<ShipmentLeg, "shipmentId" | "legIndex">) { return `${row.shipmentId}:${row.legIndex}`; }
export function enrichRows(rows: CalculatedLeg[], raw: DemoLeg[]) { const lookup = new Map(raw.map(row => [legKey(row), row])); return rows.map(row => ({ ...lookup.get(legKey(row)), ...row })); }
export function formatNumber(value: number, decimals = 0) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value); }
export function shortNumber(value: number) { return value >= 1e6 ? `${formatNumber(value / 1e6, 2)}m` : value >= 1000 ? `${formatNumber(value / 1000, 1)}k` : formatNumber(value, 1); }
