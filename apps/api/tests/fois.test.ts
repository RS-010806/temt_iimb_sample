import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { parseFoisPage } from "../src/fois.js";

// The parts of a RailSAHAY freight calculator answer that TEMT reads. Tests never contact FOIS.
const page = (route: string) => `<html><form id="frmFrgtC" action="/RailSAHAY/FrgtCalc"></form><div>Estimation Method --&gt; VIKALP (Alternate Routes)
  ${route}<b>Carrying Capacity Info:</b></div></html>`;
const shortest = page("<td>Route (Shortest)</td><td>AST-PWL-KOTA-RTM-BRC-VS-ST-BSR-DIVA-TPND</td> --> <b>Distance: &nbsp;</b>1412 Kms");
const rationalised = page("Route (Rationalized) GMO-DHN-ASN --> Distance: &nbsp;</b>1,451 Kms Route (Shortest) GMO-DHN --> Distance: 1440 Kms");
const errorPage = "<html><title>Temprory Issue In RAIL SAHAY</title></html>";

function stub(answers: string[]) {
  const calls: URLSearchParams[] = [];
  const fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(new URLSearchParams(String(init?.body)));
    return new Response(answers.shift() ?? errorPage, { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("FOIS rail distances", () => {
  it("reads the rationalised route first, else the shortest", () => {
    expect(parseFoisPage(shortest)).toEqual({ km: 1412, route: "shortest", via: ["AST", "PWL", "KOTA", "RTM", "BRC", "VS", "ST", "BSR", "DIVA", "TPND"] });
    expect(parseFoisPage(rationalised)).toEqual({ km: 1451, route: "rationalised", via: ["GMO", "DHN", "ASN"] });
    expect(parseFoisPage(errorPage)).toBeUndefined();
  });

  it("asks FOIS once per station pair and serves later requests from storage", async () => {
    const fois = stub([shortest]);
    const app = createApp({ allowedOrigins: [], fois: { fetch: fois.fetch, minGapMs: 0 } });
    const first = await request(app).get("/api/rail/distance?from=tkd&to=KLMG").expect(200);
    expect(first.body).toMatchObject({ from: "TKD", to: "KLMG", km: 1412, route: "shortest", source: expect.stringContaining("FOIS") });
    expect(fois.calls[0]!.get("txtSttnFrom")).toBe("TKD");
    expect(fois.calls[0]!.get("txtCmdtName")).toBe("CEMENT");
    await request(app).get("/api/rail/distance?from=TKD&to=KLMG").expect(200);
    expect(fois.calls).toHaveLength(1);
  });

  it("tries another cargo when FOIS gives no distance, and reports no route after that", async () => {
    const fois = stub([page(""), rationalised, page(""), page("")]);
    const app = createApp({ allowedOrigins: [], fois: { fetch: fois.fetch, minGapMs: 0 } });
    expect((await request(app).get("/api/rail/distance?from=KRBA&to=BNDM").expect(200)).body.km).toBe(1451);
    expect(fois.calls.map((call) => call.get("txtCmdtName"))).toEqual(["CEMENT", "COAL"]);
    expect((await request(app).get("/api/rail/distance?from=ICDD&to=XYZ").expect(404)).body.error.code).toBe("no_route");
  });

  it("answers 503 when FOIS is down, and rejects bad codes without asking FOIS", async () => {
    const fois = stub([errorPage]);
    const app = createApp({ allowedOrigins: [], fois: { fetch: fois.fetch, minGapMs: 0 } });
    expect((await request(app).get("/api/rail/distance?from=HWH&to=NDLS").expect(503)).body.error.code).toBe("fois_unavailable");
    await request(app).get("/api/rail/distance?from=HWH&to=HWH").expect(400);
    await request(app).get("/api/rail/distance?from=HW%20H&to=NDLS").expect(400);
    await request(app).get("/api/rail/distance?from=HWH").expect(400);
    expect(fois.calls).toHaveLength(1);
    const off = createApp({ allowedOrigins: [], fois: { fetch: fois.fetch, enabled: false } });
    await request(off).get("/api/rail/distance?from=HWH&to=NDLS").expect(503);
    expect(fois.calls).toHaveLength(1);
  });

  it("limits how many rail distances one visitor can ask for", async () => {
    const fois = stub([shortest]);
    const app = createApp({ allowedOrigins: [], fois: { fetch: fois.fetch, minGapMs: 0, perIpLimit: 2 } });
    await request(app).get("/api/rail/distance?from=TKD&to=KLMG").expect(200);
    await request(app).get("/api/rail/distance?from=TKD&to=KLMG").expect(200);
    await request(app).get("/api/rail/distance?from=TKD&to=KLMG").expect(429);
  });
});
