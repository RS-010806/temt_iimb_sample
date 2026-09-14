# Release verification

## Formal submission and report revision

The final design document is addressed to Pratham Agarwal following the project meeting. It uses Times New Roman with black text, retains the original interface screenshots and includes the calculation method, factor assumptions, data contract, validation rules, API controls, architecture, measured results and proposed production work. All five pages were rendered and inspected. [Document QA](case-study-qa.md) records fonts, links, image integrity and artifact hashes.

The shared dynamic PDF exporter and public sample report now use the standard PDF Times family, black text and readable 9–10 pt detail. No standalone proprietary font files are distributed with the website. Full identifiers and long numeric values wrap within their cells. The sample remains three pages and preserves its original calculation timestamp and totals: 453,635.58993 kg CO2e, 24 shipments and 32 legs. CSV and Power BI files are unchanged. [Report export QA](report-export-qa.md) documents the example, long-identifier/exception and empty-filter cases.

Local verification after the export changes passed all 112 tests, TypeScript checks and both production builds. A final certification-wording correction was followed by the 51-test export/demo suite and a fresh frontend build. The documentation now states the 2 MiB limit, separates all-or-nothing CSV import from invalid-shipment exclusion, identifies the eight-second manual processing option and 90-second timeout, and explains that CORS is not authentication. Health and CORS preflight requests are outside the API rate limit.

The Lighthouse observations below remain evidence for the explicitly identified cinematic application build. They were not rerun for this document and report-formatting revision.

## Cinematic application baseline

