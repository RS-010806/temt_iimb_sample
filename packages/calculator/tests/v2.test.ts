import { describe, expect, it } from "vitest";
import {
  calculateHub, calculateLeg, calculateShipment, CalculationError, estimateLandDistanceKm, FACTORS, getPort, greatCircleKm, landPathKm, legInputSchema, PORTS,
  ROAD_CLASSES, ROAD_FACTORS, seaRoute, shipmentInputSchema, suggestTradeLane, VESSELS,
} from "../src/index.js";

describe("parity with production TEMT", () => {
  // Values exported from the live TEMT compare screen on 19 September 2026 (Delhi → Bengaluru, 1 t).
  it("reproduces the live road comparison", () => {
    const leg = calculateLeg({ mode: "road", tonnes: 1, distanceKm: 2126.845, vehicleClass: "gvw-5-12", fuel: "diesel" }, "temt");
    expect(leg.wttKg).toBeCloseTo(57.424815, 5);
    expect(leg.ttwKg).toBeCloseTo(189.289205, 5);
    expect(leg.wtwKg).toBeCloseTo(246.71402, 5);
  });

  it("reproduces the live rail comparison", () => {
    const leg = calculateLeg({ mode: "rail", tonnes: 1, distanceKm: 1994.288 }, "temt");
    expect(leg.wttKg).toBeCloseTo(12.3645856, 6);
    expect(leg.ttwKg).toBeCloseTo(8.1765808, 6);
  });

  it("adds the 95 km air routing adjustment in the production set", () => {
    const leg = calculateLeg({ mode: "air", tonnes: 2, distanceKm: 1000, airScope: "domestic" }, "temt");
    expect(leg.distanceKm).toBe(1095);
    expect(leg.wtwKg).toBeCloseTo(2 * 1095 * (1.508 + 0.2444), 6);
  });

  it("applies the production refrigeration uplift and courier constants", () => {
    const plain = calculateLeg({ mode: "road", tonnes: 5, distanceKm: 400, vehicleClass: "gvw-12-20" }, "temt");
    const reefer = calculateLeg({ mode: "road", tonnes: 5, distanceKm: 400, vehicleClass: "gvw-12-20", refrigerated: true }, "temt");
    expect(reefer.wtwKg / plain.wtwKg).toBeCloseTo(1.21, 10);
    const mid = calculateLeg({ mode: "road", tonnes: 1, distanceKm: 100, courierLeg: "mid" }, "temt");
    expect(mid.wtwKg).toBeCloseTo(100 * (0.063 + 0.019), 10);
    expect(calculateHub({ type: "transshipment", tonnes: 2 }, "temt").wtwKg).toBeCloseTo(1.2, 10);
  });
});

describe("worked examples from the TCI–IIMB carbon accounting course", () => {
  // HCV, 18 t, Bengaluru → Mumbai, 990 km.
  it("distance-based method with a supplied intensity", () => {
    const leg = calculateLeg({ mode: "road", tonnes: 18, distanceKm: 990, customFactor: { label: "Course example", wtt: 0, ttw: 0.0485 } });
    expect(leg.wtwKg).toBeCloseTo(864.27, 2);
    expect(leg.dataQuality).toBe("primary");
  });

  it("fuel-based method agrees with the course's 842.3 kg within 1% using GLEC Indian diesel", () => {
    const leg = calculateLeg({ mode: "road", method: "fuel", tonnes: 18, distanceKm: 990, fuelId: "diesel", fuelQuantity: 315, fuelUnit: "l" });
    expect(leg.ttwKg).toBeCloseTo(315 * 0.83 * 3.24, 6);
    expect(Math.abs(leg.ttwKg - 842.3) / 842.3).toBeLessThan(0.01);
    expect(leg.wtwKg).toBeCloseTo(315 * 0.83 * 4.21, 6);
    expect(leg.dataQuality).toBe("primary");
  });
});

