# Emissions PDF export QA

Verified on 14 September 2026.

The dynamic workspace report and downloadable example use the same `buildReportPDF` function in `apps/web/lib/demo-export.ts`.

## Typography and rendering

- Standard PDF Times-Roman and Times-Bold are the only font resources used.
- All text is black on white pages. Charts and rules are monochrome.
- Body and table type is 9 to 10 points; headings are larger and use sentence case.
- No proprietary Times New Roman font files are copied into the repository or served to browsers. The standard PDF Times family is the standard PDF font choice for these dynamically generated emissions reports. It is not an embedded Microsoft Times New Roman font. The central design document is handled separately.
- The full company name, full shipment identifiers and large numeric cells wrap within their allocated widths. Numeric cells are not reduced below 9 points.

## Checks

The public example has 3 pages. The long-identifier report with validation exceptions has 4 pages. The empty filtered report has 4 pages. All 11 pages were rendered with Poppler and visually inspected. The final page PNGs are retained locally in the ignored `artifacts/qa/exports-times` directory.

`artifacts/qa/exports-times/structural-checks.json` records pdfplumber checks across every text character: only Times fonts, black text, minimum 9 point type, no em dashes or arrow glyphs, and no characters outside the report margins.

`npx vitest run apps/web/lib/demo-data.test.ts` passed all 51 tests. Existing PDF assertions cover factor values and sources, exception records, full long identifiers and ledger provenance. CSV and Power BI reconciliation checks remain green.

## Preserved sample provenance

- Calculation timestamp: `2026-09-13T20:09:04.257Z`.
- Emissions: 453,635.58993 kgCO2e.
- Freight activity: 11,323,896.6 tonne-km.
- Accepted source activity: 24 shipments and 32 transport legs.
- Period: 1 October 2025 to 30 September 2026.
- Engine: `temt-demo-1.0.0`.
- The existing shipment CSV and Power BI ZIP were not regenerated or modified.
- Existing filters, factor values, versions, source URL, assumptions and validation exceptions remain in the generated reports.

Public artifact: `apps/web/public/downloads/temt-example-report.pdf`.

File size: 37,807 bytes.

SHA-256: `f11dd887c9f9d5106251d0d6d07dff76140e66da795c46aefe858f7a8c6068d8`.

Final editorial scope check: the report explicitly states that it is not covered by the SGS validation of the TEMT v1.3 methodology against ISO 14083:2023. The broad operational-platform certification wording has been removed. All six affected cover and methodology pages were re-rendered and visually inspected after this change.
