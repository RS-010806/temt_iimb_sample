import { describe, expect, it } from "vitest";
import { analyze, AnalysisInputError, compareFreightMix, FACTORS, MAX_LEGS } from "../src/index.js";
import type { ShipmentLeg } from "../src/index.js";

function leg(overrides: Partial<ShipmentLeg> = {}): ShipmentLeg {
  return { shipmentId: "SHIP-001", legIndex: 1, date: "2026-01-20", subsidiary: "Industrial", mode: "road", profile: "road-hcv", tonnes: 10, kilometres: 100, ...overrides };
}

describe("published factors and equal-distance comparison", () => {
  it("reproduces the default 16.71 tonne scenario without inventing a savings percentage", () => {
    const result = compareFreightMix(1000, 1000, 30);
    expect(result.baselineKg).toBeCloseTo(66300, 8);
    expect(result.scenarioKg).toBeCloseTo(49590, 8);
    expect(result.savedKg).toBeCloseTo(16710, 8);
    expect(result.reductionPercent).toBeCloseTo(25.2036199095, 8);
  });

  it("handles no modal shift and an all-rail scenario", () => {
    expect(compareFreightMix(1000, 1000, 0).savedKg).toBe(0);
    expect(compareFreightMix(1000, 1000, 100).scenarioKg).toBeCloseTo(10600, 8);
  });

  it.each([[0, 100, 30], [-1, 100, 30], [1, 0, 30], [1, 100, -1], [1, 100, 101], [Infinity, 100, 30], [1, 100, NaN], [1e20, 100, 30]])("rejects invalid scenario %j", (tonnes, km, railPercent) => {
    expect(() => compareFreightMix(tonnes!, km!, railPercent!)).toThrow(RangeError);
  });

  it("publishes source/version metadata and correctly converts ocean TEU factors", () => {
    expect(FACTORS["ocean-container"].kgCO2ePerTonneKm).toBe(114.5 / 1000 / 10);
    expect(FACTORS["ocean-container"].assumptions.join(" ")).toContain("10 tonnes per TEU");
    for (const factor of Object.values(FACTORS)) {
      expect(factor.version).toContain("3.2");
      expect(factor.sourceUrl).toMatch(/^https:\/\//);
      expect(factor.sourcePage).toBeGreaterThan(0);
    }
  });
});

describe("analysis and reconciliation", () => {
  it("reconciles multimodal legs, unique shipments and all chart groupings", () => {
    const result = analyze([
      leg(),
      leg({ legIndex: 2, mode: "rail", profile: "rail-india", kilometres: 500 }),
      leg({ shipmentId: "SHIP-002", subsidiary: "Consumer", date: "2026-02-02", mode: "ocean", profile: "ocean-container", tonnes: 20, kilometres: 1000 }),
      leg({ shipmentId: "SHIP-003", subsidiary: "Global", date: "2026-02-03", mode: "air", profile: "air-long", tonnes: 1, kilometres: 2000 }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.totals).toMatchObject({ shipmentCount: 3, legCount: 4, tonneKm: 28000 });
    expect(result.totals.emissionsKg).toBeCloseTo(1924.3, 10);
    expect(result.byMode.map((row) => row.mode)).toEqual(["road", "rail", "ocean", "air"]);
    for (const grouping of [result.byMode, result.bySubsidiary, result.byMonth]) {
      expect(grouping.reduce((total, row) => total + row.emissionsKg, 0)).toBeCloseTo(result.totals.emissionsKg, 10);
      expect(grouping.reduce((total, row) => total + row.tonneKm, 0)).toBe(result.totals.tonneKm);
      expect(grouping.reduce((total, row) => total + row.legCount, 0)).toBe(4);
    }
    expect(result.byMonth.map((row) => row.month)).toEqual(["2026-01", "2026-02"]);
    expect(result.bySubsidiary.map((row) => row.subsidiary)).toEqual(["Consumer", "Global", "Industrial"]);
    expect(result.stages.map((stage) => stage.count)).toEqual([4, 4, 4, 3]);
  });

  it("uses tonnes and kg correctly, retaining sub-gram precision", () => {
    expect(analyze([leg({ tonnes: 2.5, kilometres: 240 })]).totals.emissionsKg).toBeCloseTo(39.78, 12);
    expect(analyze([leg({ tonnes: 0.0001, kilometres: 1 })]).totals.emissionsKg).toBeCloseTo(0.00000663, 14);
  });

  it("does not reapply distance adjustment to published air factors", () => {
    expect(analyze([leg({ mode: "air", profile: "air-short", tonnes: 2.5, kilometres: 1000 })]).totals.emissionsKg).toBeCloseTo(3407.5, 10);
    expect(analyze([leg({ mode: "air", profile: "air-long", tonnes: 2.5, kilometres: 2000 })]).totals.emissionsKg).toBeCloseTo(3940, 10);
  });

  it("is repeatable apart from measured execution metadata and does not mutate input", () => {
    const input = Object.freeze([Object.freeze({ ...leg(), origin: "Mumbai", destination: "Pune" })]);
    const first = analyze([...input]);
    const second = analyze([...input]);
    const { processingMs, calculatedAt, ...data } = first;
    const { processingMs: secondMs, calculatedAt: secondAt, ...secondData } = second;
    expect(data).toEqual(secondData);
    expect(processingMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(secondMs)).toBe(true);
    expect(Number.isNaN(Date.parse(calculatedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(secondAt))).toBe(false);
    expect(first.rows[0]).not.toHaveProperty("origin");
    expect(input[0]).toHaveProperty("origin", "Mumbai");
  });

  it("returns an honest empty state and all four zero mode buckets", () => {
    const result = analyze([]);
    expect(result.totals).toEqual({ emissionsKg: 0, tonneKm: 0, shipmentCount: 0, legCount: 0 });
    expect(result.byMode).toHaveLength(4);
    expect(result.byMonth).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("accepts exactly 1,000 legs, rejects larger batches and non-array input", () => {
    const rows = Array.from({ length: MAX_LEGS }, (_, i) => leg({ shipmentId: `S-${i}` }));
    expect(analyze(rows).totals.shipmentCount).toBe(1000);
    expect(() => analyze([...rows, leg()])).toThrow(AnalysisInputError);
    expect(() => analyze(null as unknown as unknown[])).toThrow(AnalysisInputError);
  });

  it("groups arbitrary subsidiary labels safely", () => {
    const result = analyze([leg({ subsidiary: "__proto__" }), leg({ shipmentId: "OTHER", subsidiary: "constructor" })]);
    expect(result.bySubsidiary.map((item) => item.subsidiary)).toEqual(["__proto__", "constructor"]);
    expect(result.totals.shipmentCount).toBe(2);
  });
});

describe("shipment integrity and input validation", () => {
  it.each([undefined, "", "rail-india"])("rejects a missing or mismatched road profile: %s", (profile) => {
    const result = analyze([{ ...leg(), profile }]);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatchObject({ rowIndex: 0, code: "invalid_row", fields: ["profile"] });
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "2026-01-20T00:00:00Z", "tomorrow"])("rejects non-calendar date %s", (date) => {
    expect(analyze([leg({ date })]).errors[0]?.fields).toContain("date");
  });

  it("accepts a leap day", () => expect(analyze([leg({ date: "2024-02-29" })]).errors).toEqual([]));

  it.each([0, -3, NaN, Infinity, "10", null])("rejects invalid numeric tonnes %s", (tonnes) => {
    expect(analyze([{ ...leg(), tonnes }]).rows).toEqual([]);
  });

  it("rejects fractional/zero leg indices and unsafe numerical magnitudes", () => {
    for (const overrides of [{ legIndex: 1.5 }, { legIndex: 0 }, { tonnes: 1e300, kilometres: 1e100 }]) {
      expect(analyze([leg(overrides)]).errors[0]?.code).toBe("invalid_row");
    }
  });

  it("keeps known shipments out of totals if any leg fails", () => {
    const result = analyze([leg(), { ...leg({ legIndex: 2 }), tonnes: "bad" }, leg({ shipmentId: "VALID" })]);
    expect(result.rows.map((row) => row.shipmentId)).toEqual(["VALID"]);
    expect(result.totals.emissionsKg).toBeCloseTo(66.3, 10);
    expect(result.errors.map((error) => [error.rowIndex, error.code])).toEqual([[0, "shipment_excluded"], [1, "invalid_row"]]);
  });

  it("rejects every duplicate and excludes the rest of that shipment", () => {
    const result = analyze([leg(), leg(), leg({ legIndex: 2 }), leg({ shipmentId: "OTHER" })]);
    expect(result.errors.map((error) => error.code)).toEqual(["duplicate_leg", "duplicate_leg", "shipment_excluded"]);
    expect(result.totals.shipmentCount).toBe(1);
    expect(result.rows[0]?.shipmentId).toBe("OTHER");
  });

  it("requires contiguous indices while allowing out-of-order input", () => {
    expect(analyze([leg({ legIndex: 2 }), leg()]).rows.map((row) => row.legIndex)).toEqual([2, 1]);
    const result = analyze([leg(), leg({ legIndex: 3 })]);
    expect(result.rows).toEqual([]);
    expect(result.errors.map((error) => error.code)).toEqual(["incomplete_shipment", "shipment_excluded"]);
  });

  it("rejects unidentifiable rows individually and trims shipment IDs before integrity checks", () => {
    const result = analyze([null, { tonnes: 1 }, leg({ shipmentId: " VALID " }), leg({ shipmentId: "VALID", legIndex: 2 })]);
    expect(result.errors).toHaveLength(2);
    expect(result.rows.map((row) => row.shipmentId)).toEqual(["VALID", "VALID"]);
    expect(result.totals.shipmentCount).toBe(1);
  });

  it("makes the 1,500 km air profile boundary explicit", () => {
    expect(analyze([leg({ mode: "air", profile: "air-short", kilometres: 1500 })]).errors).toEqual([]);
    expect(analyze([leg({ mode: "air", profile: "air-long", kilometres: 1500 })]).rows).toEqual([]);
    expect(analyze([leg({ mode: "air", profile: "air-short", kilometres: 1500.1 })]).rows).toEqual([]);
    expect(analyze([leg({ mode: "air", profile: "air-long", kilometres: 1500.1 })]).errors).toEqual([]);
  });
});