describe("GLEC v3.2 India defaults", () => {
  it("matches the v1 published road and container factors", () => {
    const hcv = ROAD_FACTORS["glec-india"]["gvw-30-50"]!.diesel!;
    expect(hcv.wtt + hcv.ttw).toBeCloseTo(FACTORS["road-hcv"].kgCO2ePerTonneKm, 6);
    const sea = calculateLeg({ mode: "sea", tonnes: 10, distanceKm: 1000, seaBasis: "lane", tradeLane: "intra-me-india" });
    expect(sea.wtwKg / 10000).toBeCloseTo(FACTORS["ocean-container"].kgCO2ePerTonneKm, 8);
  });

  it("switches air haul at 1,500 km and uses the aircraft service type", () => {
    const short = calculateLeg({ mode: "air", tonnes: 1, distanceKm: 1500 }, "glec-india");
    const long = calculateLeg({ mode: "air", tonnes: 1, distanceKm: 1501, airService: "freighter" }, "glec-india");
    expect(short.factor.label).toContain("short-haul");
    expect(short.wtwKg).toBeCloseTo(1500 * 1.363, 6);
    expect(long.wtwKg).toBeCloseTo(1501 * 0.608, 6);
    expect(short.distanceKm).toBe(1500);
  });

  it("applies the sea distance adjustment only to estimated shortest routes", () => {
    const vesselId = VESSELS.find((vessel) => vessel.type === "Bulk carrier" && vessel.size.startsWith("60,000"))!.id;
    const shortest = calculateLeg({ mode: "sea", tonnes: 1000, distanceKm: 2000, seaBasis: "vessel", vesselId }, "glec-india");
    const actual = calculateLeg({ mode: "sea", tonnes: 1000, distanceKm: 2000, seaBasis: "vessel", vesselId, distanceBasis: "actual" }, "glec-india");
    expect(shortest.wtwKg / actual.wtwKg).toBeCloseTo(1.15, 10);
    expect(actual.wtwKg).toBeCloseTo(1000 * 2000 * (0.9 + 4.4) / 1000, 6);
  });

  it("falls back across factor sets with a visible warning", () => {
    const leg = calculateLeg({ mode: "road", tonnes: 5, distanceKm: 100, vehicleClass: "gvw-12-20", fuel: "cng" }, "glec-india");
    expect(leg.warnings[0]).toMatch(/TEMT factors value is used/);
    expect(leg.factor.source).toBe("temt");
    expect(() => calculateLeg({ mode: "road", tonnes: 5, distanceKm: 100, vehicleClass: "gvw-30-50", fuel: "petrol" }, "glec-india")).toThrow(CalculationError);
  });

  it("publishes every road class with its GLEC operating assumptions", () => {
    expect(ROAD_CLASSES).toHaveLength(7);
    for (const item of ROAD_CLASSES) {
      expect(ROAD_FACTORS["glec-india"][item.id]?.diesel).toBeDefined();
      expect(item.loadFactor).toBeGreaterThan(0.6);
    }
  });
});

describe("electric vehicles, fuel allocation and hubs", () => {
  it("uses measured electricity with the CEA grid factor and zero tank-to-wheel", () => {
    const leg = calculateLeg({ mode: "road", fuel: "electric", tonnes: 1, distanceKm: 80, vehicleClass: "gvw-3.5", energyKwh: 24 });
    expect(leg.method).toBe("energy");
    expect(leg.ttwKg).toBe(0);
    expect(leg.wtwKg).toBeCloseTo(24 * 0.71, 10);
    expect(leg.dataQuality).toBe("primary");
  });

  it("requires measured energy for light EVs and marks proxies as default data", () => {
    expect(() => calculateLeg({ mode: "road", fuel: "electric", tonnes: 1, distanceKm: 80, vehicleClass: "gvw-3.5" })).toThrow(/measured kWh/);
    const proxy = calculateLeg({ mode: "road", fuel: "electric", tonnes: 10, distanceKm: 100, vehicleClass: "gvw-12-20" });
    expect(proxy.wtwKg).toBeCloseTo(10 * 100 * 0.22 * 0.71, 8);
    expect(proxy.dataQuality).toBe("default");
    expect(proxy.warnings[0]).toMatch(/proxy/);
  });

  it("allocates shared fuel and rejects out-of-range shares", () => {
    const leg = calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "diesel", fuelQuantity: 100, fuelUnit: "kg", allocationShare: 0.25 });
    expect(leg.ttwKg).toBeCloseTo(25 * 3.24, 10);
    expect(() => calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "cng", fuelQuantity: 10, fuelUnit: "l" })).toThrow(/kilograms/);
    expect(() => calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "diesel", fuelQuantity: 10, allocationShare: 1.5 })).toThrow(CalculationError);
  });

  it("calculates GLEC hub operations per tonne and per container", () => {
    expect(calculateHub({ type: "transshipment", tonnes: 10 }, "glec-india").wtwKg).toBeCloseTo(12, 10);
    expect(calculateHub({ type: "warehouse", tonnes: 2, condition: "mixed" }, "glec-india").wtwKg).toBeCloseTo(100, 10);
    expect(calculateHub({ type: "container-terminal", containers: 3 }, "glec-india").wtwKg).toBeCloseTo(34.2, 10);
    expect(() => calculateHub({ type: "container-terminal", tonnes: 3 })).toThrow(/Containers handled/);
  });
});

describe("transport chains", () => {
  it("sums legs and hubs, reports intensity and the weakest data quality", () => {
    const result = calculateShipment({
      legs: [
        { mode: "road", tonnes: 12, distanceKm: 40, vehicleClass: "gvw-5-12" },
        { mode: "rail", tonnes: 12, distanceKm: 1200 },
        { mode: "road", method: "fuel", tonnes: 12, distanceKm: 30, fuelId: "diesel", fuelQuantity: 20, fuelUnit: "l" },
      ],
      hubs: [{ type: "container-terminal", containers: 1 }, { type: "container-terminal", containers: 1 }],
    });
    const legSum = result.legs.reduce((sum, leg) => sum + leg.wtwKg, 0);
    expect(result.wtwKg).toBeCloseTo(legSum + 22.8, 8);
    expect(result.hubKg).toBeCloseTo(22.8, 10);
    expect(result.distanceKm).toBe(1270);
    expect(result.dataQuality).toBe("default");
    expect(result.kgPerTonne).toBeCloseTo(result.wtwKg / 12, 10);
    expect(result.intensityG).toBeCloseTo(result.wtwKg / result.tonneKm * 1000, 10);
  });

  it("validates API inputs", () => {
    expect(legInputSchema.safeParse({ mode: "road", tonnes: 1, distanceKm: 10, vehicleClass: "gvw-3.5" }).success).toBe(true);
    expect(legInputSchema.safeParse({ mode: "truck", tonnes: 1 }).success).toBe(false);
    expect(shipmentInputSchema.safeParse({ legs: [] }).success).toBe(false);
    expect(() => calculateShipment({ legs: [] })).toThrow(CalculationError);
  });
});

