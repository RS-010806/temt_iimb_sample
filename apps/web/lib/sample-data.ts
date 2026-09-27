import { estimateLandDistanceKm, greatCircleKm, seaRoute, type HubInput, type LegInput, type RoadClassId } from "@temt/calculator";
import { portPlace, type Place } from "./places";
import type { Direction, LegMeta, PaidBy, RecordKind, ShipmentRecord } from "./records";

export type SampleSector = "fmcg" | "automotive" | "pharma" | "materials";

export const SAMPLE_SECTORS: Record<SampleSector, { label: string; company: string; description: string; units: string[] }> = {
  fmcg: { label: "FMCG", company: "Sample FMCG company", description: "Factories, depots, modern trade and export", units: ["Foods", "Home Care", "Personal Care"] },
  automotive: { label: "Automotive", company: "Sample automotive company", description: "Supplier parts, vehicle plants and dealers", units: ["Vehicle Assembly", "Aftermarket Parts", "Component Supply"] },
  pharma: { label: "Pharma", company: "Sample pharma company", description: "Temperature-controlled, air and export flows", units: ["Formulations", "API Manufacturing", "Distribution"] },
  materials: { label: "Cement & materials", company: "Sample materials company", description: "Bulk movements, rail and coastal corridors", units: ["Cement", "Clinker", "Building Products"] },
};

const C = (label: string, lat: number, lon: number, state: string): Place => ({ label, kind: "city", lat, lon, state, country: "IN" });
const CITY = {
  mumbai: C("Mumbai", 19.0728, 72.8826, "MH"), delhi: C("Delhi", 28.6519, 77.2315, "DL"), bengaluru: C("Bengaluru", 12.9719, 77.5937, "KA"),
  chennai: C("Chennai", 13.0878, 80.2785, "TN"), kolkata: C("Kolkata", 22.5626, 88.363, "WB"), hyderabad: C("Hyderabad", 17.384, 78.4564, "TG"),
  ahmedabad: C("Ahmedabad", 23.0258, 72.5873, "GJ"), pune: C("Pune", 18.5196, 73.8554, "MH"), nagpur: C("Nagpur", 21.1463, 79.0849, "MH"),
  jaipur: C("Jaipur", 26.9196, 75.7878, "RJ"), lucknow: C("Lucknow", 26.8393, 80.9231, "UP"), indore: C("Indore", 22.7179, 75.8333, "MP"),
  coimbatore: C("Coimbatore", 11.0056, 76.9661, "TN"), guwahati: C("Guwahati", 26.1844, 91.7458, "AS"), ludhiana: C("Ludhiana", 30.912, 75.8538, "PB"),
  kochi: C("Kochi", 9.9399, 76.2602, "KL"), bhubaneswar: C("Bhubaneswar", 20.2724, 85.8338, "OD"), patna: C("Patna", 25.5941, 85.1356, "BR"),
  raipur: C("Raipur", 21.2379, 81.6337, "CT"), baddi: C("Baddi", 30.958, 76.791, "HP"), sriperumbudur: C("Sriperumbudur", 12.967, 79.942, "TN"),
  hosur: C("Hosur", 12.7409, 77.8253, "TN"), manesar: C("Manesar", 28.354, 76.9386, "HR"), sanand: C("Sanand", 22.9921, 72.3816, "GJ"),
  chakan: C("Chakan", 18.7606, 73.8636, "MH"), silvassa: C("Silvassa", 20.2738, 72.9965, "DH"), vizag: C("Visakhapatnam", 17.6868, 83.2185, "AP"),
  surat: C("Surat", 21.1959, 72.8302, "GJ"), satna: C("Satna", 24.6005, 80.8322, "MP"), chittorgarh: C("Chittorgarh", 24.8887, 74.6269, "RJ"),
};
type CityKey = keyof typeof CITY;

interface Profile {
  plants: CityKey[];
  depots: CityKey[];
  suppliers: CityKey[];
  commodities: string[];
  ftlTonnes: [number, number];
  reefer: number;
  air: number;
  rail: number;
  coastal: number;
  export: number;
  courier: number;
}

