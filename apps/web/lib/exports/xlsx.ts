import type { Workbook, Worksheet } from "exceljs";
import { generatedLabel, type ReportModel } from "../report-model";
import { monthLabel } from "../format";
import { downloadBlob, legCsvRows, round, safeCell, t } from "./common";

const MAROON = "FFB12322";
const DEEP = "FF740000";
const STONE = "FFE8E3DB";
const PAPER = "FFFAF8F5";

function header(sheet: Worksheet, columns: { header: string; key: string; width?: number; numFmt?: string }[]) {
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width ?? Math.max(12, column.header.length + 4), style: column.numFmt ? { numFmt: column.numFmt } : {} }));
  const row = sheet.getRow(1);
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAROON } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addRows(sheet: Worksheet, rows: Record<string, unknown>[]) {
  for (const row of rows) sheet.addRow(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCell(value)])));
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.eachRow((row, index) => { if (index > 1 && index % 2 === 0) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } }; }); });
}

function section(sheet: Worksheet, rowIndex: number, title: string) {
  const cell = sheet.getCell(rowIndex, 1);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: DEEP } };
  return rowIndex + 1;
}

function table(sheet: Worksheet, start: number, head: string[], body: (string | number)[][], formats: (string | undefined)[] = []) {
  head.forEach((label, index) => {
    const cell = sheet.getCell(start, index + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAROON } };
  });
  body.forEach((values, r) => values.forEach((value, c) => {
    const cell = sheet.getCell(start + 1 + r, c + 1);
    cell.value = safeCell(value) as string | number;
    if (formats[c]) cell.numFmt = formats[c]!;
    cell.border = { bottom: { style: "thin", color: { argb: STONE } } };
  }));
  return start + body.length + 2;
}

function summarySheet(workbook: Workbook, model: ReportModel) {
  const sheet = workbook.addWorksheet("Summary", { properties: { tabColor: { argb: MAROON } } });
  sheet.columns = [{ width: 44 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 50 }];
  sheet.mergeCells("A1:F1");
  const title = sheet.getCell("A1");
  title.value = `${model.title} · ${model.organisation}`;
  title.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" }, name: "Georgia" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DEEP } };
  title.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 36;
  sheet.mergeCells("A2:F2");
  sheet.getCell("A2").value = `${model.period} · ${generatedLabel(model)}`;
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF636363" } };
  const tt = model.totals;
  const yoy = model.previous ? ((tt.wtwKg - model.previous.totals.wtwKg) / model.previous.totals.wtwKg) * 100 : undefined;
  let row = section(sheet, 4, "Headline");
  row = table(sheet, row, ["Measure", "Value", "Unit"], [
    ["Total emissions, well-to-wheel", round(t(tt.wtwKg)), "t CO2e"],
    ["Tank-to-wheel (vehicle operation)", round(t(tt.ttwKg)), "t CO2e"],
    ["Well-to-tank (energy provision)", round(t(tt.wttKg)), "t CO2e"],
    ["Hubs and terminals", round(t(tt.hubKg)), "t CO2e"],
    ["Shipments calculated", tt.shipments, "count"],
    ["Transport legs", tt.legs, "count"],
    ["Transport activity", round(tt.tonneKm, 0), "tonne-km"],
    ["Emission intensity", round(tt.intensityG, 2), "g CO2e / tonne-km"],
    ["Emissions per tonne shipped", round(tt.kgPerTonne, 2), "kg CO2e / t"],
    ...(yoy !== undefined ? [[`Change vs ${model.previous!.period}`, round(yoy, 1), "%"] as [string, number, string]] : []),
    ...(model.carbonCostInr ? [["Internal carbon cost", round(model.carbonCostInr, 0), "INR"] as [string, number, string]] : []),
  ], [undefined, "#,##0.00", undefined]);
  row = section(sheet, row, "By transport mode");
  row = table(sheet, row, ["Mode", "t CO2e", "Share %", "Tonne-km", "Intensity g/t-km"], model.byMode.map((item) => [item.label, round(t(item.wtwKg)), round(item.share, 1), round(item.tonneKm, 0), item.tonneKm ? round((item.wtwKg / item.tonneKm) * 1000, 1) : 0]), [undefined, "#,##0.00", "0.0", "#,##0", "0.0"]);
  row = section(sheet, row, "By GHG Protocol scope");
  row = table(sheet, row, ["Scope", "t CO2e", "Share %"], model.byScope.map((item) => [item.label, round(t(item.wtwKg)), round(item.share, 1)]), [undefined, "#,##0.00", "0.0"]);
  row = section(sheet, row, "Data quality");
  row = table(sheet, row, ["Basis", "t CO2e", "Share %"], model.byQuality.map((item) => [item.label, round(t(item.wtwKg)), round(item.share, 1)]), [undefined, "#,##0.00", "0.0"]);
  row = section(sheet, row, "BRSR mapping");
  table(sheet, row, ["Indicator", "Value", "", "", "", "Note"], model.brsr.map((item) => [item.indicator, item.value, "", "", "", item.note]));
}

