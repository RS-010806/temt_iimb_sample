import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureDistance, rankPlaces, resolvePlace, searchPlaces } from "./places";

// Serve the location data from public/ as the browser would.
beforeAll(() => {
  vi.stubGlobal("fetch", async (path: string) => {
    const body = readFileSync(join(import.meta.dirname, "..", "public", path), "utf8");
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  });
});

describe("place search", () => {
  it("recognises earlier city names, as bulk uploads use them", async () => {
    expect((await resolvePlace("Bangalore"))?.label).toBe("Bengaluru");
    expect((await resolvePlace("Bangalore, Karnataka"))?.label).toBe("Bengaluru");
    expect((await resolvePlace("Bombay"))?.label).toBe("Mumbai");
    expect((await resolvePlace("Gurgaon"))?.label).toBe("Gurugram");
    expect(await resolvePlace("Xyzzy Nagar")).toBeUndefined();
  });

  it("returns the top five matches, best first", async () => {
    const found = await searchPlaces("bang", ["city", "pin"]);
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found[0]!.label).toBe("Bengaluru");
  });

  it("lists railway stations first for rail, by name or code, including renamed codes", async () => {
    const howrah = await searchPlaces("Howrah", ["station", "city", "pin"]);
    expect(howrah[0]!.kind).toBe("station");
    expect(howrah[0]!.code).toBe("HWH");
    expect((await rankPlaces("NDLS", ["station"]))[0]!.place.label).toBe("New Delhi (NDLS)");
    expect((await searchPlaces("CSMT", ["station"]))[0]!.code).toBe("CSTM");
    expect((await resolvePlace("Bangalore City", ["station", "city"]))?.code).toBe("SBC");
  });
});

describe("rail distances on the Indian Railways network", () => {
  const station = async (code: string) => (await searchPlaces(code, ["station"]))[0]!;
  it.each([["NDLS", "HWH", 1447], ["MAS", "NDLS", 2182], ["PUNE", "CSMT", 192], ["JP", "NDLS", 308]])("%s to %s is close to the published %i km", async (a, b, published) => {
    const estimate = await measureDistance("rail", await station(a), await station(b));
    expect(estimate?.method).toBe("rail-network");
    expect(Math.abs(estimate!.km / published - 1)).toBeLessThan(0.09);
  });

  it("uses the best-connected station near a city", async () => {
    const [delhi] = await searchPlaces("Delhi", ["city"]);
    const [kolkata] = await searchPlaces("Kolkata", ["city"]);
    const estimate = await measureDistance("rail", delhi, kolkata);
    expect(estimate?.method).toBe("rail-network");
    expect(estimate!.km).toBeGreaterThan(1350);
    expect(estimate!.km).toBeLessThan(1600);
  });
});

describe("bulk import references", () => {
  it("keeps references from the file and gives rows without one a unique TEMT reference", async () => {
    const { parseImport } = await import("./import");
    const csv = ["reference,date,origin,destination,mode,tonnes", "LR-501,2026-06-02,Bangalore,Bombay,road,14", ",2026-06-03,Gurgaon,Calcutta,road,9", ",2026-06-04,Pune,Nashik,road,5"].join("\n");
    const { rows } = await parseImport(new File([csv], "refs.csv", { type: "text/csv" }), { businessUnit: "Operations", direction: "outbound", paidBy: "company", factorSet: "temt" });
    expect(rows.map((row) => row.summary.refInFile)).toEqual([true, false, false]);
    expect(rows[0]!.summary.ref).toBe("LR-501");
    expect(rows[1]!.summary.ref).toMatch(/^TEMT-\d{6}-\d{3}$/);
    expect(new Set(rows.map((row) => row.record?.ref)).size).toBe(3);
    expect(rows[0]!.summary.route).toBe("Bengaluru → Mumbai");
  });
});