const PROFILES: Record<SampleSector, Profile> = {
  fmcg: { plants: ["silvassa", "baddi", "hosur"], depots: ["delhi", "kolkata", "chennai", "hyderabad", "lucknow", "guwahati", "pune", "jaipur", "patna", "kochi"], suppliers: ["indore", "nagpur", "ahmedabad"], commodities: ["Packaged foods", "Detergents", "Personal care", "Packaging material"], ftlTonnes: [14, 30], reefer: 0.12, air: 0.02, rail: 0.14, coastal: 0.05, export: 0.05, courier: 0.12 },
  automotive: { plants: ["manesar", "chakan", "sanand", "sriperumbudur"], depots: ["delhi", "mumbai", "bengaluru", "kolkata", "hyderabad", "lucknow", "jaipur", "coimbatore", "guwahati"], suppliers: ["pune", "hosur", "ludhiana", "chennai"], commodities: ["Finished vehicles", "Engine components", "Body panels", "Spare parts"], ftlTonnes: [10, 24], reefer: 0, air: 0.03, rail: 0.16, coastal: 0.05, export: 0.07, courier: 0.14 },
  pharma: { plants: ["baddi", "hyderabad", "ahmedabad"], depots: ["delhi", "mumbai", "kolkata", "chennai", "bengaluru", "lucknow", "guwahati", "patna", "kochi"], suppliers: ["vizag", "hyderabad", "surat"], commodities: ["Tablets and capsules", "Injectables", "Active ingredients", "Vaccines"], ftlTonnes: [5, 16], reefer: 0.45, air: 0.1, rail: 0.05, coastal: 0.02, export: 0.08, courier: 0.2 },
  materials: { plants: ["satna", "chittorgarh", "raipur"], depots: ["delhi", "mumbai", "kolkata", "lucknow", "nagpur", "patna", "ahmedabad", "jaipur", "bhubaneswar"], suppliers: ["vizag", "nagpur", "bhubaneswar"], commodities: ["Bagged cement", "Clinker", "Fly ash", "Coal"], ftlTonnes: [25, 40], reefer: 0, air: 0, rail: 0.34, coastal: 0.08, export: 0.03, courier: 0.02 },
};

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Estimated road distance; same-city movements are treated as a local haul. */
const road = (a: Place, b: Place) => Math.max(18, Math.round(estimateLandDistanceKm("road", a as Required<Place>, b as Required<Place>)));
const classFor = (tonnes: number): RoadClassId => (tonnes <= 2 ? "gvw-3.5" : tonnes <= 3.5 ? "gvw-3-5" : tonnes <= 8 ? "gvw-5-12" : tonnes <= 12 ? "gvw-12-20" : tonnes <= 20 ? "gvw-20-30" : tonnes <= 40 ? "gvw-30-50" : "trailer-30-60");

