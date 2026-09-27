import type { ReportModel } from "../report-model";

export type ExportFormat = "pdf" | "xlsx" | "docx" | "csv" | "json" | "powerbi";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; description: string; extension: string }[] = [
  { id: "pdf", label: "PDF report", description: "Board-ready report with charts, BRSR mapping and methodology", extension: "pdf" },
  { id: "xlsx", label: "Excel workbook", description: "Summary with BRSR table, monthly, shipments, legs, hubs, factors and methodology sheets", extension: "xlsx" },
  { id: "docx", label: "Word document", description: "Editable report for sustainability and annual-report teams", extension: "docx" },
  { id: "csv", label: "CSV (leg level)", description: "One row per transport leg with factors and scope, for any tool", extension: "csv" },
  { id: "json", label: "JSON", description: "Machine-readable report for ERP, data lakes and APIs", extension: "json" },
  { id: "powerbi", label: "Power BI pack", description: "Star-schema tables, DAX measures, Power Query and an IIMB theme", extension: "zip" },
];

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Neutralise spreadsheet formula injection in user-supplied text. */
export function safeCell(value: unknown) {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const t = (kg: number) => kg / 1000;
export const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

export function legCsvRows(model: ReportModel) {
  return model.legs.map((leg) => ({
    shipment_ref: leg.shipmentRef, date: leg.date, fiscal_year: leg.fiscalYear, business_unit: leg.businessUnit, commodity: leg.commodity, direction: leg.direction, paid_by: leg.paidBy,
    leg_no: leg.legNo, route: leg.route, mode: leg.mode, vehicle_or_service: leg.detail, method: leg.method, ghg_scope: leg.scope, data_quality: leg.dataQuality,
    tonnes: round(leg.tonnes, 3), distance_km: round(leg.distanceKm, 1), tonne_km: round(leg.tonneKm, 1), ttw_kgco2e: round(leg.ttwKg), wtt_kgco2e: round(leg.wttKg), wtw_kgco2e: round(leg.wtwKg), intensity_gco2e_per_tkm: round(leg.intensityG, 2),
    factor: leg.factor, factor_wtt: leg.factorWtt, factor_ttw: leg.factorTtw, factor_unit: leg.factorUnit, factor_source: leg.source, factor_reference: leg.sourceRef, uplifts: leg.uplifts, warnings: leg.warnings,
    factor_set: model.factorSet.label, engine_version: model.engineVersion,
  }));
}

export async function toCsv(rows: Record<string, unknown>[]) {
  const Papa = (await import("papaparse")).default;
  return "﻿" + Papa.unparse(rows, { escapeFormulae: true });
}

export async function exportCsv(model: ReportModel, stem: string) {
  downloadBlob(new Blob([await toCsv(legCsvRows(model))], { type: "text/csv;charset=utf-8" }), `${stem}-legs.csv`);
}

export function exportJson(model: ReportModel, stem: string) {
  const payload = { schema: "temt-report/2.0", ...model };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${stem}.json`);
}
