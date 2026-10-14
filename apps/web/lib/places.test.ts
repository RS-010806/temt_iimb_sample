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