export function makeSampleWorkspace(sector: SampleSector, seed = 2026): ShipmentRecord[] {
  const random = rng(seed + sector.length * 97);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const between = (min: number, max: number, digits = 1) => Math.round((min + random() * (max - min)) * 10 ** digits) / 10 ** digits;
  const profile = PROFILES[sector];
  const units = SAMPLE_SECTORS[sector].units;
  const records: ShipmentRecord[] = [];
  const now = new Date().toISOString();
  let serial = 0;

  const push = (kind: RecordKind, date: string, origin: Place, destination: Place, legs: LegInput[], legMeta: LegMeta[], hubs: HubInput[], opts: { direction: Direction; paidBy: PaidBy; unit: string; commodity: string; notes?: string }) => {
    serial += 1;
    records.push({ id: `sample-${sector}-${serial}`, ref: `${sector.slice(0, 3).toUpperCase()}-${date.slice(2, 4)}${date.slice(5, 7)}-${String(serial).padStart(4, "0")}`, date, businessUnit: opts.unit, commodity: opts.commodity,
      origin, destination, direction: opts.direction, paidBy: opts.paidBy, kind, input: { legs, hubs }, legMeta, source: "sample", notes: opts.notes, createdAt: now, updatedAt: now });
  };

  for (const fyStart of [2024]) {
    const improvement = 0;
    for (let m = 0; m < 12; m += 1) {
      const month = ((3 + m) % 12) + 1;
      const year = month >= 4 ? fyStart : fyStart + 1;
      const perMonth = 11 + Math.floor(random() * 5) + (month === 10 || month === 11 ? 3 : 0);
      for (let n = 0; n < perMonth; n += 1) {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(1 + Math.floor(random() * 27)).padStart(2, "0")}`;
        const unit = pick(units);
        const commodity = pick(profile.commodities);
        const roll = random();
        const plant = CITY[pick(profile.plants)];
        const depot = CITY[pick(profile.depots)];
        let bucket = roll;
        const railShare = profile.rail + improvement * 0.05;
        if ((bucket -= profile.air) < 0) {
          const tonnes = between(0.3, 2.4);
          const from = { label: "Delhi (DEL)", kind: "airport" as const, code: "DEL", lat: 28.5665, lon: 77.1031, country: "IN" };
          const to = pick([{ label: "Bengaluru (BLR)", code: "BLR", lat: 13.1979, lon: 77.7063 }, { label: "Chennai (MAA)", code: "MAA", lat: 12.99, lon: 80.1693 }, { label: "Kolkata (CCU)", code: "CCU", lat: 22.6547, lon: 88.4467 }, { label: "Guwahati (GAU)", code: "GAU", lat: 26.1061, lon: 91.5859 }]);
          const toPlace: Place = { ...to, kind: "airport", country: "IN" };
          push("chain", date, CITY.delhi, toPlace, [
            { mode: "road", tonnes, distanceKm: 28, vehicleClass: "gvw-3.5", fuel: "diesel", refrigerated: sector === "pharma" },
            { mode: "air", tonnes, distanceKm: Math.round(greatCircleKm(from, toPlace as Required<Place>)), airService: pick(["unknown", "belly", "belly"] as const) },
          ], [{ from: CITY.delhi, to: from, distanceMethod: "road-estimate" }, { from, to: toPlace, distanceMethod: "great-circle" }], [], { direction: "outbound", paidBy: "company", unit, commodity, notes: "Urgent replenishment" });
        } else if ((bucket -= railShare) < 0) {
          const tonnes = between(profile.ftlTonnes[0] * 1.5, profile.ftlTonnes[1] * 2, 0);
          const km = road(plant, depot);
          push("chain", date, plant, depot, [
            { mode: "road", tonnes, distanceKm: 32, vehicleClass: classFor(tonnes / 2), fuel: "diesel" },
            { mode: "rail", tonnes, distanceKm: Math.round(km * 0.94) },
            { mode: "road", tonnes, distanceKm: 26, vehicleClass: classFor(tonnes / 2), fuel: "diesel" },
          ], [{ from: plant, distanceMethod: "user" }, { distanceMethod: "rail-estimate" }, { to: depot, distanceMethod: "user" }],
          [{ type: "container-terminal", containers: Math.max(1, Math.round(tonnes / 18)), label: "Origin rail terminal" }, { type: "container-terminal", containers: Math.max(1, Math.round(tonnes / 18)), label: "Destination rail terminal" }],
          { direction: "inter-facility", paidBy: "company", unit, commodity });
        } else if ((bucket -= profile.coastal) < 0) {
          const tonnes = between(40, 180, 0);
          const [a, b] = pick([["in-mundra", "in-cochin"], ["in-jawaharlal-nehru", "in-chennai"], ["in-mundra", "in-syama-prasad-mookerjee"], ["in-jawaharlal-nehru", "in-cochin"]] as const);
          const pa = portPlace(a)!, pb = portPlace(b)!;
          const sea = seaRoute(a, b)!;
          push("chain", date, plant, depot, [
            { mode: "road", tonnes, distanceKm: road(plant, pa), vehicleClass: "trailer-30-60", fuel: "diesel" },
            { mode: "sea", tonnes, distanceKm: Math.round(sea.km), seaBasis: "lane", tradeLane: "intra-me-india", containerType: "dry", tonnesPerTeu: 14.5 },
            { mode: "road", tonnes, distanceKm: Math.min(80, road(pb, depot)), vehicleClass: "trailer-30-60", fuel: "diesel" },
          ], [{ from: plant, to: pa, distanceMethod: "road-estimate" }, { from: pa, to: pb, distanceMethod: "sea-route" }, { from: pb, to: depot, distanceMethod: "road-estimate" }],
          [{ type: "container-terminal", containers: Math.ceil(tonnes / 14.5), label: pa.label }, { type: "container-terminal", containers: Math.ceil(tonnes / 14.5), label: pb.label }],
          { direction: "inter-facility", paidBy: "company", unit, commodity, notes: "Coastal container movement" });
        } else if ((bucket -= profile.export) < 0) {
          const tonnes = between(18, 90, 0);
          const [portId, destinationId, lane] = pick([["in-jawaharlal-nehru", "ae-jebel-ali", "intra-me-india"], ["in-jawaharlal-nehru", "nl-rotterdam", "europe-me-india"], ["in-chennai", "sg-singapore", "asia-me-india"], ["in-mundra", "us-new-york-new-jersey", "industry-average"]] as const);
          const port = portPlace(portId)!, dest = portPlace(destinationId)!;
          const sea = seaRoute(portId, destinationId)!;
          push("chain", date, plant, dest, [
            { mode: "road", tonnes, distanceKm: road(plant, port), vehicleClass: "trailer-30-60", fuel: "diesel" },
            { mode: "sea", tonnes, distanceKm: Math.round(sea.km), seaBasis: "lane", tradeLane: lane, containerType: sector === "pharma" ? "reefer" : "dry", tonnesPerTeu: 10 },
          ], [{ from: plant, to: port, distanceMethod: "road-estimate" }, { from: port, to: dest, distanceMethod: "sea-route" }],
          [{ type: "container-terminal", containers: Math.ceil(tonnes / 10), label: port.label }], { direction: "outbound", paidBy: random() < 0.5 ? "company" : "customer", unit, commodity, notes: "Export shipment" });
        } else if ((bucket -= profile.courier) < 0) {
          const tonnes = between(0.2, 1.6);
          const hubA = pick([CITY.delhi, CITY.mumbai, CITY.bengaluru]);
          const hubB = pick([CITY.kolkata, CITY.hyderabad, CITY.chennai, CITY.lucknow]);
          const origin = CITY[pick(profile.plants)];
          const destination = CITY[pick(profile.depots)];
          push("courier", date, origin, destination, [
            { mode: "road", tonnes, distanceKm: Math.max(15, Math.min(90, road(origin, hubA))), vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "first" },
            { mode: "road", tonnes, distanceKm: road(hubA, hubB), vehicleClass: "gvw-20-30", fuel: "diesel", courierLeg: "mid" },
            { mode: "road", tonnes, distanceKm: between(12, 60, 0), vehicleClass: "gvw-3.5", fuel: "diesel", courierLeg: "last" },
          ], [{ from: origin, to: hubA, distanceMethod: "road-estimate" }, { from: hubA, to: hubB, distanceMethod: "road-estimate" }, { from: hubB, to: destination, distanceMethod: "user" }],
          [{ type: "transshipment", tonnes, label: `${hubA.label} hub` }, { type: "transshipment", tonnes, label: `${hubB.label} hub` }], { direction: "outbound", paidBy: "company", unit, commodity, notes: "Express part-truckload" });
        } else if (bucket < 0.08) {
          // Own fleet with measured fuel (primary data), or electric last mile with measured energy.
          const city = CITY[pick(profile.depots)];
          if (random() < 0.45 + improvement * 0.2) {
            const tonnes = between(0.6, 1.8);
            push("single", date, city, { ...city, label: `${city.label} retail cluster` }, [{ mode: "road", fuel: "electric", method: "energy", tonnes, distanceKm: between(40, 110, 0), vehicleClass: "gvw-3.5", energyKwh: between(14, 38) }],
              [{ from: city, distanceMethod: "user" }], [], { direction: "outbound", paidBy: "own-fleet", unit, commodity, notes: "Electric last-mile van, charging log" });
          } else {
            const tonnes = between(6, 14);
            const km = between(180, 420, 0);
            push("single", date, plant, depot, [{ mode: "road", method: "fuel", tonnes, distanceKm: km, fuelId: "diesel", fuelQuantity: Math.round(km / between(3.4, 4.2)), fuelUnit: "l" }],
              [{ from: plant, to: depot, distanceMethod: "user" }], [], { direction: "inter-facility", paidBy: "own-fleet", unit, commodity, notes: "Own truck, fuel card record" });
          }
        } else if (bucket < 0.2) {
          const supplier = CITY[pick(profile.suppliers)];
          const tonnes = between(profile.ftlTonnes[0], profile.ftlTonnes[1]);
          push("single", date, supplier, plant, [{ mode: "road", tonnes, distanceKm: road(supplier, plant), vehicleClass: classFor(tonnes), fuel: "diesel" }],
            [{ from: supplier, to: plant, distanceMethod: "road-estimate" }], [], { direction: "inbound", paidBy: "company", unit, commodity: sector === "materials" ? "Limestone and gypsum" : "Raw material" });
        } else {
          const primary = random() < 0.62;
          const tonnes = primary ? between(profile.ftlTonnes[0], profile.ftlTonnes[1]) : between(2, 9);
          const origin = primary ? plant : depot;
          const destination = primary ? depot : { ...depot, label: `${depot.label} distributors` };
          const km = primary ? road(plant, depot) : between(40, 260, 0);
          const vehicle = classFor(tonnes);
          const fuel = !primary && vehicle === "gvw-5-12" && random() < 0.25 ? "cng" : "diesel";
          push("single", date, origin, destination, [{ mode: "road", tonnes, distanceKm: km, vehicleClass: vehicle, fuel, refrigerated: random() < profile.reefer }],
            [{ from: origin, to: destination, distanceMethod: primary ? "road-estimate" : "user" }], [], { direction: primary ? "inter-facility" : "outbound", paidBy: !primary && random() < 0.3 ? "customer" : "company", unit, commodity });
        }
      }
    }
  }
  // FY 2025–26 repeats the FY 2024–25 network one year later with the changes a reduction programme
  // would make: long hauls moved to rail, air moved to road, electric last mile, and about 6% growth.
  const baseYear = [...records];
  const nextYear = (date: string, offset: number) => `${Number(date.slice(0, 4)) + 1}${date.slice(4, 8)}${String(Math.min(28, Number(date.slice(8, 10)) + offset)).padStart(2, "0")}`;
  for (const record of baseYear) {
    const copies = random() < 0.06 ? 2 : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      const date = nextYear(record.date, copy * 3);
      const opts = { direction: record.direction, paidBy: record.paidBy, unit: record.businessUnit, commodity: record.commodity, notes: record.notes };
      const legs = record.input.legs.map((leg) => ({ ...leg, tonnes: Math.round(leg.tonnes * between(0.94, 1.08, 2) * 100) / 100 }));
      const only = legs.length === 1 ? legs[0]! : undefined;
      if (only?.mode === "road" && !only.method && (only.distanceKm ?? 0) >= 500 && only.tonnes >= 8 && random() < 0.38) {
        const containers = Math.max(1, Math.round(only.tonnes / 18));
        push("chain", date, record.origin, record.destination, [
          { mode: "road", tonnes: only.tonnes, distanceKm: 32, vehicleClass: classFor(only.tonnes / 2), fuel: "diesel" },
          { mode: "rail", tonnes: only.tonnes, distanceKm: Math.round((only.distanceKm ?? 0) * 0.94) },
          { mode: "road", tonnes: only.tonnes, distanceKm: 26, vehicleClass: classFor(only.tonnes / 2), fuel: "diesel" },
        ], [{ from: record.origin, distanceMethod: "user" }, { distanceMethod: "rail-estimate" }, { to: record.destination, distanceMethod: "user" }],
        [{ type: "container-terminal", containers, label: "Origin rail terminal" }, { type: "container-terminal", containers, label: "Destination rail terminal" }], { ...opts, notes: "Shifted from road to rail" });
      } else if (legs.some((leg) => leg.mode === "air") && random() < 0.5) {
        const tonnes = legs[0]!.tonnes;
        push("single", date, record.origin, record.destination, [{ mode: "road", tonnes, distanceKm: road(record.origin, record.destination), vehicleClass: "gvw-5-12", fuel: "diesel", refrigerated: legs[0]!.refrigerated }],
          [{ from: record.origin, to: record.destination, distanceMethod: "road-estimate" }], [], { ...opts, notes: "Moved from air to express road" });
      } else if (only?.mode === "road" && !only.method && (only.distanceKm ?? 0) <= 140 && only.tonnes <= 2.5 && random() < 0.5) {
        const km = only.distanceKm ?? 60;
        push("single", date, record.origin, record.destination, [{ mode: "road", fuel: "electric", method: "energy", tonnes: only.tonnes, distanceKm: km, vehicleClass: "gvw-3.5", energyKwh: Math.round(km * between(0.17, 0.25, 3) * 10) / 10 }],
          record.legMeta, [], { ...opts, paidBy: "own-fleet", notes: "Electric last-mile van, charging log" });
      } else {
        push(record.kind, date, record.origin, record.destination, legs, record.legMeta, (record.input.hubs ?? []).map((hub) => ({ ...hub })), opts);
      }
    }
  }
  return records.sort((a, b) => b.date.localeCompare(a.date));
}
