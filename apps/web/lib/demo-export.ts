import { FACTORS, type AnalysisResult } from "@temt/calculator";
import { enrichRows, formatNumber, type DemoLeg, type Filters } from "./demo-data";

export type ExportContext = { analysis: AnalysisResult; rawRows: DemoLeg[]; name: string; filters: Filters; synthetic: boolean; processing: string };
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); }
const dateStamp = () => new Date().toISOString().slice(0, 10);
export function validationSummary(context: ExportContext) {
  const errors = context.analysis.errors;
  const rowIndexes = new Set(errors.map(error => error.rowIndex));
  const identifiers = new Set(errors.map(error => error.shipmentId || context.rawRows[error.rowIndex]?.shipmentId).filter(Boolean));
  return { validationExceptionCount: errors.length, excludedRowCount: rowIndexes.size, excludedShipmentCount: identifiers.size, validationScope: "Full input before view filters", sourceRowCount: context.rawRows.length };
}

export function buildExceptionRows(context: ExportContext) {
  return context.analysis.errors.map(error => {
    const raw = context.rawRows[error.rowIndex];
    return { rowIndex: error.rowIndex, sourceRow: error.rowIndex + 1, csvLine: error.rowIndex + 2, shipmentId: error.shipmentId || raw?.shipmentId || "", legIndex: raw?.legIndex ?? "", code: error.code, fields: error.fields?.join("; ") || "", message: error.message, inputRow: raw ? JSON.stringify(raw) : "", validationScope: "Full input before view filters" };
  });
}

export function buildExportRows(context: ExportContext) {
  const validation = validationSummary(context);
  return enrichRows(context.analysis.rows, context.rawRows).map(row => ({ shipmentId: row.shipmentId, legIndex: row.legIndex, date: row.date, subsidiary: row.subsidiary, origin: row.origin || "", destination: row.destination || "", mode: row.mode, profile: row.profile, tonnes: row.tonnes, kilometres: row.kilometres, tonneKm: row.tonneKm, emissionsKg: row.emissionsKg, emissionsTonnes: row.emissionsKg / 1000, factorKgPerTonneKm: row.factorKgPerTonneKm, factorVersion: row.factorVersion, engineVersion: context.analysis.engineVersion, calculatedAt: context.analysis.calculatedAt, dataType: context.synthetic ? "synthetic scenario" : "user supplied", processing: context.processing, companyScenario: context.name, filterMode: context.filters.mode, filterSubsidiary: context.filters.subsidiary, filterFrom: context.filters.from, filterTo: context.filters.to, recordType: "shipment_leg", ...validation }));
}

/** Empty standalone exports retain an explicitly typed metadata record, never a fake shipment. */
export async function buildStandaloneCSV(context: ExportContext) {
  const rows = buildExportRows(context);
  if (rows.length) return serializeCSV(rows);
  const emptyFields = Object.fromEntries(EXPORT_COLUMNS.map(column => [column, ""]));
  return serializeCSV([{ ...emptyFields, recordType: "validation_summary", companyScenario: context.name, filterMode: context.filters.mode, filterSubsidiary: context.filters.subsidiary, filterFrom: context.filters.from, filterTo: context.filters.to, engineVersion: context.analysis.engineVersion, calculatedAt: context.analysis.calculatedAt, dataType: context.synthetic ? "synthetic scenario" : "user supplied", processing: context.processing, ...validationSummary(context) }]);
}
const EXPORT_COLUMNS = "shipmentId,legIndex,date,subsidiary,origin,destination,mode,profile,tonnes,kilometres,tonneKm,emissionsKg,emissionsTonnes,factorKgPerTonneKm,factorVersion,engineVersion,calculatedAt,dataType,processing,companyScenario,filterMode,filterSubsidiary,filterFrom,filterTo,recordType,validationExceptionCount,excludedRowCount,excludedShipmentCount,validationScope,sourceRowCount".split(",");
export async function serializeCSV(rows: Record<string, unknown>[], emptyColumns: string[] = EXPORT_COLUMNS) { const Papa = await import("papaparse"); return rows.length ? Papa.default.unparse(rows, { escapeFormulae: true }) : emptyColumns.join(","); }

export async function exportCSV(context: ExportContext) {
  const csv = await buildStandaloneCSV(context);
  downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `temt-freight-${dateStamp()}.csv`);
}

