import { describe, expect, it } from "vitest";
import { analyze, compareFreightMix, FACTORS } from "@temt/calculator";
import Papa from "papaparse";
import { DEFAULT_FILTERS, QUICK_SCENARIO_NAME, REQUIRED_CSV_COLUMNS, backendErrorMessage, clearQuickQuery, filteredAnalysis, makeQuickScenario, makeScenario, normalizeCSVRows, parseDemoQuery, profileFor, type DemoLeg, type Sector } from "./demo-data";
import { buildExceptionRows, buildExportRows, buildPowerBIPack, buildReportPDF, buildStandaloneCSV, serializeCSV, validationSummary, type ExportContext } from "./demo-export";

const completeShipment: DemoLeg[] = [
  { shipmentId: "MULTI-01", legIndex: 1, date: "2026-03-14", subsidiary: "Plant A", mode: "road", profile: "road-hcv", tonnes: 100, kilometres: 150, origin: "Plant", destination: "Railhead" },
  { shipmentId: "MULTI-01", legIndex: 2, date: "2026-03-14", subsidiary: "Plant A", mode: "rail", profile: "rail-india", tonnes: 100, kilometres: 900, origin: "Railhead", destination: "Depot" },
  { shipmentId: "OTHER-02", legIndex: 1, date: "2026-04-17", subsidiary: "Plant B", mode: "road", profile: "road-hcv", tonnes: 75, kilometres: 400, origin: "Factory", destination: "Customer" },
];

function context(mode = "rail"): ExportContext {
  const filters = { ...DEFAULT_FILTERS, mode };
  return { analysis: filteredAnalysis(analyze(completeShipment), filters), rawRows: completeShipment, name: "Illustrative Indian enterprise scenario", filters, synthetic: true, processing: "local" };
}

describe("scenario integrity", () => {
  it.each(["automotive", "fmcg", "materials", "pharma"] as Sector[])("builds a valid, complete 12-month %s scenario", sector => {
    const rows = makeScenario(sector); const analysis = analyze(rows);
    expect(analysis.errors).toEqual([]); expect(analysis.totals.legCount).toBe(32); expect(analysis.totals.shipmentCount).toBe(24);
    expect(analysis.byMonth.map(row => row.month)).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(new Set(rows.map(row => row.mode)).size).toBe(4);
  });
  it("chooses the exact short/long air boundary after a distance edit", () => {
    expect(profileFor("air", 1500)).toBe("air-short"); expect(profileFor("air", 1500.01)).toBe("air-long");
    const base = { ...completeShipment[0], mode: "air" as const, kilometres: 1500, profile: profileFor("air", 1500) };
    expect(analyze([base]).errors).toEqual([]);
    expect(analyze([{ ...base, kilometres: 1500.01, profile: profileFor("air", 1500.01) }]).errors).toEqual([]);
  });
});

