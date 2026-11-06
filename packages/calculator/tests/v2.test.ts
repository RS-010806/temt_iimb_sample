import { describe, expect, it } from "vitest";
import {
  calculateHub, calculateLeg, calculateShipment, CalculationError, estimateLandDistanceKm, FACTORS, getPort, greatCircleKm, landPathKm, legInputSchema, PORTS,
  EV_ENERGY_PROXY_KWH_PER_TKM, FUELS, INDIA_ELECTRIC_TRUCKS, INDIA_GRID_KG_PER_KWH, RAIL_FACTORS, ROAD_CLASSES, ROAD_FACTORS, seaRoute, shipmentInputSchema, suggestTradeLane, VESSELS,
} from "../src/index.js";

describe("parity with production TEMT", () => {
  // Values exported from the live TEMT compare screen on 19 September 2026 (Delhi → Bengaluru, 1 t).
  it("reproduces the live road comparison", () => {
    const leg = calculateLeg({ mode: "road", tonnes: 1, distanceKm: 2126.845, vehicleClass: "gvw-5-12", fuel: "diesel" }, "temt");
    expect(leg.wttKg).toBeCloseTo(57.424815, 5);
    expect(leg.ttwKg).toBeCloseTo(189.289205, 5);
    expect(leg.wtwKg).toBeCloseTo(246.71402, 5);
  });

  it("uses GLEC v3.3's Indian rail value (11.0 g CO2e/t-km)", () => {
    const leg = calculateLeg({ mode: "rail", tonnes: 1, distanceKm: 1994.288 }, "temt");
    expect(leg.wttKg).toBeCloseTo(1994.288 * 0.0094, 6);
    expect(leg.ttwKg).toBeCloseTo(1994.288 * 0.00154, 6);
    expect(leg.factor.source).toBe("glec-3.3");
  });

  it("uses GLEC v3.3's Indian domestic air value without the 95 km allowance, and adds it for international flights", () => {
    const leg = calculateLeg({ mode: "air", tonnes: 2, distanceKm: 1000, airScope: "domestic", airService: "freighter" });
    expect(leg.distanceKm).toBe(1000);
    expect(leg.wtwKg).toBeCloseTo(2 * 1000 * (0.216 + 1.043), 6);
    expect(RAIL_FACTORS.temt.source).toBe("glec-3.3");
    const abroad = calculateLeg({ mode: "air", tonnes: 2, distanceKm: 1000, airScope: "international" }, "temt");
    expect(abroad.distanceKm).toBe(1095);
    expect(abroad.wtwKg).toBeCloseTo(2 * 1095 * (0.646 + 0.171), 6);
  });

  it("applies the production refrigeration uplift and courier constants", () => {
    const plain = calculateLeg({ mode: "road", tonnes: 5, distanceKm: 400, vehicleClass: "gvw-12-20" }, "temt");
    const reefer = calculateLeg({ mode: "road", tonnes: 5, distanceKm: 400, vehicleClass: "gvw-12-20", refrigerated: true }, "temt");
    expect(reefer.wtwKg / plain.wtwKg).toBeCloseTo(1.21, 10);
    const mid = calculateLeg({ mode: "road", tonnes: 1, distanceKm: 100, courierLeg: "mid" }, "temt");
    expect(mid.wtwKg).toBeCloseTo(100 * (0.063 + 0.019), 10);
    // Hubs use the global GLEC v3.3 defaults in both sets.
    expect(calculateHub({ type: "transshipment", tonnes: 2 }, "temt").wtwKg).toBeCloseTo(2.4, 10);
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

describe("GLEC v3.3 defaults within TEMT's factors", () => {
  it("matches the v1 published container factor", () => {
    const sea = calculateLeg({ mode: "sea", tonnes: 10, distanceKm: 1000, seaBasis: "lane", tradeLane: "intra-me-india" });
    expect(sea.wtwKg / 10000).toBeCloseTo(FACTORS["ocean-container"].kgCO2ePerTonneKm, 8);
    expect(sea.factor.source).toBe("glec-3.3");
  });

  it("applies the sea distance adjustment only to estimated shortest routes on GLEC vessel values", () => {
    const vesselId = VESSELS.find((vessel) => vessel.type === "Ferry Ro-Pax" && vessel.size.startsWith("0–1,999"))!.id;
    const shortest = calculateLeg({ mode: "sea", tonnes: 1000, distanceKm: 2000, seaBasis: "vessel", vesselId });
    const actual = calculateLeg({ mode: "sea", tonnes: 1000, distanceKm: 2000, seaBasis: "vessel", vesselId, distanceBasis: "actual" });
    expect(shortest.wtwKg / actual.wtwKg).toBeCloseTo(1.15, 10);
    expect(actual.wtwKg).toBeCloseTo(1000 * 2000 * (96.6 + 453.0) / 1000, 6);
  });

  it("names the fuels a vehicle class has when another is asked for", () => {
    expect(() => calculateLeg({ mode: "road", tonnes: 5, distanceKm: 100, vehicleClass: "gvw-30-50", fuel: "petrol" })).toThrow(CalculationError);
  });

  it("publishes every road class with a diesel factor and its operating assumptions", () => {
    expect(ROAD_CLASSES).toHaveLength(7);
    for (const item of ROAD_CLASSES) {
      expect(ROAD_FACTORS.temt[item.id]?.diesel).toBeDefined();
      expect(item.loadFactor).toBeGreaterThan(0.6);
    }
  });
});

describe("electric vehicles, fuel allocation and hubs", () => {
  it("uses measured electricity with the CEA grid factor and zero tank-to-wheel", () => {
    const leg = calculateLeg({ mode: "road", fuel: "electric", tonnes: 1, distanceKm: 80, vehicleClass: "gvw-3.5", energyKwh: 24 });
    expect(leg.method).toBe("energy");
    expect(leg.ttwKg).toBe(0);
    expect(leg.wtwKg).toBeCloseTo(24 * 0.903, 10);
    expect(leg.dataQuality).toBe("primary");
  });

  it("estimates electric trucks with GLEC v3.3's Indian values and marks them as default data", () => {
    // Published WTW intensities: <3.5 t 137.7, 18.5 t 76.8, articulated 55 t 38.6 g CO2e/t-km.
    const light = calculateLeg({ mode: "road", fuel: "electric", tonnes: 1, distanceKm: 80, vehicleClass: "gvw-3.5" });
    expect(light.wtwKg).toBeCloseTo(80 * 0.1377, 2);
    const medium = calculateLeg({ mode: "road", fuel: "electric", tonnes: 10, distanceKm: 100, vehicleClass: "gvw-12-20" });
    expect(medium.wtwKg).toBeCloseTo(1000 * 0.0768, 1);
    expect(medium.dataQuality).toBe("default");
    expect(medium.warnings[0]).toMatch(/GLEC v3\.3's Indian default/);
    const trailer = calculateLeg({ mode: "road", fuel: "electric", tonnes: 30, distanceKm: 500, vehicleClass: "trailer-30-60" });
    expect(trailer.wtwKg / trailer.tonneKm * 1000).toBeCloseTo(38.6, 1);
    // A renewable supply contract scales the same energy.
    const green = calculateLeg({ mode: "road", fuel: "electric", tonnes: 10, distanceKm: 100, vehicleClass: "gvw-12-20", gridKgPerKwh: 0 });
    expect(green.wtwKg).toBe(0);
  });

  it("allocates shared fuel and rejects out-of-range shares", () => {
    const leg = calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "diesel", fuelQuantity: 100, fuelUnit: "kg", allocationShare: 0.25 });
    expect(leg.ttwKg).toBeCloseTo(25 * 3.24, 10);
    expect(() => calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "cng", fuelQuantity: 10, fuelUnit: "l" })).toThrow(/kilograms/);
    expect(() => calculateLeg({ mode: "road", method: "fuel", tonnes: 4, fuelId: "diesel", fuelQuantity: 10, allocationShare: 1.5 })).toThrow(CalculationError);
  });

  it("calculates GLEC v3.3 hub operations per tonne and per container", () => {
    expect(calculateHub({ type: "transshipment", tonnes: 10 }).wtwKg).toBeCloseTo(12, 10);
    expect(calculateHub({ type: "warehouse", tonnes: 2, condition: "mixed" }).wtwKg).toBeCloseTo(100, 10);
    expect(calculateHub({ type: "container-terminal", containers: 3 }).wtwKg).toBeCloseTo(34.2, 10);
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

describe("electric trucks without a GLEC v3.3 Indian value", () => {
  it("keeps GLEC's electricity-to-diesel ratio and applies it to TEMT's Indian diesel use", () => {
    const heavy = ROAD_FACTORS.temt["gvw-30-50"]!.diesel!;
    const expected = (0.16 / 0.037) * ((heavy.wtt + heavy.ttw) / FUELS.diesel.wtw);
    expect(EV_ENERGY_PROXY_KWH_PER_TKM["gvw-30-50"]).toBeCloseTo(expected, 3);
    // On the Indian grid a heavy electric truck should not be far above diesel per tonne-km.
    expect(EV_ENERGY_PROXY_KWH_PER_TKM["gvw-30-50"]! * INDIA_GRID_KG_PER_KWH).toBeLessThan(heavy.wtt + heavy.ttw);
    expect(INDIA_ELECTRIC_TRUCKS["gvw-30-50"]).toBeUndefined();
    const heavyEv = calculateLeg({ mode: "road", fuel: "electric", tonnes: 30, distanceKm: 100, vehicleClass: "gvw-30-50" });
    expect(heavyEv.warnings[0]).toMatch(/no Indian electric value/);
    // Every GLEC v3.3 class reproduces its published intensity at the Indian grid factor.
    for (const [id, truck] of Object.entries(INDIA_ELECTRIC_TRUCKS)) expect(EV_ENERGY_PROXY_KWH_PER_TKM[id as keyof typeof INDIA_ELECTRIC_TRUCKS]! * INDIA_GRID_KG_PER_KWH * 1000).toBeCloseTo(truck!.wtwG, 0);
  });
});
