import { describe, expect, it } from "vitest";
import { applyFilters, byMode, opportunities, totals } from "./analytics";
import { parse, splitSteps } from "./copilot/nlu";
import { searchKnowledge } from "./copilot/knowledge";
import { detectFormat, parseDate, parseVehicle, parseVessel } from "./import";
import { estimateDistance, type Place } from "./places";
import { DEFAULT_LEVERS, runScenario } from "./planner";
import { compute, scopeOf } from "./records";
import { buildReportModel } from "./report-model";
import { makeSampleWorkspace, SAMPLE_SECTORS, type SampleSector } from "./sample-data";
import { DEFAULT_SETTINGS } from "./store";

const city = (label: string, lat: number, lon: number): Place => ({ label, kind: "city", lat, lon, country: "IN" });

describe("sample workspaces", () => {
  for (const sector of Object.keys(SAMPLE_SECTORS) as SampleSector[]) {
    it(`${sector}: calculates every shipment under both factor sets and improves year on year`, () => {
      const records = makeSampleWorkspace(sector);
      for (const set of ["glec-india", "temt-legacy"] as const) {
        const rows = records.map((record) => compute(record, set));
        expect(rows.filter((row) => row.error)).toEqual([]);
        const previous = totals(applyFilters(rows, { fy: "FY 2024–25" })), current = totals(applyFilters(rows, { fy: "FY 2025–26" }));
        expect(current.shipments).toBeGreaterThan(previous.shipments);
        expect(current.intensityG).toBeLessThan(previous.intensityG);
      }
    });
  }

  it("is deterministic and mode shares add up", () => {
    const a = makeSampleWorkspace("fmcg").map((record) => compute(record, "glec-india"));
    const b = makeSampleWorkspace("fmcg").map((record) => compute(record, "glec-india"));
    expect(totals(a).wtwKg).toBeCloseTo(totals(b).wtwKg, 6);
    expect(byMode(a).reduce((sum, bucket) => sum + bucket.share, 0)).toBeCloseTo(100, 6);
    for (const item of opportunities(a, "glec-india")) expect(item.savingKg).toBeGreaterThanOrEqual(0);
  });
});

describe("scope classification", () => {
  it("follows the GHG Protocol", () => {
    expect(scopeOf({ paidBy: "own-fleet" }, "fuel")).toBe("scope1");
    expect(scopeOf({ paidBy: "own-fleet" }, "energy")).toBe("scope2");
    expect(scopeOf({ paidBy: "company" })).toBe("cat4");
    expect(scopeOf({ paidBy: "customer" })).toBe("cat9");
  });
});

describe("report model", () => {
  const rows = makeSampleWorkspace("pharma").map((record) => compute(record, "glec-india"));
  const model = buildReportModel(rows, { ...DEFAULT_SETTINGS, organisation: { name: "Test", revenueCrore: 1000 } }, { fy: "FY 2025–26" });
  it("agrees with the analytics totals and itemises every leg", () => {
    expect(model.totals.wtwKg).toBeCloseTo(totals(applyFilters(rows, { fy: "FY 2025–26" })).wtwKg, 6);
    expect(model.legs.reduce((sum, leg) => sum + leg.wtwKg, 0) + model.hubs.reduce((sum, hub) => sum + hub.wtwKg, 0)).toBeCloseTo(model.totals.wtwKg, 6);
    expect(model.previous?.period).toBe("FY 2024–25");
    expect(model.brsr.some((row) => row.indicator.includes("₹ crore"))).toBe(true);
    expect(model.factorsUsed.length).toBeGreaterThan(5);
  });

  it("builds every export format", async () => {
    const [{ buildWorkbook }, { buildPdf }, { buildDocx }, { buildPowerBiPack }] = await Promise.all([import("./exports/xlsx"), import("./exports/pdf"), import("./exports/docx"), import("./exports/powerbi")]);
    const workbook = await buildWorkbook(model);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Monthly", "Shipments", "Legs", "Hubs", "Business units", "Lanes", "Vehicle classes", "Factors used", "Methodology"]);
    expect(workbook.getWorksheet("Legs")!.rowCount).toBe(model.legs.length + 1);
    expect((await buildPdf(model)).getNumberOfPages()).toBeGreaterThanOrEqual(6);
    expect((await buildDocx(model)).size).toBeGreaterThan(8000);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await (await buildPowerBiPack(model)).arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["README.md", "dim_date.csv", "dim_factors.csv", "dim_mode.csv", "dim_shipments.csv", "fact_hubs.csv", "fact_legs.csv", "fact_legs.pq", "measures.dax", "report-theme.json"]);
  }, 30000);
});