export async function downloadSample(rows: DemoLeg[]) {
  const csv = await serializeCSV(rows.map(row => ({ shipmentId: row.shipmentId, legIndex: row.legIndex, date: row.date, subsidiary: row.subsidiary, origin: row.origin, destination: row.destination, mode: row.mode, profile: row.profile, tonnes: row.tonnes, kilometres: row.kilometres })));
  downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "temt-sample-shipments.csv");
}

export async function buildPowerBIPack(context: ExportContext) {
  const [{ default: JSZip }, shipments] = await Promise.all([import("jszip"), serializeCSV(buildExportRows(context))]);
  const zip = new JSZip();
  const validation = validationSummary(context);
  zip.file("exceptions.csv", await serializeCSV(buildExceptionRows(context), ["rowIndex", "sourceRow", "csvLine", "shipmentId", "legIndex", "code", "fields", "message", "inputRow", "validationScope"]));
  zip.file("shipments.csv", `\uFEFF${shipments}`);
  zip.file("summary.csv", await serializeCSV([{ companyScenario: context.name, totalEmissionsKg: context.analysis.totals.emissionsKg, totalTonneKm: context.analysis.totals.tonneKm, shipments: context.analysis.totals.shipmentCount, legs: context.analysis.totals.legCount, from: context.filters.from, to: context.filters.to, subsidiary: context.filters.subsidiary, mode: context.filters.mode, dataType: context.synthetic ? "synthetic scenario" : "user supplied", engineVersion: context.analysis.engineVersion, calculatedAt: context.analysis.calculatedAt, ...validation }]));
  zip.file("README.md", `# TEMT Power BI data pack\n\nThis is an import-ready file pack, not a live Power BI connection.\n\nScenario: ${context.name}\nData: ${context.synthetic ? "SYNTHETIC. Not actual company performance." : "User supplied. No independent assurance."}\nFilters: ${JSON.stringify(context.filters)}\nCalculation: ${context.processing}; engine ${context.analysis.engineVersion}; ${context.analysis.calculatedAt}\n\n## Import\n1. Unzip this folder.\n2. In Power BI Desktop select Get data > Text/CSV and choose shipments.csv.\n3. Choose UTF-8 encoding, then Load. The table should be named Shipments.\n4. Alternatively use query.m in a blank Power Query and update CsvPath to your local file.\n5. Add the measures in measures.txt, one at a time.\n6. Plot Date against Emissions (tCO2e), or Mode against Emissions (tCO2e).\n\nThe selected filters are already applied. Shipments with invalid legs are excluded as a whole before filtering. exceptions.csv contains every validation exception, full identifiers, source row numbers and original input rows. Summary counts cover the entire submitted input before filters, not just the current view. sourceRow is one-based; rowIndex is zero-based; csvLine assumes a one-line header. Excluded row and shipment counts are distinct counts, while validationExceptionCount counts exception records. A standalone CSV with no matching valid legs contains only a recordType=validation_summary metadata record; it is not a shipment. The ZIP shipments.csv remains header-only in that case.\n\n## Calculation\nEmissions kgCO2e = tonnes × kilometres × profile factor. Profiles and assumptions are included in factors.json. These are published factor-based illustrations. This demo is not the certified TEMT platform and does not issue assured reports. Road-to-rail scenarios hold tonne-kilometres constant and do not model rail access, capacity, routing or commercial feasibility.\n\nOfficial TEMT: https://iimb.freightemissions.com/\nDPIIT interface: https://dpiit.freightemissions.com/\nSGS opinion: https://dpiit.freightemissions.com/certification.pdf\n`);
  zip.file("factors.json", JSON.stringify(FACTORS, null, 2));
  zip.file("field-definitions.csv", await serializeCSV([
    { field: "validationExceptionCount / excludedRowCount / excludedShipmentCount", type: "Whole number", definition: "Full-input exception records, distinct excluded input rows, and identifiable excluded shipments before view filters" }, { field: "recordType", type: "Text", definition: "shipment_leg for freight records; validation_summary for metadata-only standalone empty exports" }, { field: "validationScope / sourceRowCount", type: "Text / whole number", definition: "Validation applies to the complete input before filters; total input row count" }, { field: "shipmentId", type: "Text", definition: "Shipment identifier; unique together with legIndex" }, { field: "legIndex", type: "Whole number", definition: "Ordered leg number, starting from 1" }, { field: "date", type: "Date", definition: "Movement date in YYYY-MM-DD" }, { field: "subsidiary", type: "Text", definition: "Business unit supplied with the record" }, { field: "origin / destination", type: "Text", definition: "Illustrative or user supplied labels; distance is entered separately" }, { field: "mode / profile", type: "Text", definition: "Transport mode and published emission factor profile" }, { field: "tonnes", type: "Decimal", definition: "Cargo mass in metric tonnes" }, { field: "kilometres", type: "Decimal", definition: "Leg distance in kilometres" }, { field: "tonneKm", type: "Decimal", definition: "tonnes multiplied by kilometres" }, { field: "emissionsKg", type: "Decimal", definition: "Calculated kgCO2e, without intermediate rounding" }, { field: "emissionsTonnes", type: "Decimal", definition: "emissionsKg divided by 1000" }, { field: "factorKgPerTonneKm", type: "Decimal", definition: "Applied emissions factor in kgCO2e per tonne-kilometre" }, { field: "factorVersion / engineVersion", type: "Text", definition: "Calculation provenance identifiers" }, { field: "calculatedAt", type: "Datetime", definition: "UTC ISO8601 calculation timestamp" }, { field: "dataType / processing", type: "Text", definition: "Synthetic/user supplied provenance and local/backend processing" },
  ]));
  zip.file("measures.txt", "// Table name: Shipments\n\nEmissions (tCO2e) = SUM(Shipments[emissionsKg]) / 1000\n\nTonne kilometres = SUM(Shipments[tonneKm])\n\nIntensity (gCO2e per tkm) = DIVIDE(SUM(Shipments[emissionsKg]) * 1000, SUM(Shipments[tonneKm]))\n\nShipments = DISTINCTCOUNT(Shipments[shipmentId])\n\nLegs = COUNTROWS(Shipments)\n");
  zip.file("query.m", `let\n    CsvPath = "C:\\TEMT\\shipments.csv",\n    Source = Csv.Document(File.Contents(CsvPath), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),\n    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),\n    Types = Table.TransformColumnTypes(Headers, {{"date", type date}, {"legIndex", Int64.Type}, {"tonnes", type number}, {"kilometres", type number}, {"tonneKm", type number}, {"emissionsKg", type number}, {"emissionsTonnes", type number}, {"factorKgPerTonneKm", type number}}, "en-US")\nin\n    Types\n`);
  return zip;
}

