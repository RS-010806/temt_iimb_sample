/**
 * Realistic import files for end-to-end checks and the walkthrough video: the TEMT template,
 * the six production TEMT bulk templates (same headers as iimb.freightemissions.com) and an
 * e-way bill JSON export.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(join(import.meta.dirname, "../../package.json"));
const ExcelJS = require("exceljs") as typeof import("exceljs");

export const FIXTURES = join(import.meta.dirname, "../out/fixtures");

async function sheet(name: string, headers: string[], rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Sheet1");
  ws.addRow(headers);
  rows.forEach((row) => ws.addRow(row));
  writeFileSync(join(FIXTURES, name), Buffer.from(await workbook.xlsx.writeBuffer()));
}

export async function writeFixtures() {
  mkdirSync(FIXTURES, { recursive: true });
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const csv = [
    "reference,leg_no,date,business_unit,commodity,origin,destination,mode,tonnes,distance_km,vehicle_class,fuel,refrigerated,method,fuel_quantity,fuel_unit,energy_kwh,air_service,trade_lane,container_type,tonnes_per_teu,vessel_type,direction,paid_by,notes",
    "LR-2026-1001,1,2026-05-04,Foods,Packaged foods,Silvassa,Delhi,road,22,,32 ft,diesel,no,,,,,,,,,,inter-facility,company,",
    "LR-2026-1002,1,06/05/2026,Home Care,Detergents,421302,560001,road,8.5,985,19 ft,cng,no,,,,,,,,,,outbound,customer,",
    "RR-2026-1003,1,2026-05-09,Foods,Packaged foods,Hosur,Hosur rail terminal,road,40,28,trailer,diesel,,,,,,,,,,,inter-facility,company,",
    "RR-2026-1003,2,2026-05-09,Foods,Packaged foods,Hosur,Guwahati,rail,40,,,,,,,,,,,,,,inter-facility,company,",
    "AWB-2026-1004,1,2026-05-12,Personal Care,Samples,DEL,BLR,air,0.8,,,,,,,,,belly,,,,,outbound,company,",
    "BL-2026-1005,1,2026-05-15,Exports,Packaged foods,Jawaharlal Nehru Port,Rotterdam,sea,60,,,,,,,,,,europe-me-india,dry,10,,outbound,company,",
    "OWN-2026-1006,1,2026-05-18,Foods,Packaged foods,Pune,Nashik,road,12,212,gvw-12-20,diesel,,fuel,58,l,,,,,,,inter-facility,own-fleet,Fuel card record",
    "BAD-2026-1007,1,2026-05-20,Foods,Packaged foods,Nowhere Town,Delhi,road,-5,,,,,,,,,,,,,,outbound,company,",
  ].join("\n");
  writeFileSync(join(FIXTURES, "temt-template.csv"), csv);

  await sheet("legacy-point-to-point.xlsx", ["Start Date", "End Date", "Origin", "Destination", "Vehicle Category", "Fuel", "Load"], [
    [d("2025-04-01"), d("2025-04-30"), "Mumbai, Maharashtra, India", "Pune, Maharashtra, India", "Ultra Heavy Commercial Vehicles - Rigid Trucks | GVW 30 to 50 MT | Payload Capacity 20 to 40 MT", "Diesel", 22],
    [d("2025-05-01"), d("2025-05-31"), "Ahmedabad, Gujarat, India", "Jaipur, Rajasthan, India", "Intermediate Commercial Vehicles - Rigid Trucks | GVW 5 to 12 MT | Payload Capacity 3.5 to 8 MT", "CNG", 6],
  ]);
  await sheet("legacy-railway.xlsx", ["Start Date", "End Date", "Origin Station", "Destination Station", "Load in MT"], [
    [d("2025-06-01"), d("2025-06-30"), "New Delhi", "Chennai Central", 180],
  ]);
  await sheet("legacy-air.xlsx", ["Shipment Start Date", "Shipment End Date", "Origin", "Destination", "Load in MT"], [
    [d("2025-07-01"), d("2025-07-31"), "DEL - Indira Gandhi International Airport", "BOM - Chhatrapati Shivaji Maharaj International Airport", 1.5],
  ]);
  await sheet("legacy-coastal.xlsx", ["Start Date", "End Date", "Origin Port", "Destination Port", "Vessel Category", "Vessel Size", "Load in MT"], [
    [d("2025-08-01"), d("2025-08-31"), "Jawaharlal Nehru Port", "Cochin Port", "Crude tanker", "35000-59999 dwt", 500],
    [d("2025-08-05"), d("2025-08-31"), "Chennai Port", "Paradip Port", "Container Ship", "1000-1999 TEU", 200],
  ]);
  await sheet("legacy-international-water.xlsx", ["Start Date", "End Date", "Origin Port", "Destination Port", "Vessel Category", "Vessel Size", "Load in MT", "Distance in Nautical Miles"], [
    [d("2025-09-01"), d("2025-09-30"), "Jawaharlal Nehru Port", "Rotterdam", "Container Ship", "5000-7999 TEU", 60, 6300],
  ]);
  await sheet("legacy-courier.xlsx", ["Start Date", "End Date", "Origin", "First Mile Vehicle", "First Mile Fuel", "Origin Hub", "Mid Mile Vehicle", "Mid Mile Fuel", "Destination Hub", "Last Mile Vehicle", "Last Mile Fuel", "Destination", "Load in MT"], [
    [d("2025-10-01"), d("2025-10-31"), "Gurugram", "Small Commercial Vehicles | GVW < 3.5 MT | Payload Capacity 0.5 to 2 MT", "Diesel", "Delhi", "Heavy Commercial Vehicles - Rigid Trucks | GVW 20 to 30 MT | Payload Capacity 12 to 20 MT", "Diesel", "Lucknow", "Small Commercial Vehicles | GVW < 3.5 MT | Payload Capacity 0.5 to 2 MT", "Diesel", "Kanpur", 0.8],
  ]);
  writeFileSync(join(FIXTURES, "ewaybills.json"), JSON.stringify({ version: "1.0.0621", billLists: [
    { ewbNo: "341009876543", docNo: "INV-8841", docDate: "05/04/2026", fromPincode: 411001, toPincode: 560001, fromPlace: "Pune", toPlace: "Bengaluru", transDistance: "842", transMode: "1", itemList: [{ productName: "Detergent powder", hsnCode: "34022010", quantity: 9500, qtyUnit: "KGS" }] },
    { ewbNo: "341009876544", docNo: "INV-8842", docDate: "07/04/2026", fromPincode: 110001, toPincode: 700001, transDistance: "0", transMode: "2", itemList: [{ productName: "Packaged foods", quantity: 180, qtyUnit: "QTL" }] },
    { ewbNo: "341009876545", docNo: "INV-8843", docDate: "09/04/2026", fromPincode: 380001, toPincode: 400001, transDistance: "530", transMode: "1", itemList: [{ productName: "Cartons", quantity: 1200, qtyUnit: "NOS" }] },
  ] }, null, 2));
  return FIXTURES;
}

if (process.argv[1]?.endsWith("fixtures.ts")) writeFixtures().then((dir) => console.log(`Fixtures written to ${dir}`));
