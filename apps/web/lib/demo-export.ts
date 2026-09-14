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
  const { jsPDF } = await import("jspdf");
  // Standard PDF Times avoids shipping a proprietary desktop font to browsers.
  const doc = new jsPDF({ unit: "mm", format: "a4", putOnlyUsedFonts: true });
  const validation = validationSummary(context);
  const left = 18, right = 192, width = right - left, bottom = 272;
  const lineHeight = 4.4;
  let y = 22;
  const normaliseText = (value: string) => value.replace(/[–—]/g, "-").replaceAll("CO₂", "CO2").replaceAll("→", "to").replaceAll("↗", "");
  const font = (size = 10, bold = false) => { doc.setFont("times", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(0, 0, 0); };
  const heading = (title: string, size = 14) => { font(size, true); doc.text(title, left, y); y += size > 18 ? 11 : 9; };
  const newPage = (title: string) => { doc.addPage(); y = 22; heading(title); };
  const paragraph = (value: string, continuation = "Method and provenance (continued)", size = 10, gap = 2) => {
    font(size);
    const lines = doc.splitTextToSize(normaliseText(value), width) as string[];
    for (const line of lines) {
      if (y + lineHeight > bottom) { newPage(continuation); font(size); }
      doc.text(line, left, y); y += lineHeight;
    }
    y += gap;
  };

  heading("TEMT freight emissions report", 24);
  paragraph(context.name, "Report context (continued)", 12, 2);
  paragraph(context.synthetic ? "Illustrative scenario. SYNTHETIC DATA." : "User-supplied data. Unassured calculations.", "Report context (continued)", 10, 3);
  paragraph(`${context.filters.from || "Start"} to ${context.filters.to || "Present"} | Mode: ${context.filters.mode} | Unit: ${context.filters.subsidiary}`, "Report context (continued)", 10, 5);
  if (y + 32 > bottom) newPage("Report summary");
  const metrics = [["Emissions", `${formatNumber(context.analysis.totals.emissionsKg / 1000, 2)} tCO2e`], ["Shipments", formatNumber(context.analysis.totals.shipmentCount)], ["Freight activity", `${formatNumber(context.analysis.totals.tonneKm, 0)} tkm`]];
  for (let i = 0; i < metrics.length; i++) {
    const x = left + i * 59;
    doc.setDrawColor(0); doc.setLineWidth(.2); doc.rect(x, y, 55, 26);
    font(10); doc.text(metrics[i][0], x + 4, y + 8);
    font(i === 2 ? 11 : 15, true);
    const valueLines = doc.splitTextToSize(metrics[i][1], 47) as string[];
    doc.text(valueLines, x + 4, y + 17, { lineHeightFactor: 1.05 });
  }
  y += 38;
  if (y + 63 > bottom) newPage("Emissions by mode");
  else heading("Emissions by mode", 13);
  const largest = Math.max(...context.analysis.byMode.map(row => row.emissionsKg), 1);
  for (const row of context.analysis.byMode) {
    font(10); doc.text(row.mode[0].toUpperCase() + row.mode.slice(1), left, y + 4);
    doc.setFillColor(0, 0, 0); doc.rect(left + 25, y, row.emissionsKg / largest * 103, 5, "F");
    doc.text(`${formatNumber(row.emissionsKg / 1000, 2)} tCO2e`, right, y + 4, { align: "right" });
    y += 11;
  }
  y += 8;
  if (y + 35 > bottom) newPage("Method and provenance");
  else heading("Method and provenance", 13);
  const notes = [
    `Emissions kgCO2e = tonnes x kilometres x profile factor. Engine: ${context.analysis.engineVersion}.`,
    `Calculated: ${context.analysis.calculatedAt}. Processing: ${context.processing}.`,
    "Published factors are illustrative. This report uses a separate demonstration engine. It is not covered by the SGS validation of the TEMT v1.3 methodology against ISO 14083:2023.",
    "Road HCV, India rail, container ocean at 10t/TEU, and distance-specific air profiles are used.",
    "Selected filters are applied after validation. A shipment with an invalid leg is excluded in full.",
    `Validation: ${validation.validationExceptionCount} exception records; ${validation.excludedRowCount} excluded rows; ${validation.excludedShipmentCount} identifiable excluded shipments from ${validation.sourceRowCount} input rows. Counts cover the full input before filters.`,
    "Full factor values, assumptions and source references are included in the methodology appendix.",
    ...(validation.validationExceptionCount ? ["Every rejected row and exclusion reason is listed in the validation exceptions appendix."] : []),
  ];
  for (const note of notes) paragraph(note);

  const rows = enrichRows(context.analysis.rows, context.rawRows);
  const ledgerHeader = (continued = false) => {
    newPage(continued ? "Shipment ledger (continued)" : "Shipment ledger");
    font(9, true);
    doc.text("Shipment / leg", left, y); doc.text("Date", 53, y); doc.text("Mode", 78, y);
    for (const [label, x] of [["Tonnes", 118], ["km", 139], ["Tonne-km", 169], ["kgCO2e", 193]] as const) doc.text(label, x, y, { align: "right" });
    y += 5; doc.setDrawColor(0); doc.setLineWidth(.2); doc.line(left, y - 2, 193, y - 2); y += 3;
  };
  ledgerHeader();
  for (const row of rows) {
    font(9);
    const identifierLines = doc.splitTextToSize(`${row.shipmentId} / ${row.legIndex}`, 31) as string[];
    const numbers = [[formatNumber(row.tonnes, 1), 118, 21], [formatNumber(row.kilometres), 139, 18], [formatNumber(row.tonneKm), 169, 27], [formatNumber(row.emissionsKg, 2), 193, 21]] as const;
    const cells = numbers.map(([text, x, maxWidth]) => ({ x, lines: doc.splitTextToSize(text, maxWidth) as string[] }));
    const rowHeight = Math.max(6.5, Math.max(identifierLines.length, ...cells.map(cell => cell.lines.length)) * 3.8 + 2);
    if (y + rowHeight > bottom) ledgerHeader(true);
    font(9); doc.text(identifierLines, left, y, { lineHeightFactor: 1.2 }); doc.text(row.date, 53, y); doc.text(row.mode, 78, y);
    for (const cell of cells) doc.text(cell.lines, cell.x, y, { align: "right", lineHeightFactor: 1.2 });
    y += rowHeight;
  }
  if (!rows.length) { font(10); doc.text("No valid rows match the selected filters.", left, y + 5); }

  const methodLineHeight = 3.8;
  newPage("Methodology / factor register");
  paragraph("Published well-to-wheel default factors. These are estimates, not measured carrier-specific factors. This demonstration is separate from production TEMT; values are applied without intermediate rounding.", "Methodology (continued)", 9, 3);
  for (const factor of Object.values(FACTORS)) {
    font(9);
    const assumptions = factor.assumptions.map(assumption => doc.splitTextToSize(normaliseText(`- ${assumption}`), width - 3) as string[]);
    const factorLabel = doc.splitTextToSize(normaliseText(factor.label), width) as string[];
    const factorValue = doc.splitTextToSize(`${factor.kgCO2ePerTonneKm} kgCO2e / tonne-km | ${factor.version} | Source 1, page ${factor.sourcePage}`, width) as string[];
    const height = 10 + (factorLabel.length + factorValue.length + assumptions.reduce((sum, lines) => sum + lines.length, 0)) * methodLineHeight;
    if (y + height > bottom) newPage("Methodology (continued)");
    font(11, true); doc.text(factor.id, left, y); y += 5;
    font(9); doc.text(factorLabel, left, y, { lineHeightFactor: 1.24 }); y += factorLabel.length * methodLineHeight + .5;
    doc.text(factorValue, left, y, { lineHeightFactor: 1.24 }); y += factorValue.length * methodLineHeight + 1;
    for (const lines of assumptions) { doc.text(lines, left + 3, y, { lineHeightFactor: 1.24 }); y += lines.length * methodLineHeight; }
    y += 5; doc.setDrawColor(0); doc.setLineWidth(.15); doc.line(left, y - 4, right, y - 4);
  }
  const source = Object.values(FACTORS)[0];
  font(9); const sourceLines = doc.splitTextToSize(source.sourceUrl, width) as string[];
  if (y + sourceLines.length * methodLineHeight + 38 > bottom) newPage("Methodology (continued)");
  heading("Source 1 / published factors", 11);
  paragraph(source.sourceLabel, "Methodology (continued)", 9, 1);
  font(9); doc.text(sourceLines, left, y, { lineHeightFactor: 1.24 }); doc.link(left, y - 3.5, width, sourceLines.length * methodLineHeight + 2, { url: source.sourceUrl }); y += sourceLines.length * methodLineHeight + 5;
  paragraph("Mode-shift illustration: keep road tonne-kilometres constant, then apply the selected rail share using the rail default. Savings are the road baseline less the blended road/rail scenario. Rail availability, capacity, detours, lead times and cost are not modelled.", "Methodology (continued)", 9);

  const exceptions = buildExceptionRows(context);
  if (exceptions.length) {
    newPage("Validation exceptions");
    paragraph(`${validation.validationExceptionCount} exception records across ${validation.excludedRowCount} distinct input rows and ${validation.excludedShipmentCount} identifiable shipments. The list covers the complete source input before view filters. Source rows are one-based. CSV line assumes one header line. These rows contribute no emissions to this report.`, "Validation exceptions (continued)", 10, 5);
    for (const exception of exceptions) {
      font(10, true); const title = doc.splitTextToSize(`Shipment: ${exception.shipmentId || "Unidentified"} | Leg: ${exception.legIndex || "Unknown"}`, width) as string[];
      font(10); const message = doc.splitTextToSize(normaliseText(exception.message), width) as string[];
      const fieldLines = exception.fields ? doc.splitTextToSize(`Fields: ${exception.fields}`, width) as string[] : [];
      const height = 13 + (title.length + message.length + fieldLines.length) * lineHeight;
      if (y + height > bottom) newPage("Validation exceptions (continued)");
      font(10); doc.text(`Source row ${exception.sourceRow} / CSV line ${exception.csvLine} | ${exception.code}`, left, y); y += 6;
      font(10, true); doc.text(title, left, y, { lineHeightFactor: 1.24 }); y += title.length * lineHeight + 1;
      font(10); doc.text(message, left, y, { lineHeightFactor: 1.24 }); y += message.length * lineHeight;
      if (fieldLines.length) { doc.text(fieldLines, left, y, { lineHeightFactor: 1.24 }); y += fieldLines.length * lineHeight; }
      y += 7; doc.setDrawColor(0); doc.setLineWidth(.15); doc.line(left, y - 4, right, y - 4);
    }
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); font(9); doc.setDrawColor(0); doc.setLineWidth(.15); doc.line(left, 281, right, 281);
    doc.text(`TEMT authorized product preview | ${context.synthetic ? "Synthetic scenario" : "User supplied"} | ${dateStamp()}`, left, 287);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, right, 287, { align: "right" });
  }
  return doc;
}

export async function exportPDF(context: ExportContext) {
  const doc = await buildReportPDF(context);
  doc.save(`temt-freight-report-${dateStamp()}.pdf`);
}