describe("landing quick-estimate continuity", () => {
  const quickSearch = "?quick=1&tonnes=1000&km=1000&rail=30";

  it("carries the hero baseline, rail share and displayed saving into one synthetic road leg", () => {
    const query = parseDemoQuery(quickSearch);
    expect(query.quick).toEqual({ tonnes: 1000, kilometres: 1000, railShare: 30 });
    const rows = makeQuickScenario(query.quick!);
    expect(rows).toEqual([{ shipmentId: "QUICK-001", legIndex: 1, date: "2026-09-14", subsidiary: QUICK_SCENARIO_NAME, mode: "road", profile: "road-hcv", tonnes: 1000, kilometres: 1000, origin: "Illustrative origin", destination: "Illustrative destination" }]);
    const result = filteredAnalysis(analyze(rows), DEFAULT_FILTERS);
    expect(result.errors).toEqual([]);
    expect(result.totals).toEqual({ emissionsKg: 66300, tonneKm: 1000000, shipmentCount: 1, legCount: 1 });
    const comparison = compareFreightMix(rows[0].tonnes, rows[0].kilometres, query.rail);
    expect(comparison.baselineKg).toBe(result.totals.emissionsKg);
    expect(comparison.scenarioKg / 1000).toBeCloseTo(49.59, 10);
    expect(comparison.savedKg / 1000).toBeCloseTo(16.71, 10);
  });

  it.each([[1, 1, 0], [1000000, 20000, 100], [1234.5, 999.25, 37.5]])("matches explicit road/rail engine legs at %s tonnes, %s km, %s%% rail", (tonnes, kilometres, railShare) => {
    const query = parseDemoQuery(`?quick=1&tonnes=${tonnes}&km=${kilometres}&rail=${railShare}`);
    expect(query.quick).toEqual({ tonnes, kilometres, railShare });
    const base = makeQuickScenario(query.quick!)[0];
    const baseline = analyze([base]);
    const shifted: DemoLeg[] = [];
    if (railShare < 100) shifted.push({ ...base, shipmentId: "QUICK-ROAD", tonnes: tonnes * (1 - railShare / 100) });
    if (railShare > 0) shifted.push({ ...base, shipmentId: "QUICK-RAIL", mode: "rail", profile: "rail-india", tonnes: tonnes * railShare / 100 });
    const scenario = analyze(shifted);
    const comparison = compareFreightMix(tonnes, kilometres, railShare);
    expect(baseline.errors).toEqual([]); expect(scenario.errors).toEqual([]);
    expect(comparison.baselineKg).toBe(baseline.totals.emissionsKg);
    expect(comparison.scenarioKg).toBeCloseTo(scenario.totals.emissionsKg, 6);
    expect(comparison.savedKg).toBeCloseTo(baseline.totals.emissionsKg - scenario.totals.emissionsKg, 6);
  });

  it.each([
    "quick=0&tonnes=1000&km=1000&rail=30", "quick=1&km=1000&rail=30", "quick=1&tonnes=1000&rail=30", "quick=1&tonnes=1000&km=1000",
    "quick=1&tonnes=&km=1000&rail=30", "quick=1&tonnes=0&km=1000&rail=30", "quick=1&tonnes=1000001&km=1000&rail=30",
    "quick=1&tonnes=1000&km=0&rail=30", "quick=1&tonnes=1000&km=20001&rail=30", "quick=1&tonnes=1000&km=1000&rail=-1",
    "quick=1&tonnes=1000&km=1000&rail=101", "quick=1&tonnes=Infinity&km=1000&rail=30", "quick=1&tonnes=1000&km=NaN&rail=30",
    "quick=1&tonnes=0x3e8&km=1000&rail=30", "quick=1&tonnes=1000&km=1000&rail=", "quick=1&tonnes=1000&tonnes=500&km=1000&rail=30",
  ])("does not seed a quick scenario from malformed or ambiguous inputs: %s", search => {
    expect(parseDemoQuery(search).quick).toBeNull();
  });

  it("keeps an explicit quick seed independent of company and mode URL inputs", () => {
    const query = parseDemoQuery(`${quickSearch}&company=CIPLA&sector=pharma&mode=rail`);
    expect(query.company).toBeNull(); expect(query.mode).toBe("all"); expect(query.rail).toBe(30);
    expect(makeQuickScenario(query.quick!)[0].shipmentId).toBe("QUICK-001");
  });

  it("removes quick seed parameters when leaving it without changing ordinary demo URLs", () => {
    const cleared = clearQuickQuery(`${quickSearch}&sector=pharma&company=CIPLA&mode=air`);
    expect(cleared.toString()).toBe("sector=pharma&company=CIPLA&mode=air");
    expect(parseDemoQuery(cleared.toString())).toMatchObject({ sector: "pharma", company: "CIPLA", mode: "air", rail: 30, quick: null });
    expect(clearQuickQuery("sector=fmcg&rail=40").toString()).toBe("sector=fmcg&rail=40");
  });

  it("exports the quick baseline under its own name with the retained source inputs", async () => {
    const query = parseDemoQuery(quickSearch); const rawRows = makeQuickScenario(query.quick!);
    const ctx: ExportContext = { analysis: analyze(rawRows), rawRows, name: QUICK_SCENARIO_NAME, filters: DEFAULT_FILTERS, synthetic: true, processing: "local" };
    const rows = buildExportRows(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyScenario: QUICK_SCENARIO_NAME, shipmentId: "QUICK-001", date: "2026-09-14", tonnes: 1000, kilometres: 1000, emissionsKg: 66300, dataType: "synthetic scenario" });
    const pack = await buildPowerBIPack(ctx);
    expect(await pack.file("summary.csv")!.async("string")).toContain(QUICK_SCENARIO_NAME);
    expect(await pack.file("shipments.csv")!.async("string")).toContain("QUICK-001");
  });
});