describe("imports", () => {
  it("reads Indian date formats and Excel serials", () => {
    expect(parseDate("2026-04-03")).toBe("2026-04-03");
    expect(parseDate("03/04/2026")).toBe("2026-04-03");
    expect(parseDate("1-Apr-24")).toBe("2024-04-01");
    expect(parseDate("45383")).toBe("2024-04-01");
    expect(parseDate("not a date")).toBeUndefined();
  });

  it("maps truck descriptions and production TEMT labels to classes", () => {
    expect(parseVehicle("32 ft MXL", 20).id).toBe("gvw-30-50");
    expect(parseVehicle("Medium Commercial Vehicles - 2 | GVW 5 to 12 MT | Payload Capacity 3.5 to 8 MT", 5).id).toBe("gvw-5-12");
    expect(parseVehicle("Small Commercial Vehicles | GVW < 3.5 MT | Payload Capacity 0.5 to 2 MT", 1).id).toBe("gvw-3.5");
    expect(parseVehicle("Tractor Trailer Commercial Vehicles - Trailers | GVW 30 to 60 MT", 30).id).toBe("trailer-30-60");
    expect(parseVehicle("", 9)).toEqual({ id: "gvw-12-20", guessed: true });
  });

  it("detects production TEMT templates and corrects the crude-tanker label", () => {
    expect(detectFormat(["Start Date", "End Date", "Origin", "Destination", "Vehicle Category", "Fuel", "Load"])).toBe("legacy-road");
    expect(detectFormat(["Start Date", "End Date", "Origin", "First Mile Vehicle", "First Mile Fuel"])).toBe("legacy-courier");
    expect(detectFormat(["Start Date", "End Date", "Origin Port", "Destination Port", "Vessel Category", "Vessel Size", "Load in MT", "Distance in Nautical Miles"])).toBe("legacy-water");
    expect(detectFormat(["reference", "origin", "destination", "mode", "tonnes"])).toBe("temt");
    const { vessel, remapped } = parseVessel("Crude tanker", "35000-59999 dwt");
    expect(vessel?.type).toBe("Bulk carrier");
    expect(vessel?.size).toMatch(/^35,000/);
    expect(remapped).toBe(true);
  });
});

describe("distance estimates", () => {
  const delhi = city("Delhi", 28.6519, 77.2315), bengaluru = city("Bengaluru", 12.9719, 77.5937);
  it("uses calibrated network factors and sea routing", () => {
    expect(estimateDistance("road", delhi, bengaluru)!.km).toBeGreaterThan(2000);
    expect(estimateDistance("road", delhi, bengaluru)!.km).toBeLessThan(2250);
    expect(estimateDistance("air", delhi, bengaluru)!.method).toBe("great-circle");
    const sea = estimateDistance("sea", { label: "JNPT", kind: "port", code: "in-jawaharlal-nehru", lat: 18.95, lon: 72.951 }, { label: "Chennai", kind: "port", code: "in-chennai", lat: 13.086, lon: 80.292 });
    expect(sea!.method).toBe("sea-route");
    expect(estimateDistance("road", delhi, { label: "Somewhere", kind: "custom" })).toBeUndefined();
  });
});

describe("planner", () => {
  it("never double counts legs and reduces emissions with default levers", () => {
    const rows = applyFilters(makeSampleWorkspace("materials").map((record) => compute(record, "glec-india")), { fy: "FY 2025–26" });
    const scenario = runScenario(rows, "glec-india", DEFAULT_LEVERS);
    expect(scenario.affectedLegs).toBeLessThanOrEqual(scenario.totalLegs);
    expect(scenario.resultKg).toBeLessThan(scenario.baselineKg);
    const none = runScenario(rows, "glec-india", { ...DEFAULT_LEVERS, railShift: 0, airToRoad: 0, consolidate: 0, evShare: 0, loadFactorGain: 0 });
    expect(none.resultKg).toBeCloseTo(none.baselineKg, 6);
  });
});

describe("copilot language understanding", () => {
  it.each([
    ["20 tonnes from Mumbai to Delhi by 32 ft truck", "calculate", { tonnes: 20, origin: "Mumbai", destination: "Delhi", vehicleClass: "gvw-30-50" }],
    ["calculate 750 kg Pune to Bangalore by courier", "calculate", { tonnes: 0.75, mode: "courier", origin: "Pune", destination: "Bangalore" }],
    ["compare 25 t Chennai to Delhi", "compare", { tonnes: 25, origin: "Chennai", destination: "Delhi" }],
    ["add a shipment of 10 t from 400001 to 110001 refrigerated", "add", { origin: "400001", destination: "110001", refrigerated: true }],
    ["5 trips from Nagpur to Raipur by 32 ft truck", "calculate", { trips: 5 }],
    ["export excel for FY 2025-26", "export", { format: "xlsx", fy: "FY 2025–26" }],
    ["summarise my footprint for FY26", "summary", { fy: "FY 2025–26" }],
    ["what if we shift 40% of road to rail", "scenario", { percent: 40 }],
    ["switch to production TEMT factors", "factor-set", { factorSet: "temt-legacy" }],
    ["load sample pharma data", "sample", { sector: "pharma" }],
    ["give me a tour", "tour", {}],
    ["open reports", "navigate", { page: "/app/reports/" }],
  ])("%s", (text, intent, slots) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe(intent);
    expect(parsed.slots).toMatchObject(slots);
  });

  it("splits compound requests into a plan and finds knowledge articles", () => {
    expect(splitSteps("load sample data and then export a pdf report")).toEqual(["load sample data", "export a pdf report"]);
    expect(splitSteps("compare 10 t pune to delhi")).toHaveLength(1);
    expect(searchKnowledge("what is scope 3 category 9")[0]?.article.id).toBe("scopes");
    expect(searchKnowledge("Is TEMT certified?")[0]?.article.id).toMatch(/credentials|iso14083/);
    expect(searchKnowledge("how do I use e-way bills")[0]?.article.id).toBe("howto-ewaybill");
  });
});