export async function buildWorkbook(model: ReportModel) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TEMT · TCI–IIMB Supply Chain Sustainability Lab";
  workbook.created = new Date(model.generatedAt);
  workbook.title = `${model.title} ${model.period}`;
  summarySheet(workbook, model);

  const monthly = workbook.addWorksheet("Monthly");
  header(monthly, [{ header: "Month", key: "month", width: 14 }, { header: "TTW t CO2e", key: "ttw", numFmt: "#,##0.000" }, { header: "WTT t CO2e", key: "wtt", numFmt: "#,##0.000" }, { header: "WTW t CO2e", key: "wtw", numFmt: "#,##0.000" }, { header: "Tonne-km", key: "tkm", numFmt: "#,##0" }, { header: "Shipments", key: "count" }, { header: "Intensity g/t-km", key: "intensity", numFmt: "0.0" }]);
  addRows(monthly, model.byMonth.map((item) => ({ month: monthLabel(item.key), ttw: t(item.ttwKg), wtt: t(item.wttKg), wtw: t(item.wtwKg), tkm: item.tonneKm, count: item.count, intensity: item.tonneKm ? (item.wtwKg / item.tonneKm) * 1000 : 0 })));

  const shipments = workbook.addWorksheet("Shipments");
  header(shipments, [
    { header: "Reference", key: "ref", width: 18 }, { header: "Date", key: "date", width: 12 }, { header: "Financial year", key: "fiscalYear", width: 14 }, { header: "Business unit", key: "businessUnit", width: 18 },
    { header: "Commodity", key: "commodity", width: 18 }, { header: "Origin", key: "origin", width: 24 }, { header: "Destination", key: "destination", width: 24 }, { header: "Direction", key: "direction", width: 22 },
    { header: "Who pays", key: "paidBy", width: 26 }, { header: "Modes", key: "modes", width: 16 }, { header: "Legs", key: "legs", width: 7 }, { header: "Cargo t", key: "cargoTonnes", numFmt: "#,##0.00" },
    { header: "Distance km", key: "distanceKm", numFmt: "#,##0" }, { header: "Tonne-km", key: "tonneKm", numFmt: "#,##0" }, { header: "TTW kg CO2e", key: "ttwKg", numFmt: "#,##0.00" }, { header: "WTT kg CO2e", key: "wttKg", numFmt: "#,##0.00" },
    { header: "Hubs kg CO2e", key: "hubKg", numFmt: "#,##0.00" }, { header: "WTW kg CO2e", key: "wtwKg", numFmt: "#,##0.00", width: 16 }, { header: "g CO2e/t-km", key: "intensityG", numFmt: "0.0" }, { header: "kg CO2e/t", key: "kgPerTonne", numFmt: "0.00" },
    { header: "Data quality", key: "dataQuality", width: 14 }, { header: "Source", key: "source", width: 12 }, { header: "Status", key: "status", width: 20 },
  ]);
  addRows(shipments, model.shipments as unknown as Record<string, unknown>[]);
  if (model.shipments.length) shipments.addConditionalFormatting({ ref: `R2:R${model.shipments.length + 1}`, rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: MAROON } } as never] });

  const legs = workbook.addWorksheet("Legs");
  const legRows = legCsvRows(model);
  header(legs, Object.keys(legRows[0] ?? { shipment_ref: "" }).map((key) => ({ header: key.replace(/_/g, " "), key, width: key.includes("route") || key === "factor" ? 34 : key.length + 6, numFmt: /kgco2e|tonne_km|distance/.test(key) ? "#,##0.00" : undefined })));
  addRows(legs, legRows);

  const hubs = workbook.addWorksheet("Hubs");
  header(hubs, [{ header: "Shipment", key: "shipmentRef", width: 18 }, { header: "Date", key: "date", width: 12 }, { header: "Hub", key: "hub", width: 34 }, { header: "Type", key: "type", width: 22 }, { header: "WTW kg CO2e", key: "wtwKg", numFmt: "#,##0.00" }, { header: "Basis", key: "basis", width: 90 }]);
  addRows(hubs, model.hubs as unknown as Record<string, unknown>[]);

  for (const [name, buckets] of [["Business units", model.byBusinessUnit], ["Lanes", model.byLane], ["Vehicle classes", model.byVehicle]] as const) {
    const sheet = workbook.addWorksheet(name);
    header(sheet, [{ header: name.replace(/s$/, ""), key: "label", width: 44 }, { header: "WTW t CO2e", key: "wtw", numFmt: "#,##0.000" }, { header: "Share %", key: "share", numFmt: "0.0" }, { header: "Tonne-km", key: "tkm", numFmt: "#,##0" }, { header: "Count", key: "count" }]);
    addRows(sheet, buckets.map((item) => ({ label: item.label, wtw: t(item.wtwKg), share: item.share, tkm: item.tonneKm, count: item.count })));
  }

  const factors = workbook.addWorksheet("Factors used");
  header(factors, [{ header: "Factor", key: "factor", width: 60 }, { header: "WTT", key: "wtt", numFmt: "0.00000" }, { header: "TTW", key: "ttw", numFmt: "0.00000" }, { header: "Unit", key: "unit", width: 16 }, { header: "Source", key: "source", width: 34 }, { header: "Reference", key: "ref", width: 40 }, { header: "Legs", key: "legs" }]);
  addRows(factors, model.factorsUsed);

  const method = workbook.addWorksheet("Methodology");
  method.columns = [{ width: 120 }];
  let r = 1;
  method.getCell(r++, 1).value = `Factor set: ${model.factorSet.label}`;
  method.getCell(r++, 1).value = model.factorSet.description;
  r += 1;
  for (const note of model.notes) { method.getCell(r, 1).value = `• ${note}`; method.getCell(r++, 1).alignment = { wrapText: true }; }
  r += 1;
  method.getCell(r++, 1).value = "Sources";
  for (const source of model.sources) method.getCell(r++, 1).value = `${source.publisher} (${source.year}). ${source.title}. ${source.url}`;
  return workbook;
}

export async function exportXlsx(model: ReportModel, stem: string) {
  const workbook = await buildWorkbook(model);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${stem}.xlsx`);
}
