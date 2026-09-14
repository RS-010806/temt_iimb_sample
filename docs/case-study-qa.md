# Technical submission QA

The five-page report is addressed to Pratham Agarwal at IIM Bangalore as a post-meeting technical submission. It describes validated application release `81f7a0b52022b3af7773bed137992968e2f11d36`. The document presentation was rewritten on 14 September 2026 without substituting new application measurements or altering screenshot content.

Final artifacts are `artifacts/deliverables/TEMT-Product-Case-Study.docx` and `artifacts/deliverables/TEMT-Product-Case-Study.pdf`. Identical copies are in `apps/web/public/downloads/`. The established filenames remain in use so existing download links continue to resolve.

## Page review

The Word file was rendered with the managed Documents runtime and its canonical `render_docx.py`. The author inspected every final page PNG at original resolution after the interface-label and preflight wording corrections. The release coordinator independently reviewed all five pages of the preceding formal version, then checked the corrected final pages 3 and 4. The unchanged pages and both corrected pages have clean layout. All five pages are US Letter, have one-inch margins and carry consistent page numbers. No clipping, overlap, missing glyphs, split tables or orphaned captions was observed.

| Page | Reviewed content |
| --- | --- |
| 1 | Recipient and purpose; implemented scope; desktop/mobile screenshots; synthetic-data and certification boundaries |
| 2 | Calculation equation; five exact factor values and source pages; default 30% rail-share arithmetic; assumptions and record contract |
| 3 | Valid pipeline screenshot; complete-shipment exclusion; all-or-nothing CSV import; three API endpoints and implemented controls |
| 4 | CDN frontend and separate Singapore API; manual continuation after eight seconds and 90-second timeout; analytics/workspace screenshots; interaction rationale and exports |
| 5 | 112 tests; public Lighthouse measurements; scoped API observations; delivery links; proposed production work and limitations |

## Typography and structure

The DOCX audit confirmed Times New Roman as the only font family in document text, styles, headers and footers. Every declared text colour is `000000`. PDF inspection confirmed that all 9,068 non-space text characters use embedded Times New Roman Regular or Bold and RGB `(0, 0, 0)`. This includes headings, captions, tables, links and page fields. Body text is 11 pt; the title is 18 pt, page headings 14 pt, table text 10 pt, captions 9.5 pt and header/footer text 9 pt. No em dashes occur in the authored Word or PDF text.

The document contains three data tables with explicit 9,360-DXA geometry, four explicit page breaks, five screenshots with alternative text, and 13 PDF hyperlinks with the intended destinations. Numeric table columns are centred. Screenshots are placed in normal paragraphs rather than layout tables.

## Image and evidence integrity

Every embedded screenshot was decoded and compared with its original. All five have identical dimensions and RGB pixels. Four source JPEGs require an in-memory JFIF metadata marker for Word compatibility; no image was cropped, retouched or re-encoded. Coloured text inside an unchanged screenshot is part of the raster evidence, not authored document text.

Four captures show local production build `81f7a0b`, as identified in the document. The retained workspace screenshot shows the unchanged synthetic FMCG scenario from the earlier public release. The pipeline screenshot displays the valid result of 1,394.33 kg CO2e; the prose separately explains that a missing load excludes both TEMT-002 legs, leaving TEMT-001 at 1,034.28 kg CO2e.

The recorded public Lighthouse scores remain 100 desktop and 91 mobile, with accessibility, best practices and SEO each 100. The report attributes them to 14 September 2026 at 03:08 IST and identifies simulated lab conditions. Displayed mobile TBT is 50 ms; the raw 54 ms value is stated. Mobile LCP is 2.9 seconds. No field Core Web Vitals or accessibility certification is claimed.

The one-leg API observation remains 66,300 kg CO2e with exact browser/server parity, 1.82 ms engine time and 112.83 ms HTTP time. The initial 23.25-second health request has unknown prior idle history and is not labelled a controlled cold start. All observed application evidence remains tied to the measured release; this document revision did not rerun the application benchmark.

The technical review distinguishes the browser's all-or-nothing CSV import from the engine's exclusion of an invalid identifiable shipment. It also distinguishes the manual “Process in browser” action after eight seconds from a 90-second request timeout, and exact-origin CORS from authentication. Health and CORS preflight requests are correctly identified as outside the factors/analysis rate limit. The API limit is 2 MiB (2,097,152 bytes), not decimal 2 MB. Proposed enterprise controls are explicitly future work.

## Final artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| DOCX | 455384 | `88957a7f5302f7dfefa55cd43226b4cf0231c75e5a8835cc2128a30b104b2927` |
| PDF | 760314 | `556f5253a8c5a4fc7aa6c1a075b8b1be9042f9e5a52ddbf089dee66650e08cd2` |

Final page renders:

- `artifacts/doc-build/technical-submission-final-qa-v2/page-1.png`
- `artifacts/doc-build/technical-submission-final-qa-v2/page-2.png`
- `artifacts/doc-build/technical-submission-final-qa-v2/page-3.png`
- `artifacts/doc-build/technical-submission-final-qa-v2/page-4.png`
- `artifacts/doc-build/technical-submission-final-qa-v2/page-5.png`

The local machine-readable audit is `artifacts/doc-build/technical-submission-final-qa-v2/structural-audit.json`. Rendering intermediates and private font configuration remain outside the distributed deliverables. Public download copies were compared byte-for-byte with the checked artifacts. The release coordinator handles the subsequent commit, push and deployed-file verification.