describe("filters retain validated multi-leg semantics", () => {
  it("retains a valid second leg when filtering a completed shipment by rail", () => {
    const original = analyze(completeShipment); const view = filteredAnalysis(original, { ...DEFAULT_FILTERS, mode: "rail" });
    expect(view.errors).toEqual([]); expect(view.rows).toHaveLength(1); expect(view.rows[0].legIndex).toBe(2);
    expect(view.totals).toEqual({ emissionsKg: 100 * 900 * FACTORS["rail-india"].kgCO2ePerTonneKm, tonneKm: 90000, legCount: 1, shipmentCount: 1 });
    expect(view.byMode[0].emissionsKg).toBe(view.totals.emissionsKg); expect(view.byMonth[0].emissionsKg).toBe(view.totals.emissionsKg); expect(view.bySubsidiary[0].emissionsKg).toBe(view.totals.emissionsKg);
    expect(original.rows).toHaveLength(3);
  });
  it("never restores the healthy leg of a shipment excluded during validation", () => {
    const invalid = analyze([{ ...completeShipment[0], tonnes: -10 }, ...completeShipment.slice(1)]);
    const rail = filteredAnalysis(invalid, { ...DEFAULT_FILTERS, mode: "rail" }); expect(rail.rows).toEqual([]); expect(rail.totals.emissionsKg).toBe(0); expect(rail.errors.length).toBeGreaterThan(0);
  });
  it("combines unit and inclusive date filters without changing source rows", () => {
    const result = filteredAnalysis(analyze(completeShipment), { subsidiary: "Plant A", mode: "all", from: "2026-03-14", to: "2026-03-14" });
    expect(result.totals.legCount).toBe(2); expect(result.totals.shipmentCount).toBe(1); expect(result.byMonth).toHaveLength(1);
    expect(filteredAnalysis(result, { subsidiary: "Plant B", mode: "all", from: "", to: "" }).totals).toEqual({ emissionsKg: 0, tonneKm: 0, shipmentCount: 0, legCount: 0 });
  });
});