export async function exportPowerBI(context: ExportContext) {
  const zip = await buildPowerBIPack(context);
  downloadBlob(await zip.generateAsync({ type: "blob" }), `temt-powerbi-${dateStamp()}.zip`);
}

export async function buildReportPDF(context: ExportContext) {
  const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ unit: "mm", format: "a4" });
  const validation = validationSummary(context);
  const ink = "#21331f", muted = "#6e7e62", orange = "#c66a3e"; const left = 18; let y = 20;
  doc.setFillColor("#f5f4eb"); doc.rect(0, 0, 210, 297, "F"); doc.setTextColor(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(25); doc.text("TEMT / FREIGHT REPORT", left, y); y += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); const nameLines = doc.splitTextToSize(context.name, 173); doc.text(nameLines, left, y); y += nameLines.length * 5 + 2; doc.setTextColor(orange); doc.setFontSize(8); doc.text(context.synthetic ? "ILLUSTRATIVE SCENARIO. SYNTHETIC DATA." : "USER-SUPPLIED DATA. UNASSURED CALCULATIONS.", left, y); y += 10;
  doc.setTextColor(muted); const filterText = `${context.filters.from || "Start"} to ${context.filters.to || "Present"} | Mode: ${context.filters.mode} | Unit: ${context.filters.subsidiary}`; doc.text(doc.splitTextToSize(filterText, 173), left, y); y += 12;
  const metrics = [["EMISSIONS", `${formatNumber(context.analysis.totals.emissionsKg / 1000, 2)} tCO2e`], ["SHIPMENTS", formatNumber(context.analysis.totals.shipmentCount)], ["FREIGHT ACTIVITY", `${formatNumber(context.analysis.totals.tonneKm, 0)} tkm`]];
  for (let i = 0; i < metrics.length; i++) { const x = left + i * 59; doc.setDrawColor("#ced8c3"); doc.roundedRect(x, y, 55, 26, 1, 1); doc.setFontSize(7); doc.setTextColor(muted); doc.text(metrics[i][0], x + 5, y + 8); doc.setFontSize(i === 2 ? 11 : 14); doc.setTextColor(ink); doc.text(metrics[i][1], x + 5, y + 18); } y += 39;
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("WHERE EMISSIONS OCCUR", left, y); y += 8;
  const largest = Math.max(...context.analysis.byMode.map(row => row.emissionsKg), 1);
  for (const row of context.analysis.byMode) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(muted); doc.text(row.mode.toUpperCase(), left, y + 4); doc.setFillColor("#b3c894"); doc.rect(left + 25, y, (row.emissionsKg / largest) * 103, 5, "F"); doc.setTextColor(ink); doc.text(`${formatNumber(row.emissionsKg / 1000, 2)} tCO2e`, 191, y + 4, { align: "right" }); y += 11; }
  y += 8; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("METHOD & PROVENANCE", left, y); y += 7; doc.setFont("helvetica", "normal"); doc.setTextColor(muted); doc.setFontSize(8);
  const notes = [`Emissions kgCO2e = tonnes x kilometres x profile factor. Engine: ${context.analysis.engineVersion}.`, `Calculated: ${context.analysis.calculatedAt}. Processing: ${context.processing}.`, "Published factors are illustrative. Authorized product preview; separate demonstration engine. Certification applies to the operational TEMT platform.", "Road HCV, India rail, container ocean at 10t/TEU, and distance-specific air profiles are used.", "Selected filters are applied after validation. A shipment with an invalid leg is excluded in full.", `Validation: ${validation.validationExceptionCount} exception records; ${validation.excludedRowCount} excluded rows; ${validation.excludedShipmentCount} identifiable excluded shipments from ${validation.sourceRowCount} input rows. Counts cover the full input before filters.`, "Full factor values, assumptions and source references are included in the methodology appendix.", ...(validation.validationExceptionCount ? ["Every rejected row and exclusion reason is listed in the validation exceptions appendix."] : [])];
  for (const note of notes) { const lines = doc.splitTextToSize(note, 173); doc.text(lines, left, y); y += lines.length * 4 + 2; }
  const rows = enrichRows(context.analysis.rows, context.rawRows); doc.addPage(); y = 21; const header = () => { doc.setTextColor(ink); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("SHIPMENT LEDGER", left, y); y += 10; doc.setFontSize(7); const columns = [["SHIPMENT / LEG", 18], ["DATE", 53], ["MODE", 78], ["TONNES", 99], ["KM", 124], ["TKM", 143], ["KGCO2E", 174]] as const; for (const [label, x] of columns) doc.text(label, x, y); y += 5; doc.setDrawColor("#ced8c3"); doc.line(18, y - 2, 193, y - 2); y += 2; doc.setFont("helvetica", "normal"); };
  header(); for (const row of rows) {
    doc.setFontSize(7); const identifierLines = doc.splitTextToSize(`${row.shipmentId} / ${row.legIndex}`, 31) as string[]; const rowHeight = Math.max(6, identifierLines.length * 3.2 + 2);
    if (y + rowHeight > 275) { doc.addPage(); y = 21; header(); }
    doc.setFontSize(7); doc.setTextColor(muted); doc.text(identifierLines, 18, y, { lineHeightFactor: 1.29 }); doc.text(row.date, 53, y); doc.text(row.mode, 78, y);
    const numbers = [[formatNumber(row.tonnes, 1), 118, 21], [formatNumber(row.kilometres), 139, 18], [formatNumber(row.tonneKm), 170, 28], [formatNumber(row.emissionsKg, 2), 194, 22]] as const;
    for (const [text, x, maxWidth] of numbers) { doc.setFontSize(7); const width = doc.getTextWidth(text); if (width > maxWidth) doc.setFontSize(Math.max(4, 7 * maxWidth / width)); doc.text(text, x, y, { align: "right" }); }
    y += rowHeight;
  }
  if (!rows.length) doc.text("No valid rows match the selected filters.", left, y + 5);
  doc.addPage(); y = 21;
  const methodologyHeading = (continued = false) => { doc.setFont("helvetica", "bold"); doc.setTextColor(ink); doc.setFontSize(14); doc.text(continued ? "METHODOLOGY / CONTINUED" : "METHODOLOGY / FACTOR REGISTER", left, y); y += 10; };
  methodologyHeading();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted);
  const methodologyIntro = doc.splitTextToSize("Published well-to-wheel default factors. These are estimates, not measured carrier-specific factors. The demonstration engine is separate from the certified operational TEMT platform. Values below are applied without intermediate rounding.", 174);
  doc.text(methodologyIntro, left, y); y += methodologyIntro.length * 4 + 8;
  for (const factor of Object.values(FACTORS)) {
    const assumptions = factor.assumptions.map(assumption => doc.splitTextToSize(`- ${assumption.replace(/[–—]/g, "-").replaceAll("CO₂", "CO2")}`, 169) as string[]);
    const height = 21 + assumptions.reduce((sum, lines) => sum + lines.length * 4, 0);
    if (y + height > 268) { doc.addPage(); y = 21; methodologyHeading(true); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(ink); doc.text(factor.id, left, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted); doc.text(factor.label.replace(/[–—]/g, "-"), left, y); y += 5;
    doc.setTextColor(orange); doc.text(`${factor.kgCO2ePerTonneKm} kgCO2e / tonne-km | ${factor.version} | Source 1, page ${factor.sourcePage}`, left, y); y += 6;
    doc.setTextColor(muted); for (const lines of assumptions) { doc.text(lines, left + 3, y); y += lines.length * 4; }
    y += 5; doc.setDrawColor("#dce3d2"); doc.line(left, y - 5, 192, y - 5);
  }
  const source = Object.values(FACTORS)[0]; const sourceLines = doc.splitTextToSize(source.sourceUrl, 173) as string[];
  if (y + sourceLines.length * 4 + 28 > 268) { doc.addPage(); y = 21; methodologyHeading(true); }
  doc.setFont("helvetica", "bold"); doc.setTextColor(ink); doc.setFontSize(10); doc.text("SOURCE 1 / PUBLISHED FACTORS", left, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted); doc.text(source.sourceLabel, left, y); y += 5; doc.text(sourceLines, left, y); doc.link(left, y - 3, 174, sourceLines.length * 4 + 2, { url: source.sourceUrl }); y += sourceLines.length * 4 + 7;
  doc.text(doc.splitTextToSize("Mode-shift illustration: keep road tonne-kilometres constant, then apply the selected rail share using the rail default. Savings are the road baseline less the blended road/rail scenario. Rail availability, capacity, detours, lead times and cost are not modelled.", 173), left, y);
  const exceptions = buildExceptionRows(context);
  if (exceptions.length) {
    doc.addPage(); y = 21;
    const exceptionHeader = (continued = false) => { doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(ink); doc.text(continued ? "VALIDATION EXCEPTIONS / CONTINUED" : "VALIDATION EXCEPTIONS", left, y); y += 10; doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(muted); };
    exceptionHeader();
    const exceptionIntro = doc.splitTextToSize(`${validation.validationExceptionCount} exception records across ${validation.excludedRowCount} distinct input rows and ${validation.excludedShipmentCount} identifiable shipments. The list covers the complete source input before view filters. Source rows are one-based. CSV line assumes one header line. These rows contribute no emissions to this report.`, 173) as string[];
    doc.text(exceptionIntro, left, y); y += exceptionIntro.length * 4 + 8;
    for (const exception of exceptions) {
      const title = doc.splitTextToSize(`Shipment: ${exception.shipmentId || "Unidentified"} | Leg: ${exception.legIndex || "Unknown"}`, 173) as string[];
      const message = doc.splitTextToSize(exception.message.replace(/[–—]/g, "-"), 173) as string[];
      const fieldLines = exception.fields ? doc.splitTextToSize(`Fields: ${exception.fields}`, 173) as string[] : [];
      const height = 12 + (title.length + message.length + fieldLines.length) * 4;
      if (y + height > 272) { doc.addPage(); y = 21; exceptionHeader(true); }
      doc.setTextColor(orange); doc.setFontSize(8); doc.text(`Source row ${exception.sourceRow} / CSV line ${exception.csvLine} | ${exception.code}`, left, y); y += 5;
      doc.setTextColor(ink); doc.setFont("helvetica", "bold"); doc.text(title, left, y); y += title.length * 4 + 1;
      doc.setTextColor(muted); doc.setFont("helvetica", "normal"); doc.text(message, left, y); y += message.length * 4;
      if (fieldLines.length) { doc.text(fieldLines, left, y); y += fieldLines.length * 4; }
      y += 6; doc.setDrawColor("#dce3d2"); doc.line(left, y - 5, 192, y - 5);
    }
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); doc.setFontSize(7); doc.setTextColor("#829175"); doc.text(`TEMT authorized product preview | ${context.synthetic ? "Synthetic scenario" : "User supplied"} | ${dateStamp()}`, left, 287); doc.text(`${page} / ${doc.getNumberOfPages()}`, 192, 287, { align: "right" }); }
  return doc;
}

export async function exportPDF(context: ExportContext) {
  const doc = await buildReportPDF(context);
  doc.save(`temt-freight-report-${dateStamp()}.pdf`);
}