describe("each mode finds only its own places", () => {
  it("air finds airports by code, city or name, never cities", async () => {
    const mumbai = await searchPlaces("Mumbai", ["airport"]);
    expect(mumbai[0]).toMatchObject({ kind: "airport", code: "BOM" });
    expect(mumbai.every((place) => place.kind === "airport")).toBe(true);
    expect((await searchPlaces("Bangalore", ["airport"]))[0]?.code).toBe("BLR");
    expect((await resolvePlace("DEL", ["airport"]))?.code).toBe("DEL");
  });

  it("sea finds ports by name or the city they serve", async () => {
    expect((await resolvePlace("Nhava Sheva", ["port"]))?.code).toBe("in-jawaharlal-nehru");
    expect((await resolvePlace("Tuticorin", ["port"]))?.code).toBe("in-v-o-chidambaranar");
    expect((await resolvePlace("Kolkata", ["port"]))?.code).toBe("in-syama-prasad-mookerjee");
    expect((await searchPlaces("Vizag", ["port"]))[0]?.code).toMatch(/visakhapatnam|gangavaram/);
    expect(await resolvePlace("Hosur", ["port"])).toBeUndefined();
  });

  it("inland waterways find National Waterway terminals and measure along the waterway", async () => {
    const haldia = await resolvePlace("Haldia", ["terminal"]), patna = await resolvePlace("Patna", ["terminal"]), pandu = await resolvePlace("Guwahati", ["terminal"]);
    expect(haldia?.kind).toBe("terminal");
    expect(pandu?.label).toBe("Pandu (Guwahati) terminal");
    const along = await measureDistance("iww", haldia, patna);
    expect(along?.method).toBe("iww-network");
    // Haldia to Patna is roughly 1,000 km of the Ganga's 1,620 km.
    expect(along!.km).toBeGreaterThan(850);
    expect(along!.km).toBeLessThan(1150);
    const across = await measureDistance("iww", haldia, pandu);
    expect(across?.method).toBe("iww-estimate");
  });
});

describe("per-mode import templates", () => {
  const options = { businessUnit: "Operations", direction: "outbound" as const, factorSet: "temt" as const };
  it("detects and imports each template's own examples", async () => {
    const { IMPORT_TEMPLATES, parseImport, templateCsv } = await import("./import");
    for (const template of IMPORT_TEMPLATES) {
      const csv = await templateCsv(template.id);
      const { format, rows } = await parseImport(new File([csv], `${template.id}.csv`, { type: "text/csv" }), options);
      expect(format).toBe(template.id);
      for (const row of rows) expect(row.status, `${template.id} line ${row.line}: ${row.messages.join(" ")}`).not.toBe("error");
    }
  });

  it("reads each mode's own fields", async () => {
    const { parseImport, templateCsv } = await import("./import");
    const read = async (id: "road" | "courier" | "rail" | "air" | "sea" | "iww") => (await parseImport(new File([await templateCsv(id)], `${id}.csv`), options)).rows;
    const road = await read("road");
    expect(road[1]!.record!.input.legs[0]).toMatchObject({ tonnes: 8.5, fuel: "cng", distanceKm: 985 });
    expect(road[2]!.record!.input.legs[0]).toMatchObject({ method: "fuel", fuelId: "diesel", fuelQuantity: 58, fuelUnit: "l" });
    const air = await read("air");
    expect(air[0]!.record!.input.legs[0]).toMatchObject({ tonnes: 0.8, airService: "belly", airScope: "domestic" });
    expect(air[1]!.record!.origin.code).toBe("BOM");
    expect(air[1]!.record!.input.legs[0]).toMatchObject({ airScope: "international", airService: "freighter" });
    const sea = await read("sea");
    expect(sea[0]!.record!.input.legs[0]).toMatchObject({ seaBasis: "lane", tradeLane: "europe-me-india", containerType: "dry" });
    expect(sea[1]!.record!.input.legs[0]).toMatchObject({ seaBasis: "vessel" });
    const iww = await read("iww");
    expect(iww[0]!.record!.legMeta[0]!.distanceMethod).toBe("iww-network");
    expect(iww[0]!.record!.input.legs[0]!.iwwVesselId).toBe("push-4");
    const courier = await read("courier");
    expect(courier[0]!.record!.input.legs.map((leg) => leg.courierLeg)).toEqual(["first", "mid", "last"]);
    expect(courier[0]!.record!.input.legs[0]!.distanceKm).toBe(20);
    const rail = await read("rail");
    expect(rail[0]!.record!.origin.kind).toBe("station");
  });
});
