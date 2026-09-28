import type { jsPDF as JsPDF } from "jspdf";
import { generatedLabel, type ReportModel } from "../report-model";
import { fmt, monthLabel } from "../format";
import { MODE_HEX } from "../records";
import { downloadBlob, t } from "./common";

type RGB = [number, number, number];
const MAROON: RGB = [177, 35, 34];
const DEEP: RGB = [116, 0, 0];
const DARKEST: RGB = [42, 5, 5];
const INK: RGB = [28, 25, 23];
const GREY: RGB = [99, 99, 99];
const STONE: RGB = [232, 227, 219];
const PAPER: RGB = [250, 248, 245];
const SAND: RGB = [227, 154, 85];
const BLUE: RGB = [42, 114, 196];
const hex = (value: string): RGB => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

/** Standard PDF fonts use WinAnsi encoding; map characters outside it. */
export function pdfSafe(text: string) {
  return text.replace(/CO₂/g, "CO2").replace(/₂/g, "2").replace(/→/g, "->").replace(/↔/g, "<->").replace(/₹/g, "INR ").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ | /g, " ").replace(/[^\x00-\xff–—•·×…€]/g, "");
}

const W = 210, H = 297, M = 16;

export async function buildPdf(model: ReportModel): Promise<JsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `${model.title} ${model.period}`, subject: `${model.organisation} freight emissions`, author: "TEMT", creator: "TEMT · TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore" });
  const text = (value: string, x: number, y: number, opts?: Parameters<JsPDF["text"]>[3]) => doc.text(pdfSafe(value), x, y, opts);
  const fill = (color: RGB) => doc.setFillColor(color[0], color[1], color[2]);
  const ink = (color: RGB) => doc.setTextColor(color[0], color[1], color[2]);
  const stroke = (color: RGB) => doc.setDrawColor(color[0], color[1], color[2]);
  const font = (style: "normal" | "bold" | "italic", size: number, family: "helvetica" | "times" = "helvetica") => { doc.setFont(family, style); doc.setFontSize(size); };
  const tt = model.totals;
  const tco2 = (kg: number) => fmt(t(kg), t(kg) < 100 ? 2 : 1);

  const wrap = (value: string, width: number) => doc.splitTextToSize(pdfSafe(value), width) as string[];
  const heading = (title: string, y: number, kicker?: string) => {
    if (kicker) { font("bold", 7.5); ink(MAROON); text(kicker.toUpperCase(), M, y, { charSpace: 0.6 }); y += 6; }
    font("bold", 18, "times"); ink(INK); text(title, M, y);
    return y + 8;
  };
  const tableDefaults = {
    theme: "plain" as const,
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 }, textColor: INK, lineColor: STONE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: MAROON, textColor: [255, 255, 255] as RGB, fontStyle: "bold" as const, fontSize: 8 },
    alternateRowStyles: { fillColor: PAPER },
    margin: { left: M, right: M, top: 22, bottom: 18 },
  };
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ─── Cover ──────────────────────────────────────────────────────────────
  fill(DEEP); doc.rect(0, 0, W, 112, "F");
  fill(DARKEST); doc.rect(0, 104, W, 8, "F");
  stroke([204, 92, 86]); doc.setLineWidth(0.5); doc.setLineDashPattern([0.6, 2.2], 0);
  // A dotted freight route across the band, echoing the TEMT mark.
  doc.lines([[24, -16, 46, -4, 70, -26], [14, -12, 22, -8, 28, -24]], 96, 98, [1, 1], "S");
  doc.setLineDashPattern([], 0);
  fill([255, 255, 255]); doc.circle(96, 98, 1.6, "F");
  fill(SAND); doc.circle(194, 48, 1.8, "F");
  stroke([255, 255, 255]); doc.setLineWidth(0.6); doc.circle(M + 6, 24, 6, "S");
  fill([255, 255, 255]); doc.circle(M + 3, 27, 1.2, "F"); fill(SAND); doc.circle(M + 9, 21, 1.2, "F");
  font("bold", 20, "times"); ink([255, 255, 255]); text("TEMT", M + 16, 27);
  font("normal", 7.5); ink([239, 196, 192]); text("TRANSPORTATION EMISSION MEASUREMENT TOOL · IIM BANGALORE", M + 16, 32, { charSpace: 0.3 });
  if (model.sampleShipments) {
    fill([227, 154, 85]); doc.roundedRect(M, 42, 118, 8, 1.5, 1.5, "F");
    font("bold", 8); ink(DARKEST); text(`SAMPLE DATA · ${model.sampleShipments} synthetic shipments for demonstration`, M + 3, 47.3);
  }
  font("bold", 32, "times"); ink([255, 255, 255]); text(model.title, M, 66);
  font("normal", 15); text(model.organisation, M, 78);
  font("normal", 11); ink([239, 196, 192]); text(`${model.period} · ${model.factorSet.label}`, M, 86);

  const tiles = [
    { label: "Total emissions (WTW)", value: tco2(tt.wtwKg), unit: "t CO2e" },
    { label: "Emission intensity", value: fmt(tt.intensityG, 1), unit: "g CO2e / t-km" },
    { label: "Shipments", value: fmt(tt.shipments), unit: `${fmt(tt.legs)} legs` },
    model.previous ? { label: `vs ${model.previous.period}`, value: `${tt.wtwKg >= model.previous.totals.wtwKg ? "+" : ""}${fmt(((tt.wtwKg - model.previous.totals.wtwKg) / model.previous.totals.wtwKg) * 100, 1)}%`, unit: `${tco2(model.previous.totals.wtwKg)} t previously` } : { label: "Tonne-kilometres", value: fmt(tt.tonneKm / 1000, 0) + "k", unit: "transport work" },
  ];
  const tileW = (W - 2 * M - 9) / 4;
  tiles.forEach((tile, index) => {
    const x = M + index * (tileW + 3), y = 124;
    fill(index === 0 ? [252, 243, 242] : PAPER); stroke(STONE); doc.setLineWidth(0.25); doc.roundedRect(x, y, tileW, 30, 2.5, 2.5, "FD");
    font("normal", 7.5); ink(GREY); text(tile.label, x + 4, y + 7);
    font("bold", 17); ink(index === 0 ? DEEP : INK); text(tile.value, x + 4, y + 18);
    font("normal", 7.5); ink(GREY); text(tile.unit, x + 4, y + 25);
  });

  let y = 168;
  font("bold", 10); ink(INK); text("Where the emissions arise", M, y); y += 5;
  const stages = [{ label: "Tank-to-wheel (vehicle operation)", value: tt.ttwKg, color: MAROON }, { label: "Well-to-tank (energy provision)", value: tt.wttKg, color: SAND }, { label: "Hubs and terminals", value: tt.hubKg, color: BLUE }].filter((stage) => stage.value > 0);
  let x = M;
  const total = tt.wtwKg || 1;
  for (const stage of stages) { const width = ((W - 2 * M) * stage.value) / total; fill(stage.color); doc.rect(x, y, Math.max(0.5, width - 0.6), 5, "F"); x += width; }
  y += 10;
  stages.forEach((stage) => { fill(stage.color); doc.circle(M + 1.5, y - 1.2, 1.5, "F"); font("normal", 8.5); ink(INK); text(stage.label, M + 5, y); font("bold", 8.5); text(`${tco2(stage.value)} t`, W - M - 14, y, { align: "right" }); font("normal", 8.5); ink(GREY); text(`${fmt((stage.value / total) * 100, 0)}%`, W - M, y, { align: "right" }); y += 5.2; });
  y += 7;

  font("bold", 10); ink(INK); text("Emissions by transport mode", M, y); y += 6;
  const maxMode = Math.max(...model.byMode.map((item) => item.wtwKg), 1);
  for (const item of model.byMode) {
    font("normal", 8.5); ink(INK); text(item.label, M, y + 3.4);
    fill(STONE); doc.roundedRect(M + 42, y, W - 2 * M - 42 - 40, 4.5, 1.5, 1.5, "F");
    fill(hex(MODE_HEX[item.key as keyof typeof MODE_HEX] ?? "#636363")); doc.roundedRect(M + 42, y, Math.max(1.5, ((W - 2 * M - 82) * item.wtwKg) / maxMode), 4.5, 1.5, 1.5, "F");
    font("bold", 8.5); text(`${tco2(item.wtwKg)} t`, W - M - 36, y + 3.4); font("normal", 8.5); ink(GREY); text(`${fmt(item.share, 1)}%`, W - M - 12, y + 3.4);
    y += 8;
  }
  y = Math.max(y + 4, 262);
  stroke(STONE); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);
  font("normal", 7.5); ink(GREY);
  wrap(`${generatedLabel(model)}. Prepared with TEMT, developed by the TCI–IIMB Supply Chain Sustainability Lab, Supply Chain Management Centre, IIM Bangalore. Emissions are quantified to ISO 14083:2023 on a well-to-wheel basis with TEMT's India-specific emission factors.`, W - 2 * M).forEach((line, index) => text(line, M, y + 5 + index * 3.6));

  // ─── Monthly profile and insights ───────────────────────────────────────
  doc.addPage();
  y = heading("How emissions moved through the year", 26, "Monthly profile") + 4;
  const months = model.byMonth;
  if (months.length) {
    const chartX = M + 10, chartW = W - 2 * M - 10, chartH = 62, base = y + chartH;
    const peak = Math.max(...months.map((item) => item.wtwKg), 1);
    font("normal", 7); ink(GREY);
    for (let i = 0; i <= 4; i += 1) { const gy = base - (chartH * i) / 4; stroke(STONE); doc.setLineWidth(0.15); doc.line(chartX, gy, chartX + chartW, gy); text(fmt(t((peak * i) / 4), 1), chartX - 2, gy + 1, { align: "right" }); }
    const slot = chartW / months.length, barW = Math.min(9, slot * 0.62);
    months.forEach((item, index) => {
      const bx = chartX + index * slot + (slot - barW) / 2;
      const ttwH = (chartH * item.ttwKg) / peak, wttH = (chartH * item.wttKg) / peak;
      fill(MAROON); doc.rect(bx, base - ttwH, barW, ttwH, "F");
      fill(SAND); doc.rect(bx, base - ttwH - wttH, barW, wttH, "F");
      font("normal", 6.5); ink(GREY); text(monthLabel(item.key).split(" ")[0]!, bx + barW / 2, base + 4, { align: "center" });
    });
    font("normal", 7); ink(GREY); text("t CO2e", M, y - 5);
    y = base + 10;
    fill(MAROON); doc.rect(M, y - 2.5, 3, 3, "F"); ink(INK); font("normal", 7.5); text("Tank-to-wheel", M + 4.5, y);
    fill(SAND); doc.rect(M + 30, y - 2.5, 3, 3, "F"); text("Well-to-tank", M + 34.5, y);
    y += 10;
  }
  y = heading("What the data says", y + 2, "Key insights");
  const insightList = [...model.insights.map((item) => `${item.title}. ${item.body}`), ...model.opportunities.filter((item) => item.savingKg > 0).slice(0, 2).map((item) => `${item.title}: up to ${tco2(item.savingKg)} t CO2e avoidable. ${item.body}`)];
  insightList.forEach((item, index) => {
    fill(MAROON); doc.circle(M + 2.5, y - 1.2, 2.4, "F"); font("bold", 7.5); ink([255, 255, 255]); text(String(index + 1), M + 2.5, y, { align: "center" });
    font("normal", 9); ink(INK); const lines = wrap(item, W - 2 * M - 10); lines.forEach((line, i) => text(line, M + 8, y + i * 4.4)); y += lines.length * 4.4 + 3;
  });
  y += 4;
  y = heading("GHG Protocol classification", y, "Scopes");
  autoTable(doc, { ...tableDefaults, startY: y, head: [["Scope", "t CO2e", "Share"]], body: model.byScope.map((item) => [pdfSafe(item.label), tco2(item.wtwKg), `${fmt(item.share, 1)}%`]), columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } } });

  // ─── Breakdowns ─────────────────────────────────────────────────────────
  doc.addPage();
  y = heading("Breakdown", 26, "Business units, lanes and vehicles");
  const bucketTable = (title: string, rows: ReportModel["byLane"], startY: number) => {
    // Keep a table title with at least its first rows rather than orphaning it at the page foot.
    if (startY > H - 60) { doc.addPage(); startY = 26; }
    font("bold", 10); ink(INK); text(title, M, startY);
    autoTable(doc, { ...tableDefaults, startY: startY + 3, head: [["", "t CO2e", "Share", "Tonne-km", "g/t-km"]], body: rows.map((item) => [pdfSafe(item.label), tco2(item.wtwKg), `${fmt(item.share, 1)}%`, fmt(item.tonneKm, 0), item.tonneKm ? fmt((item.wtwKg / item.tonneKm) * 1000, 1) : "–"]), columnStyles: { 0: { cellWidth: 78 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
    return last() + 9;
  };
  y = bucketTable("Business units", model.byBusinessUnit, y);
  y = bucketTable("Top lanes", model.byLane.slice(0, 10), y);
  if (model.byVehicle.length) y = bucketTable("Road vehicle classes", model.byVehicle.slice(0, 8), y);
  y = bucketTable("Data quality", model.byQuality, y);

  // ─── Opportunities and BRSR ─────────────────────────────────────────────
  if (y > H - 110) { doc.addPage(); y = 26; } else y += 6;
  y = heading("Reduction opportunities", y, "Recalculated with the same engine");
  if (!model.opportunities.length) { font("normal", 9); ink(GREY); text("No major opportunities were found for this selection.", M, y); y += 8; }
  for (const item of model.opportunities) {
    fill(PAPER); stroke(STONE); doc.setLineWidth(0.25);
    font("normal", 8.5);
    const lines = wrap(item.body, W - 2 * M - 50);
    const boxH = 10 + lines.length * 4.2;
    if (y + boxH > H - 20) { doc.addPage(); y = 26; }
    doc.roundedRect(M, y, W - 2 * M, boxH, 2, 2, "FD");
    font("bold", 10); ink(INK); text(item.title, M + 4, y + 6.5);
    font("normal", 8.5); ink(GREY); lines.forEach((line, i) => text(line, M + 4, y + 11.5 + i * 4.2));
    if (item.savingKg > 0) { font("bold", 13); ink(DEEP); text(`-${tco2(item.savingKg)} t`, W - M - 4, y + 8, { align: "right" }); font("normal", 7); ink(GREY); text("CO2e potential", W - M - 4, y + 12.5, { align: "right" }); }
    y += boxH + 4;
  }
  if (y > H - 90) { doc.addPage(); y = 26; } else y += 6;
  y = heading("BRSR mapping", y, "SEBI Business Responsibility and Sustainability Report");
  autoTable(doc, { ...tableDefaults, startY: y, head: [["Indicator", "Value", "Note"]], body: model.brsr.map((item) => [pdfSafe(item.indicator), pdfSafe(item.value), pdfSafe(item.note)]), columnStyles: { 0: { cellWidth: 58, fontStyle: "bold" }, 1: { cellWidth: 36 } } });
  y = last() + 8;
  if (model.previous) {
    if (y > H - 50) { doc.addPage(); y = 26; }
    font("bold", 10); ink(INK); text("Year-on-year", M, y);
    autoTable(doc, { ...tableDefaults, startY: y + 3, head: [["", model.previous.period, model.period, "Change"]], body: [
      ["Total t CO2e", tco2(model.previous.totals.wtwKg), tco2(tt.wtwKg), `${fmt(((tt.wtwKg - model.previous.totals.wtwKg) / model.previous.totals.wtwKg) * 100, 1)}%`],
      ["Intensity g CO2e/t-km", fmt(model.previous.totals.intensityG, 1), fmt(tt.intensityG, 1), `${fmt(((tt.intensityG - model.previous.totals.intensityG) / (model.previous.totals.intensityG || 1)) * 100, 1)}%`],
      ["Shipments", fmt(model.previous.totals.shipments), fmt(tt.shipments), ""],
    ], columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
  }

  // ─── Methodology ────────────────────────────────────────────────────────
  doc.addPage();
  y = heading("Methodology and factors", 26, "Transparent by design");
  font("bold", 9.5); ink(INK); text(model.factorSet.label, M, y); y += 5;
  font("normal", 8.8); ink(GREY); wrap(model.factorSet.description, W - 2 * M).forEach((line) => { text(line, M, y); y += 4.2; });
  y += 3;
  for (const note of model.notes) { font("normal", 8.8); ink(INK); const lines = wrap(`•  ${note}`, W - 2 * M); lines.forEach((line) => { text(line, M, y); y += 4.3; }); y += 1.5; }
  y += 3;
  autoTable(doc, { ...tableDefaults, startY: y, head: [["Factor", "WTT", "TTW", "Unit", "Source", "Legs"]], body: model.factorsUsed.slice(0, 40).map((item) => [pdfSafe(item.factor), fmt(item.wtt, 5), fmt(item.ttw, 5), pdfSafe(item.unit), pdfSafe(`${item.source}, ${item.ref}`), String(item.legs)]), columnStyles: { 0: { cellWidth: 60 }, 1: { halign: "right" }, 2: { halign: "right" }, 5: { halign: "right" } }, styles: { ...tableDefaults.styles, fontSize: 7.5 } });
  y = last() + 8;
  font("bold", 10); ink(INK); text("Sources", M, y); y += 5;
  for (const source of model.sources) { font("normal", 8); ink(GREY); wrap(`${source.publisher} (${source.year}). ${source.title}. ${source.url}`, W - 2 * M).forEach((line) => { if (y > H - 22) { doc.addPage(); y = 26; } text(line, M, y); y += 3.9; }); y += 1; }

  // ─── Appendix: shipment register ────────────────────────────────────────
  doc.addPage();
  y = heading("Shipment register", 26, "Appendix");
  autoTable(doc, { ...tableDefaults, startY: y, head: [["Reference", "Date", "Route", "Modes", "Cargo t", "km", "t CO2e", "Quality"]],
    body: model.shipments.map((row) => [row.ref, row.date, pdfSafe(`${row.origin} -> ${row.destination}`), pdfSafe(row.modes), fmt(row.cargoTonnes, 1), fmt(row.distanceKm, 0), fmt(t(row.wtwKg), 3), row.dataQuality]),
    styles: { ...tableDefaults.styles, fontSize: 7 }, columnStyles: { 2: { cellWidth: 58 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } } });

  // Running header and footer on every page after the cover.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font("normal", 7); ink(GREY);
    if (page > 1) { text(`TEMT · ${model.title}`, M, 12); text(`${model.organisation} · ${model.period}`, W - M, 12, { align: "right" }); stroke(STONE); doc.setLineWidth(0.2); doc.line(M, 14, W - M, 14); }
    text(`Page ${page} of ${pages}`, W - M, H - 8, { align: "right" });
    if (page > 1) text("TEMT · Supply Chain Management Centre, IIM Bangalore", M, H - 8);
  }
  return doc;
}

export async function exportPdf(model: ReportModel, stem: string) {
  const doc = await buildPdf(model);
  downloadBlob(doc.output("blob"), `${stem}.pdf`);
}