describe("download reconciliation and spreadsheet safety", () => {
  it("exports exactly the filtered validated rows, retaining leg identity and provenance", () => {
    const ctx = context(); const exported = buildExportRows(ctx);
    expect(exported).toHaveLength(1); expect(exported[0]).toMatchObject({ shipmentId: "MULTI-01", legIndex: 2, origin: "Railhead", destination: "Depot", companyScenario: ctx.name, filterMode: "rail", filterFrom: DEFAULT_FILTERS.from, dataType: "synthetic scenario", processing: "local" });
    expect(exported.reduce((sum, row) => sum + row.emissionsKg, 0)).toBe(ctx.analysis.totals.emissionsKg);
    expect(exported.reduce((sum, row) => sum + row.tonneKm, 0)).toBe(ctx.analysis.totals.tonneKm);
  });
  it("escapes CSV formula injection while preserving numbers and quoted text", async () => {
    const csv = await serializeCSV([{ name: '=HYPERLINK("https://example.invalid")', unit: "+danger", origin: "@SUM(A1)", destination: "-formula", note: 'Mumbai, "West"', tonnes: 12.5, negativeNumber: -2 }]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data[0];
    expect(parsed.name.startsWith("'=")).toBe(true); expect(parsed.unit).toBe("'+danger"); expect(parsed.origin).toBe("'@SUM(A1)"); expect(parsed.destination).toBe("'-formula"); expect(parsed.note).toBe('Mumbai, "West"'); expect(parsed.tonnes).toBe("12.5"); expect(parsed.negativeNumber).toBe("-2");
  });
  it("retains usable CSV column headers for an empty filtered view", async () => {
    const csv = await serializeCSV([]); const fields = Papa.parse(csv, { header: true }).meta.fields;
    expect(fields).toContain("factorVersion"); expect(fields).toContain("companyScenario"); expect(fields).toContain("filterFrom"); expect(fields).toContain("processing");
  });
  it("generates a Power BI pack whose ledger, summary, factors and filters reconcile", async () => {
    const ctx = context("road"); const zip = await buildPowerBIPack(ctx);
    expect(Object.keys(zip.files).sort()).toEqual(["README.md", "exceptions.csv", "factors.json", "field-definitions.csv", "measures.txt", "query.m", "shipments.csv", "summary.csv"].sort());
    const ledger = Papa.parse<Record<string, string>>(await zip.file("shipments.csv")!.async("string"), { header: true }).data;
    const summary = Papa.parse<Record<string, string>>(await zip.file("summary.csv")!.async("string"), { header: true }).data[0];
    expect(ledger.reduce((sum, row) => sum + Number(row.emissionsKg), 0)).toBe(Number(summary.totalEmissionsKg));
    expect(ledger.reduce((sum, row) => sum + Number(row.tonneKm), 0)).toBe(Number(summary.totalTonneKm));
    expect(ledger.every(row => row.mode === "road" && row.filterMode === "road")).toBe(true);
    expect(JSON.parse(await zip.file("factors.json")!.async("string"))).toEqual(FACTORS);
    expect(await zip.file("query.m")!.async("string")).toContain("Encoding=65001");
    expect(await zip.file("README.md")!.async("string")).toContain("SYNTHETIC");
  });
  it("embeds every factor value and the methodology appendix in the PDF", async () => {
    const pdf = await buildReportPDF(context()); const output = pdf.output();
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(3); expect(output).toContain("Methodology / factor register");
    for (const factor of Object.values(FACTORS)) { expect(output).toContain(`${factor.kgCO2ePerTonneKm} kgCO2e`); expect(output).toContain(factor.id); }
    expect(output).toContain(FACTORS["road-hcv"].sourceUrl); expect(output).toContain("SYNTHETIC DATA");
  });
});

describe("CSV profiles are explicit inputs", () => {
  it.each([undefined, "", "   "])("rejects a missing profile %s rather than inferring one from mode", profile => {
    const record: Record<string, string> = Object.fromEntries(Object.entries(completeShipment[2]).map(([key, value]) => [key, String(value)]));
    if (profile === undefined) delete record.profile; else record.profile = profile;
    const rows = normalizeCSVRows([record]);
    expect(rows[0].profile).not.toBe("road-hcv"); expect(analyze(rows).totals.legCount).toBe(0); expect(analyze(rows).errors.some(error => error.fields?.includes("profile"))).toBe(true);
    expect(REQUIRED_CSV_COLUMNS).toContain("profile");
  });
  it("preserves an explicitly incompatible profile for rejection", () => {
    const record: Record<string, string> = Object.fromEntries(Object.entries(completeShipment[2]).map(([key, value]) => [key, String(value)])); record.profile = "rail-india";
    expect(normalizeCSVRows([record])[0].profile).toBe("rail-india"); expect(analyze(normalizeCSVRows([record])).totals.legCount).toBe(0);
  });
});

describe("exception trails survive every export", () => {
  const invalidContext = (mode = "road"): ExportContext => { const rawRows = [{ ...completeShipment[0], tonnes: -5 }, ...completeShipment.slice(1)]; const filters = { ...DEFAULT_FILTERS, mode }; return { ...context(), rawRows, filters, analysis: filteredAnalysis(analyze(rawRows), filters) }; };
  it("reports full-input exclusions separately from filtered valid rows", () => {
    const ctx = invalidContext(); const summary = validationSummary(ctx);
    expect(summary).toMatchObject({ validationExceptionCount: 2, excludedRowCount: 2, excludedShipmentCount: 1, sourceRowCount: 3, validationScope: "Full input before view filters" });
    const rows = buildExportRows(ctx); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ shipmentId: "OTHER-02", excludedRowCount: 2, excludedShipmentCount: 1 });
    const exceptions = buildExceptionRows(ctx); expect(exceptions.map(row => row.sourceRow)).toEqual([1, 2]); expect(exceptions.map(row => row.csvLine)).toEqual([2, 3]); expect(exceptions.every(row => row.shipmentId === "MULTI-01" && row.message.length > 0)).toBe(true);
    expect(JSON.parse(exceptions[0].inputRow).tonnes).toBe(-5);
  });
  it("includes exception CSV records and reconcilable summary counts in the ZIP", async () => {
    const ctx = invalidContext(); const zip = await buildPowerBIPack(ctx);
    const exceptions = Papa.parse<Record<string, string>>(await zip.file("exceptions.csv")!.async("string"), { header: true }).data;
    const summary = Papa.parse<Record<string, string>>(await zip.file("summary.csv")!.async("string"), { header: true }).data[0];
    expect(exceptions).toHaveLength(Number(summary.validationExceptionCount)); expect(summary.excludedRowCount).toBe("2"); expect(summary.excludedShipmentCount).toBe("1"); expect(exceptions[1].legIndex).toBe("2");
  });
  it("keeps exclusion metadata when a standalone CSV has no valid matching rows", async () => {
    const csv = await buildStandaloneCSV(invalidContext("rail")); const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    expect(parsed).toHaveLength(1); expect(parsed[0]).toMatchObject({ recordType: "validation_summary", excludedRowCount: "2", excludedShipmentCount: "1", filterMode: "rail", shipmentId: "", validationScope: "Full input before view filters" });
  });
  it("prints full exception identities, source rows and reasons in the PDF", async () => {
    const ctx = invalidContext(); const pdf = await buildReportPDF(ctx); const text = pdf.output();
    expect(text).toContain("Validation exceptions"); expect(text).toContain("2 excluded rows"); expect(text).toContain("Shipment: MULTI-01"); expect(text).toContain("Source row 1 / CSV line 2"); expect(text).toContain("shipment_excluded");
  });
  it("retains two long shipment identifiers sharing the same first 17 characters", async () => {
    const first = "IDENTICAL-PREFIX-001-PLANT-INDIA-DELIVERY-000001"; const second = "IDENTICAL-PREFIX-001-PLANT-INDIA-DELIVERY-000002";
    const rawRows = [{ ...completeShipment[2], shipmentId: first }, { ...completeShipment[2], shipmentId: second }]; const ctx = { ...context(), rawRows, analysis: analyze(rawRows) };
    const pdf = await buildReportPDF(ctx); const textChunks = [...pdf.output().matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1]).join("");
    expect(textChunks).toContain(first); expect(textChunks).toContain(second);
  });
});

