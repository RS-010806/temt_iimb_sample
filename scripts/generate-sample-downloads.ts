/**
 * Regenerate the sample files served from /downloads with the same exporters the app uses.
 * Run with: npm run samples:generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSampleWorkspace } from "../apps/web/lib/sample-data";
import { compute } from "../apps/web/lib/records";
import { buildReportModel } from "../apps/web/lib/report-model";
import { DEFAULT_SETTINGS } from "../apps/web/lib/store";
import { buildPdf } from "../apps/web/lib/exports/pdf";
import { buildWorkbook } from "../apps/web/lib/exports/xlsx";
import { buildDocx } from "../apps/web/lib/exports/docx";
import { buildPowerBiPack } from "../apps/web/lib/exports/powerbi";
import { templateCsv, templateXlsx } from "../apps/web/lib/import";

async function main() {
  const out = join(import.meta.dirname, "../apps/web/public/downloads");
  mkdirSync(out, { recursive: true });
  const settings = { ...DEFAULT_SETTINGS, organisation: { name: "Sample FMCG company (synthetic data)", revenueCrore: 12500 }, businessUnits: ["Foods", "Home Care", "Personal Care"] };
  const rows = makeSampleWorkspace("fmcg").map((record) => compute(record, settings.factorSet));
  const model = { ...buildReportModel(rows, settings, { fy: "FY 2025–26" }), generatedAt: "2026-09-27T09:00:00.000Z" };
  writeFileSync(join(out, "temt-sample-report.pdf"), Buffer.from((await buildPdf(model)).output("arraybuffer")));
  writeFileSync(join(out, "temt-sample-report.xlsx"), Buffer.from(await (await buildWorkbook(model)).xlsx.writeBuffer()));
  writeFileSync(join(out, "temt-sample-report.docx"), Buffer.from(await (await buildDocx(model)).arrayBuffer()));
  writeFileSync(join(out, "temt-sample-power-bi.zip"), Buffer.from(await (await buildPowerBiPack(model)).arrayBuffer()));
  writeFileSync(join(out, "TEMT-import-template.xlsx"), Buffer.from(await templateXlsx()));
  writeFileSync(join(out, "TEMT-import-template.csv"), await templateCsv());
  console.log(`Sample downloads written for ${model.totals.shipments} shipments (${(model.totals.wtwKg / 1000).toFixed(1)} t CO2e).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