describe("land distances", () => {
  const p = (lat: number, lon: number) => ({ lat, lon });
  // Reference road distances: Delhi–Bengaluru 2,127 km (live TEMT export), Mumbai–Delhi ~1,420 km,
  // Kolkata–Guwahati ~1,030 km (via the Siliguri corridor), Chennai–Kolkata ~1,660 km.
  it.each([
    ["Delhi–Bengaluru", p(28.6519, 77.2315), p(12.9719, 77.5937), 2127],
    ["Mumbai–Delhi", p(19.0728, 72.8826), p(28.6519, 77.2315), 1420],
    ["Kolkata–Guwahati", p(22.5626, 88.363), p(26.1844, 91.7458), 1030],
    ["Chennai–Kolkata", p(13.0878, 80.2785), p(22.5626, 88.363), 1660],
    ["Delhi–Guwahati", p(28.6519, 77.2315), p(26.1844, 91.7458), 1900],
  ])("%s road estimate is within 12%% of the reference", (_name, a, b, reference) => {
    const km = estimateLandDistanceKm("road", a, b);
    expect(Math.abs(km - reference) / reference).toBeLessThan(0.12);
  });

  it("routes North-East trips through the Siliguri corridor", () => {
    const direct = greatCircleKm(p(22.5626, 88.363), p(26.1844, 91.7458));
    expect(landPathKm(p(22.5626, 88.363), p(26.1844, 91.7458))).toBeGreaterThan(direct * 1.4);
    expect(landPathKm(p(26.1844, 91.7458), p(25.5788, 91.8933))).toBeCloseTo(greatCircleKm(p(26.1844, 91.7458), p(25.5788, 91.8933)), 6);
  });
});

describe("sea routing", () => {
  const nm = (from: string, to: string) => seaRoute(from, to)!.nauticalMiles;
  it("routes Indian coastal voyages around Sri Lanka", () => {
    expect(nm("in-jawaharlal-nehru", "in-chennai")).toBeGreaterThan(1350);
    expect(nm("in-jawaharlal-nehru", "in-chennai")).toBeLessThan(1600);
    expect(nm("in-v-o-chidambaranar", "in-chennai")).toBeGreaterThan(600);
    expect(nm("in-cochin", "in-jawaharlal-nehru")).toBeLessThan(620);
  });

  it("produces plausible international distances", () => {
    expect(nm("in-jawaharlal-nehru", "ae-jebel-ali")).toBeGreaterThan(1000);
    expect(nm("in-jawaharlal-nehru", "ae-jebel-ali")).toBeLessThan(1250);
    expect(nm("in-jawaharlal-nehru", "nl-rotterdam")).toBeGreaterThan(5800);
    expect(nm("in-jawaharlal-nehru", "nl-rotterdam")).toBeLessThan(6700);
    expect(nm("in-chennai", "sg-singapore")).toBeGreaterThan(1450);
    expect(nm("in-chennai", "sg-singapore")).toBeLessThan(1750);
  });

  it("connects every port and stays within 3.5 times the great-circle distance (peninsula voyages are the longest)", () => {
    const home = getPort("in-jawaharlal-nehru")!;
    for (const port of PORTS) {
      if (port.id === home.id) continue;
      const route = seaRoute(home.id, port.id);
      expect(route, port.id).toBeDefined();
      expect(route!.km).toBeGreaterThanOrEqual(greatCircleKm(home, port) - 1e-6);
      expect(route!.km / greatCircleKm(home, port), port.id).toBeLessThan(3.5);
    }
    expect(seaRoute("in-mumbai", "in-mumbai")).toBeUndefined();
    expect(seaRoute("in-mumbai", "xx-nowhere")).toBeUndefined();
  });
});

describe("container trade lane from the route", () => {
  it("picks the published GLEC lane for Indian voyages", () => {
    expect(suggestTradeLane("IN", "NL")).toBe("europe-me-india");
    expect(suggestTradeLane("CN", "IN")).toBe("asia-me-india");
    expect(suggestTradeLane("IN", "IN")).toBe("intra-me-india");
    expect(suggestTradeLane("IN", "AE")).toBe("intra-me-india");
    expect(suggestTradeLane("IN", "US")).toBe("industry-average");
    expect(suggestTradeLane("SG", "IT")).toBe("asia-med");
    expect(suggestTradeLane("in", "ke")).toBe("asia-africa");
    expect(suggestTradeLane(undefined, "NL")).toBe("intra-me-india");
  });
});
