# Implementation verification

The application, calculation engine, exports and documents were checked against the assignment requirements. All 112 automated tests, TypeScript checks, source-integrity checks and frontend/API production builds passed. The source snapshot contains 501 valid NSE records; company activity in the demo remains synthetic.

## Calculation and data handling

The default 1,000-tonne, 1,000-km scenario produces 66,300 kg CO2e by road. A 30% rail allocation produces 49,590 kg, a reduction of 16,710 kg or 25.2% when displayed. Browser and API results match using the shared calculation engine. Intermediate values are not rounded.

Tests cover published factors, mode/profile agreement, dates, numerical limits, duplicate and missing leg indices, complete-shipment exclusion, partial engine failures, filter consistency, URL input validation, CSV parsing, spreadsheet-formula protection and export reconciliation. CSV import rejects the entire file if any row fails validation; engine analysis can retain unrelated valid shipments while excluding an invalid shipment in full.

The pipeline example returns 1,394.328 kg CO2e. Introducing its missing load excludes both affected shipment legs and leaves 1,034.28 kg. The FMCG sample reconciles to 453,635.58993 kg across 24 shipments and 32 legs.

## Interface and accessibility

Browser checks covered 375, 768, 1024 and 1440 CSS-pixel layouts, navigation, keyboard sliders, numeric input, chapter controls, tab navigation, disclosures, company search, filters and editable shipment legs. The hero's weight, distance and rail allocation continue into the working demo. Changing sector replaces that scenario with the selected sample. Wide shipment tables scroll within their own container.

Manual pause/play and chapter selection were exercised. Reduced-motion and data-saving behavior were checked in code; an operating-system preference toggle was not automated. Native CSV picker automation was blocked by the browser extension's file-URL permission, so import behavior was verified through parser and reconciliation tests. No permission settings were changed.

## Measured website performance

| Lighthouse preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Mobile | 91 | 100 | 100 | 100 | 2.0 s | 2.9 s | 50 ms | 0 |
| Desktop | 100 | 100 | 100 | 100 | 0.3 s | 0.6 s | 0 ms | 0 |

Lighthouse 13.4.1 measured the public site on 14 September 2026 at 03:08 IST. Simulated mobile used a 412 × 823 viewport, 4× CPU slowdown and 150 ms RTT; desktop used 1× CPU and 40 ms RTT. Runs were sequential on a shared machine. These are lab observations, not field Core Web Vitals, service guarantees or an accessibility certification. Mobile TBT is displayed as 50 ms; the raw value is 54 ms.

Raw reports: [mobile](measurements/lighthouse-mobile-revision.json) and [desktop](measurements/lighthouse-desktop-revision.json). The document-formatting changes did not trigger a new performance benchmark.

## API and availability

Live health, factor and analysis requests returned successful responses. The one-leg default scenario matched the browser calculation at 66,300 kg CO2e. Allowed-origin preflights succeeded, lookalike origins were rejected, and malformed requests returned controlled errors. Tests cover the 1,000-leg and 2 MiB caps and the rate limiter. CORS controls browser origins; it is not authentication. Health and CORS preflight requests are outside the factors/analysis rate limit.

The browser displays local results immediately. It offers a manual processing action after eight seconds of waiting, and falls back locally on failure or the 90-second timeout. A live idle-start walkthrough confirmed the manual option remained available while the free API woke. Network and engine timings are individual observations, not production latency guarantees.

## Reports and downloads

Public pages and downloads returned HTTP 200; an unknown route returned 404. Exported PDF/CSV/Power BI data reconciled with the selected calculation. The Power BI pack contains data, factor and exception tables, field definitions, Power Query guidance and DAX measures. Import into Power BI Desktop was not performed.

The five-page design document uses black Times New Roman text and retains the actual interface screenshots. Every page was rendered and inspected. [Document QA](case-study-qa.md) records fonts, links, table geometry and image integrity. Operational PDFs use the standard PDF Times family; the sample, long-identifier/exception and empty-filter reports passed the checks in [report export QA](report-export-qa.md). No standalone proprietary fonts are served by the site.
