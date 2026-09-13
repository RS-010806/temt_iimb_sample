# Release verification

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

Desktop fetched at `2026-09-13T20:18:56.021Z`; mobile at `2026-09-13T20:23:04.270Z`. Standard Lighthouse desktop and simulated mobile profiles were used in headless Chrome. Mobile uses a 412 × 823 viewport, 4× CPU slowdown and 150 ms RTT. Scores are lab observations on a shared machine, not field measurements or SLAs. **The latest mobile performance score missed the target of 90; desktop and accessibility targets were met.**

The landing uses responsive AVIF assets, local fonts and a lightweight preview engine. Full validation and report generation load on demand; speculative demo prefetch was disabled. Earlier local scores ranged from 87–93 mobile and 95–99 desktop. The final table reports the latest deployed observations, not the best run. Raw public reports are retained in `docs/measurements/lighthouse-mobile.json` and `docs/measurements/lighthouse-desktop.json`.

### Idle-start observation

After more than 15 minutes with no test traffic to the API, a browser analysis was requested at `2026-09-13T20:30:49.366Z` (02:00:49 IST). At the first observation, 9.8 seconds later, the interface displayed its slow-backend message and offered local processing while preserving the calculated sample preview. It remained pending at 19.7 seconds. At 50.8 seconds it displayed `BACKEND COMPLETE`, with the unchanged 453.64 tCO₂e result. These are observation bounds, not an exact response-time measurement. This behavior is consistent with free-service wake-up and is not a promised latency.

The final documentation release is `d8ec013`. Its [GitHub Actions run](https://github.com/RS-010806/temt_iimb_sample/actions/runs/34780874973) passed. The PDF and editable DOCX returned HTTP 200 from the public downloads and matched their repository SHA-256 hashes exactly. The only application change after the measured release renames the slow-start action to **Process in browser**; calculation behavior is unchanged.
