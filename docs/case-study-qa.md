# Design document QA

The design document covers the implemented interface, calculation method, data validation, architecture and measured performance. The final rendering directory is `artifacts/doc-build/design-document-final`.

All five final US Letter pages were visually inspected and are clean, with one-inch margins, black Times New Roman text and unchanged screenshots. Structural checks confirmed five original images, 12 hyperlink targets and no em dashes. The audit is `artifacts/doc-build/design-document-final/structural-audit.json`.

| Page | Checked content |
| --- | --- |
| 1 | Assignment scope, desktop/mobile interface, synthetic-data boundary |
| 2 | Equation, five factors, default scenario arithmetic, record assumptions |
| 3 | Pipeline result, shipment exclusion, CSV import, API endpoints and limits |
| 4 | Static frontend, separate API, browser fallback, analytics and exports |
| 5 | Tests, measured performance, delivery links and proposed production work |

Technical evidence includes 112 passing tests; Lighthouse performance of 100 desktop and 91 mobile; accessibility, best practices and SEO scores of 100; and an API observation of 66,300 kg CO2e with exact browser/server parity. The 1.82 ms processing time and 112.83 ms HTTP time are individual observations. The initial 23.25-second health request has unknown prior idle history.

The report must distinguish all-or-nothing CSV import from complete-shipment exclusion, the manual “Process in browser” action after eight seconds from the 90-second timeout, and CORS from authentication. Health and CORS preflight requests are outside the factors/analysis rate limit. The request limit is 2 MiB and the analysis limit is 1,000 legs.

Final output paths:

- `artifacts/deliverables/TEMT-Product-Case-Study.docx`
- `artifacts/deliverables/TEMT-Product-Case-Study.pdf`
- `apps/web/public/downloads/TEMT-Product-Case-Study.docx`
- `apps/web/public/downloads/TEMT-Product-Case-Study.pdf`

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| PDF | 748424 | `f57f9d639501778d79725e95f3c09cb6c5244f923663dcac34a477e419af89d1` |
| DOCX | 455040 | `2aca03d33bce69e93e6290a0737f565a54829178ef28c8492aeb6e058ea5f149` |
