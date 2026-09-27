import { generatedLabel, type ReportModel } from "../report-model";
import { fmt } from "../format";
import { downloadBlob, t } from "./common";

export async function buildDocx(model: ReportModel) {
  const { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, Footer, PageNumber } = await import("docx");
  const MAROON = "B12322", DEEP = "740000", GREY = "636363", STONE = "E8E3DB";
  const tco2 = (kg: number) => fmt(t(kg), t(kg) < 100 ? 2 : 1);
  const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean; after?: number } = {}) =>
    new Paragraph({ spacing: { after: opts.after ?? 120 }, children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size, italics: opts.italics })] });
  const h = (text: string, level: 1 | 2 = 1) => new Paragraph({ heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: level === 1 ? 360 : 240, after: 120 }, children: [new TextRun({ text, color: level === 1 ? DEEP : "1C1917" })] });
  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun(text)] });
  const cell = (text: string, opts: { head?: boolean; right?: boolean; width?: number } = {}) => new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, color: "auto", fill: MAROON } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: opts.head, color: opts.head ? "FFFFFF" : undefined, size: 18 })] })],
  });
  const table = (head: string[], rows: string[][], rightFrom = 1, widths?: number[]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: STONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: STONE }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    rows: [new TableRow({ tableHeader: true, children: head.map((label, i) => cell(label, { head: true, right: i >= rightFrom, width: widths?.[i] })) }), ...rows.map((row) => new TableRow({ children: row.map((value, i) => cell(value, { right: i >= rightFrom, width: widths?.[i] })) }))],
  });
  const tt = model.totals;
  const yoy = model.previous ? ((tt.wtwKg - model.previous.totals.wtwKg) / model.previous.totals.wtwKg) * 100 : undefined;
  const bucketRows = (items: ReportModel["byMode"]) => items.map((item) => [item.label, tco2(item.wtwKg), `${fmt(item.share, 1)}%`, fmt(item.tonneKm, 0)]);

  const document = new Document({
    creator: "TEMT", title: `${model.title} ${model.period}`, description: `${model.organisation} freight emissions`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21, color: "1C1917" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 32, bold: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 24, bold: true } },
        { id: "Title", name: "Title", basedOn: "Normal", run: { font: "Georgia", size: 56, bold: true, color: DEEP } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `TEMT · ${model.organisation} · ${model.period} · page `, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
      children: [
        p("TEMT · TRANSPORTATION EMISSION MEASUREMENT TOOL", { bold: true, color: MAROON, size: 18 }),
        new Paragraph({ style: "Title", spacing: { after: 160 }, children: [new TextRun(model.title)] }),
        p(model.organisation, { size: 30, bold: true }),
        p(`${model.period} · ${generatedLabel(model)}`, { color: GREY, italics: true, after: 320 }),
        h("Summary"),
        table(["Measure", "Value"], [
          ["Total emissions, well-to-wheel", `${tco2(tt.wtwKg)} t CO₂e`],
          ["Tank-to-wheel (vehicle operation)", `${tco2(tt.ttwKg)} t CO₂e`],
          ["Well-to-tank (energy provision)", `${tco2(tt.wttKg)} t CO₂e`],
          ["Hubs and terminals", `${tco2(tt.hubKg)} t CO₂e`],
          ["Shipments and legs", `${fmt(tt.shipments)} shipments · ${fmt(tt.legs)} legs`],
          ["Emission intensity", `${fmt(tt.intensityG, 1)} g CO₂e per tonne-km`],
          ["Emissions per tonne shipped", `${fmt(tt.kgPerTonne, 1)} kg CO₂e`],
          ...(yoy !== undefined ? [[`Change vs ${model.previous!.period}`, `${yoy >= 0 ? "+" : ""}${fmt(yoy, 1)}%`]] : []),
          ...(model.carbonCostInr ? [["Internal carbon cost", `₹${fmt(model.carbonCostInr, 0)}`]] : []),
        ], 1, [60, 40]),
        h("Key insights"),
        ...model.insights.map((item) => bullet(`${item.title}. ${item.body}`)),
        h("Emissions by transport mode"),
        table(["Mode", "t CO₂e", "Share", "Tonne-km"], bucketRows(model.byMode)),
        h("GHG Protocol scopes"),
        table(["Scope", "t CO₂e", "Share", "Tonne-km"], bucketRows(model.byScope)),
        h("Business units"),
        table(["Business unit", "t CO₂e", "Share", "Tonne-km"], bucketRows(model.byBusinessUnit)),
        h("Top lanes"),
        table(["Lane", "t CO₂e", "Share", "Tonne-km"], bucketRows(model.byLane.slice(0, 10))),
        h("Data quality"),
        table(["Basis", "t CO₂e", "Share", "Tonne-km"], bucketRows(model.byQuality)),
        h("Reduction opportunities"),
        ...(model.opportunities.length ? model.opportunities.map((item) => bullet(`${item.title}${item.savingKg > 0 ? ` (up to ${tco2(item.savingKg)} t CO₂e)` : ""}. ${item.body}`)) : [p("No major opportunities were found for this selection.")]),
        h("BRSR mapping"),
        table(["Indicator", "Value", "Note"], model.brsr.map((item) => [item.indicator, item.value, item.note]), 9, [34, 22, 44]),
        h("Methodology"),
        p(model.factorSet.label, { bold: true }),
        p(model.factorSet.description),
        ...model.notes.map(bullet),
        h("Factors used", 2),
        table(["Factor", "WTT", "TTW", "Unit", "Source"], model.factorsUsed.slice(0, 40).map((item) => [item.factor, fmt(item.wtt, 5), fmt(item.ttw, 5), item.unit, `${item.source}, ${item.ref}`]), 1, [36, 10, 10, 14, 30]),
        h("Sources", 2),
        ...model.sources.map((source) => bullet(`${source.publisher} (${source.year}). ${source.title}. ${source.url}`)),
      ],
    }],
  });
  return Packer.toBlob(document);
}

export async function exportDocx(model: ReportModel, stem: string) {
  downloadBlob(await buildDocx(model), `${stem}.docx`);
}