describe("untrusted URL and backend error handling", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("falls back safely for inherited sector and mode key %s", value => {
    expect(parseDemoQuery(`?sector=${value}&mode=${value}`)).toMatchObject({ sector: "fmcg", mode: "all", rail: 30 });
  });
  it("accepts known query values and bounds the rail percentage", () => {
    expect(parseDemoQuery("?sector=pharma&company=CIPLA&mode=air&rail=500")).toEqual({ sector: "pharma", company: "CIPLA", mode: "air", rail: 100, quick: null });
    expect(parseDemoQuery("?rail=-12").rail).toBe(0); expect(parseDemoQuery("?rail=not-a-number").rail).toBe(30); expect(parseDemoQuery("?rail=Infinity").rail).toBe(30);
  });
  it("uses nested server messages without stringifying objects", () => {
    expect(backendErrorMessage({ error: { code: "limit", message: "Too many shipment legs" } }, 413)).toBe("Too many shipment legs");
    expect(backendErrorMessage({ error: "Service waking up" }, 503)).toBe("Service waking up");
    expect(backendErrorMessage({ error: { message: { internal: true } } }, 503)).toBe("The server returned HTTP 503.");
    expect(backendErrorMessage(null, 429)).toBe("The server returned HTTP 429.");
  });
});
