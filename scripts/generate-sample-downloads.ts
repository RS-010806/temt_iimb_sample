import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
import Papa from "papaparse";
import type { AnalysisResult, ShipmentLeg } from "@temt/calculator";
import type { ExportContext } from "../apps/web/lib/demo-export";

/**
 * Generate the public examples through the exact functions used by the demo UI.
 * Vite loads the Next app's TS modules without creating a second calculation or
 * report implementation. Run from the repository root: npm run samples:generate.
 */
async function main() {
  const root = process.cwd();
  const vite = await createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
  try {
    const [{ makeScenario, filteredAnalysis, DEFAULT_FILTERS }, { buildPowerBIPack, buildReportPDF, serializeCSV }, { analyze }] = await Promise.all([
      vite.ssrLoadModule("/apps/web/lib/demo-data.ts"),
      vite.ssrLoadModule("/apps/web/lib/demo-export.ts"),
      vite.ssrLoadModule("/packages/calculator/src/index.ts"),
    ]);
    const rows = makeScenario("fmcg");
    const result: AnalysisResult = analyze(rows);
    assert.equal(result.errors.length, 0, "The public scenario must have no validation exceptions.");
    assert.equal(result.totals.legCount, 32);
    assert.equal(result.totals.shipmentCount, 24);
    const context: ExportContext = {
      analysis: filteredAnalysis(result, DEFAULT_FILTERS), rawRows: rows,
      name: "Illustrative India consumer group scenario", filters: { ...DEFAULT_FILTERS },
      synthetic: true, processing: "local",
    };
    const [pdf, zip, csv] = await Promise.all([
      buildReportPDF(context),
      buildPowerBIPack(context),
      serializeCSV(rows.map((row: ShipmentLeg & { origin: string; destination: string }) => ({
        shipmentId: row.shipmentId, legIndex: row.legIndex, date: row.date, subsidiary: row.subsidiary,
        origin: row.origin, destination: row.destination, mode: row.mode, profile: row.profile,
        tonnes: row.tonnes, kilometres: row.kilometres,
        dataType: "synthetic scenario", scenario: "Illustrative India consumer group scenario",
        generatedAt: context.analysis.calculatedAt,
      }))),
    ]);

    // Verify the downloadable input can reproduce the same calculation.
    const sample = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });
    assert.equal(sample.errors.length, 0);
    const reconstructed = sample.data.map(row => ({ ...row, legIndex: Number(row.legIndex), tonnes: Number(row.tonnes), kilometres: Number(row.kilometres) }));
    const reconstructedAnalysis: AnalysisResult = analyze(reconstructed);
    assert.deepEqual(reconstructedAnalysis.totals, result.totals);
    assert.equal(reconstructedAnalysis.errors.length, 0);

    const ledger = Papa.parse<Record<string, string>>(await zip.file("shipments.csv").async("string"), { header: true, skipEmptyLines: "greedy" });
    const summary = Papa.parse<Record<string, string>>(await zip.file("summary.csv").async("string"), { header: true, skipEmptyLines: "greedy" });
    assert.equal(ledger.errors.length, 0);
    assert.equal(summary.errors.length, 0);
    assert.equal(ledger.data.length, 32);
    assert.equal(new Set(ledger.data.map(row => row.shipmentId)).size, 24);
    assert.equal(Number(summary.data[0]?.totalEmissionsKg), result.totals.emissionsKg);
    assert.equal(Number(summary.data[0]?.totalTonneKm), result.totals.tonneKm);
    assert.equal(Number(summary.data[0]?.validationExceptionCount), 0);
    const ledgerEmissions = ledger.data.reduce((total, row) => total + Number(row.emissionsKg), 0);
    assert.ok(Math.abs(ledgerEmissions - result.totals.emissionsKg) < 1e-6, "Exported ledger must reconcile to the summary.");
    assert.ok(ledger.data.every(row => row.dataType === "synthetic scenario"));
    assert.ok(pdf.getNumberOfPages() >= 3, "The report must contain its ledger and factor register.");

    const destination = resolve(root, "apps/web/public/downloads");
    await mkdir(destination, { recursive: true });
    await Promise.all([
      writeFile(resolve(destination, "temt-example-report.pdf"), Buffer.from(pdf.output("arraybuffer"))),
      writeFile(resolve(destination, "temt-power-bi-pack.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })),
      writeFile(resolve(destination, "temt-sample-shipments.csv"), `\uFEFF${csv}`, "utf8"),
    ]);
    console.info(JSON.stringify({ destination, generatedAt: result.calculatedAt, engineVersion: result.engineVersion,
      totals: result.totals, emissionsTonnes: result.totals.emissionsKg / 1000, pdfPages: pdf.getNumberOfPages(),
      zipFiles: Object.keys(zip.files), synthetic: true }, null, 2));
  } finally {
    await vite.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