Application source: [`81f7a0b52022b3af7773bed137992968e2f11d36`](https://github.com/RS-010806/temt_iimb_sample/commit/81f7a0b52022b3af7773bed137992968e2f11d36). Published to the existing free Render services on 14 September 2026 IST. [GitHub Actions run 34784180046](https://github.com/RS-010806/temt_iimb_sample/actions/runs/34784180046) passed source integrity, all **112 tests across three files**, type checks and both production builds.

This release replaces the hero with a four-chapter animated freight story and integrates its scenario controls into the composition. It adds exact hero-to-demo input continuity, sector shipment routes, a missing-data pipeline experiment, mode/month analytics and buyer FAQs. The [UX research record](ux-research.md) distinguishes source observations from implementation decisions.

### Published Lighthouse measurements

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Mobile | 91 | 100 | 100 | 100 | 2.0 s | 2.9 s | 50 ms | 0 |
| Desktop | 100 | 100 | 100 | 100 | 0.3 s | 0.6 s | 0 ms | 0 |

Mobile fetched at `2026-09-13T21:38:00.619Z`; desktop at `2026-09-13T21:38:13.813Z`. Lighthouse 13.4.1 ran against the public Render URL in headless Chrome using its standard presets. Simulated mobile uses a 412 × 823 viewport, 4× CPU slowdown and 150 ms RTT. The runs were sequential on a shared development machine, with application builds and document rendering stopped during measurement. Scores are individual lab observations, not field data or SLAs. The original performance targets of at least 90 mobile and 95 desktop, and accessibility of at least 95, were met. Mobile LCP remains 2.9 seconds in this observation.

The mobile hero image is a 45,826-byte AVIF; desktop uses a 148,312-byte AVIF. Full pipeline validation loads on interaction, while the hero and landing analytics use a small shared factor registry. Decorative movement uses transforms, stops off screen and in a background tab, and respects reduced-motion and data-saving preferences. Text stays fully opaque during section entrances. The mobile audit transferred 291,676 bytes overall, including 160,130 bytes of JavaScript across eight requests.

Raw reports: [mobile](measurements/lighthouse-mobile-revision.json) and [desktop](measurements/lighthouse-desktop-revision.json). Earlier local measurements were used to identify image-transfer and contrast issues; the table reports the final public runs. Historical baseline reports remain available below.

### Calculation, interaction and responsive checks

The shared engine retains GLEC v3.2 defaults and the `temt-demo-1.0.0` version. The 1,000-tonne, 1,000-km, 30% rail example produces 66,300 kg baseline, 49,590 kg scenario and 16,710 kg reduction, displayed as 16.71 tCO₂e and 25.2%. No intermediate rounding is applied. Landing summaries were independently reconciled against the full engine for all four sector totals, 48 monthly groups, 16 mode groups, four featured shipments and 12 mode/distance cases. The largest floating-point difference was 5.82 × 10⁻¹¹ kg, with identical displayed values.

The new automated coverage checks quick-scenario URL parsing, complete parameter sets, numeric bounds, fractional input, duplicates and non-finite values. Invalid quick URLs fall back to the normal sample workspace. Existing tests retain multi-leg completeness, duplicates, validation errors, filters, CSV handling, export reconciliation, API limits and client/server parity.

Production-build browser checks covered 375, 768, 1024 and 1440 CSS pixels. Application sections and controls fit each viewport; the shipment ledger retains its own horizontal scroll area. The mobile hero prioritizes the estimate and controls before the animated diagram. The following actions were exercised:

- Manual chapter selection and pause/play; native numeric editing with fractional values, maximum inputs and keyboard slider endpoints.
- Exact quick-scenario navigation into the demo, preserving tonnes, distance and rail allocation. Changing sector clears the quick-scenario identity and uses the selected sample.
- Arrow-key and Home/End navigation for mode, sector, pipeline and reporting tabs; keyboard expansion of FAQs and exact chart data.
- Valid pipeline total of 1,394.328 kg. Injecting the missing load excludes the entire affected shipment and retains 1,034.28 kg from the complete shipment.
- Mode and monthly chart alternatives, with FMCG data reconciling to 453,635.58993 kg across 24 shipments and 32 legs.
- Successful browser analysis displaying `BACKEND COMPLETE` with the same 66.30 tCO₂e quick-scenario baseline.

Reduced-motion and data-saving behavior were inspected in CSS and JavaScript; an OS preference toggle was not automated. Native file-picker automation remains unavailable because of the browser extension's file-URL permission. CSV parsing, limits and reconciliation are covered by automated tests. No permission settings were changed. Revised screenshots in `artifacts/screenshots` were captured from the production build corresponding to the published source above; the unchanged workspace screenshot is retained from the prior release.

### Published API checks

[Raw request evidence](measurements/revision-live-api.json) records these observations from the revised public deployment:

| Check | HTTP | Network duration | Result |
| --- | ---: | ---: | --- |
| Health | 200 | 23,246.20 ms | Engine available; persistence `none` |
| Factors | 200 | 101.35 ms | All five published profiles match locally |
| Quick-scenario analysis | 200 | 112.83 ms | 66,300 kg; 1.819572 ms measured engine processing |
| Allowed frontend preflight | 204 | 99.28 ms | Exact frontend origin allowed |
| Lookalike origin | 403 | 276.74 ms | No allow-origin header |

The initial health request's preceding idle interval is unknown, so its duration is not presented as a controlled cold-start result. The quick-scenario response has no validation errors and matches the shared browser engine exactly. Processing time and HTTP duration measure different things. The existing eight-second browser fallback and earlier controlled idle-start observation are documented below; they are not service guarantees.

A final public browser walkthrough repeated the hero-to-demo handoff, observed `BACKEND COMPLETE` at 66.30 tCO₂e, changed to FMCG at 453.64 tCO₂e and verified the 375-pixel hero and navigation menu. [Current live route and download evidence](measurements/revision-live-routes.json) records direct-route responses and hash reconciliation for the unchanged sample artifacts.

The previous-release record below preserves the original API boundary, export, direct-route and idle-start observations. Its performance scores apply only to that earlier build.

## Baseline verification: previous release

Release under test: [`63bcf041e71c21167df7025263301699249cf34d`](https://github.com/RS-010806/temt_iimb_sample/commit/63bcf041e71c21167df7025263301699249cf34d). Live HTTP checks ran on **14 September 2026, 01:43–01:44 IST** using Node 22 HTTPS requests from the development machine. Both public services responded successfully.

- Website: https://temt-iimb-sample.onrender.com
- API: https://temt-iimb-api.onrender.com
- [GitHub Actions run 34779961171](https://github.com/RS-010806/temt_iimb_sample/actions/runs/34779961171): completed successfully for the exact commit above. Source-data integrity, type checks, tests, both builds and artifact uploads all passed.
- Local verification: `npx vitest run`, Vitest 5.0.0, **89 tests across 3 files passed** at 01:44 IST. Coverage includes factor units, profile validation, complete-shipment exclusions, CSV injection protection, report reconciliation, API boundaries and CORS.

## Live API checks

The service was already awake before this audit. Durations below are individual observations with the complete response body read. Network duration includes connection and transfer overhead; engine duration comes from the API's measured `processingMs` field. These measurements establish neither a cold-start result nor a production latency guarantee.

| Check | HTTP | Network duration | Engine duration | Result |
| --- | ---: | ---: | ---: | --- |
| `GET /api/health` | 200 | 384.63 ms | n/a | `status: ok`, engine `temt-demo-1.0.0`, persistence `none` |
| `GET /api/factors` | 200 | 749.44 ms | n/a | All five factor records match the repository exactly |
| `POST /api/analyze`, 32-leg FMCG sample | 200 | 146.06 ms | 4.925 ms | Exact local/server calculation parity |
| `POST /api/analyze`, one invalid multi-leg shipment plus one valid shipment | 200 | 123.43 ms | 1.805 ms | Entire invalid shipment excluded; unrelated valid shipment retained |
| Allowed-origin JSON preflight | 204 | 102.94 ms | n/a | Exact frontend origin returned in CORS header |
| POST from a lookalike, unlisted origin | 403 | 173.58 ms | n/a | `origin_not_allowed`; no allow-origin header |
| Malformed JSON body | 400 | 103.27 ms | n/a | Sanitized `invalid_json` response |

The FMCG result contains **32 legs, 24 shipments, 11,323,896.6 tonne-kilometres and 453,635.58993 kg CO₂e**. Accepted rows, validation errors, aggregates, pipeline counts and engine version match the browser's shared engine output exactly; only the measured duration and calculation timestamp differ. API calculation timestamp: `2026-09-13T20:13:44.160Z`.

The invalid-shipment case returns `shipment_excluded` and `invalid_row`, retaining one valid leg at **66.3 kg CO₂e**. Responses use `Cache-Control: no-store`. This small live audit did not flood the service; body-size, row-count and rate-limit boundaries are covered by the automated tests.

## Live pages and downloads

Direct GET requests returned **200** for `/`, `/demo/`, `/methodology/`, `/privacy/`, `/robots.txt`, `/sitemap.xml`, `/data/nifty500.json`, `/data/nifty500-meta.json`, `/og.png` and `/favicon.svg`. The four HTML pages returned their expected titles. The public company directory contains **501 source records**. An unknown route returned **404**.

| Public download | HTTP / content type | Size | Verification |
| --- | --- | ---: | --- |
| `/downloads/temt-example-report.pdf` | 200 / `application/pdf` | 45,784 bytes | Full SHA-256 equals the repository artifact |
| `/downloads/temt-power-bi-pack.zip` | 200 / `application/zip` | 6,147 bytes | Full SHA-256 equals the repository artifact |
| `/downloads/temt-sample-shipments.csv` | 200 / `text/csv` | 5,548 bytes | Full SHA-256 equals the repository artifact |

The three-page example PDF was rendered with Poppler and every page was visually inspected. The ledger, summary and factor register fit without clipping or overlap. The ZIP contains eight files, including the exception ledger and factor register. Its shipment totals reconcile with the summary, and the downloadable input CSV reproduces the same 32-leg calculation. All three artifacts identify the example as synthetic.

## Browser, performance and idle-start evidence

Landing and demo layouts were inspected at 375, 768, 1024 and 1440 CSS pixels. The application body remains within each viewport; the wide shipment ledger scrolls inside its own container. An injected browser extension outside the application body inflated the root HTML measurement on mobile, so application bounds and visible layout were checked separately. Screenshots are retained in `artifacts/screenshots`.

The live browser walkthrough verified mobile navigation, keyboard slider changes (30% to 35% and back), expandable assumptions, the sample pipeline result of 1,394.328 kg CO₂e (displayed 1,394.33), real NIFTY company search, automotive sector mapping, rail filtering, editable tonnes and invalid URL-key recovery. A real browser POST displayed `BACKEND COMPLETE` and the expected 453.64 tCO₂e sample total. Editing one leg from 185.6 to 200 tonnes changed the total to 454.99 tCO₂e and correctly invalidated the server result.

Generated PDF and Power BI ZIP files were downloaded through the live UI and inspected locally. The edited ZIP summary reconciled to 454,991.29232999997 kg, 32 legs and 24 shipments, and included all eight reporting files. No application console errors were observed during the successful public walkthrough. Reduced-motion behavior was verified in the CSS and chart configuration; an OS preference toggle was not automated. With the local API stopped, the production frontend displayed `LOCAL FALLBACK`, explained the connection failure and retained the correct 453.64 tCO₂e result.

**Verification limitation:** the automated browser CSV file chooser was blocked by the Chrome extension's file-URL permission. The sample CSV roundtrip, required-column handling, invalid rows, full-shipment exclusion, import caps and export reconciliation are covered by automated tests. Native picker automation was unavailable on this machine; no permission setting was changed.

Final Lighthouse 13.4.1 audits against the public Render site:

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Desktop | 97 | 100 | 100 | 100 | 0.7 s | 1.1 s | 0 ms | 0 |
| Mobile | 87 | 100 | 100 | 100 | 1.6 s | 2.7 s | 350 ms | 0 |

Desktop fetched at `2026-09-13T20:18:56.021Z`; mobile at `2026-09-13T20:23:04.270Z`. Standard Lighthouse desktop and simulated mobile profiles were used in headless Chrome. Mobile uses a 412 × 823 viewport, 4× CPU slowdown and 150 ms RTT. Scores are lab observations on a shared machine, not field measurements or SLAs. **This previous release missed the mobile target of 90; the cinematic revision above meets that target.**

The landing uses responsive AVIF assets, local fonts and a lightweight preview engine. Full validation and report generation load on demand; speculative demo prefetch was disabled. Earlier local scores ranged from 87–93 mobile and 95–99 desktop. The final table reports the latest deployed observations, not the best run. Raw public reports are retained in `docs/measurements/lighthouse-mobile.json` and `docs/measurements/lighthouse-desktop.json`.

### Idle-start observation

After more than 15 minutes with no test traffic to the API, a browser analysis was requested at `2026-09-13T20:30:49.366Z` (02:00:49 IST). At the first observation, 9.8 seconds later, the interface displayed its slow-backend message and offered local processing while preserving the calculated sample preview. It remained pending at 19.7 seconds. At 50.8 seconds it displayed `BACKEND COMPLETE`, with the unchanged 453.64 tCO₂e result. These are observation bounds, not an exact response-time measurement. This behavior is consistent with free-service wake-up and is not a promised latency.

The final documentation release is `d8ec013`. Its [GitHub Actions run](https://github.com/RS-010806/temt_iimb_sample/actions/runs/34780874973) passed. The PDF and editable DOCX returned HTTP 200 from the public downloads and matched their repository SHA-256 hashes exactly. The only application change after the measured release renames the slow-start action to **Process in browser**; calculation behavior is unchanged.
