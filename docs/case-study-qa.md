# Case study QA

The refreshed case study describes validated application release `81f7a0b52022b3af7773bed137992968e2f11d36`. Final artifacts are `artifacts/deliverables/TEMT-Product-Case-Study.docx` and `artifacts/deliverables/TEMT-Product-Case-Study.pdf`; identical copies are in `apps/web/public/downloads/` for the next documentation deployment.

The final Word file was rendered with the managed Documents runtime on 14 September 2026. The document author and release coordinator each visually inspected all five final page PNGs. No clipped text, overlap, orphaned content or misplaced table rows was observed. The PDF is exactly five US Letter pages with page numbers 1/5 through 5/5.

| Page | Checked content |
| --- | --- |
| 1 | Cinematic desktop hero, mobile estimator priority, outcome and synthetic-data boundary |
| 2 | Landing reporting, retained enterprise workspace, story chapters, URL handoff and interaction behavior |
| 3 | Completed pipeline, missing-load control, validation, calculation and reporting trail |
| 4 | Architecture, 112 tests, current public Lighthouse results, API timing scope and successful CI link |
| 5 | Live handoff links, design decisions, source references and credits |

The four new captures show local production build `81f7a0b`, explicitly identified in the captions. The retained workspace screenshot shows the same unchanged FMCG scenario from the earlier public release. The pipeline screenshot displays the valid result of 1,394.33 kgCO₂e; the text separately explains what the missing-load control does.

Structural checks confirmed five screenshots with alternative text, four explicit page breaks, eleven correct PDF hyperlink destinations and zero em dashes. Every embedded screenshot was decoded and compared with its original: dimensions and RGB pixels match exactly. Four JPEG copies received an in-memory JFIF marker for Word compatibility; source files were not altered. PDF font inspection confirmed embedded Manrope Regular/Bold, Barlow Condensed SemiBold and IBM Plex Mono Regular. Text remains editable in the DOCX.

The document reports the final public performance scores of 100 desktop and 91 mobile, with accessibility 100 on both. The project performance floors were met. LCP is 0.6 s desktop and 2.9 s mobile. The displayed mobile TBT is 50 ms, matching Lighthouse's rounded display; its raw numeric value of 54 ms is retained in the manifest. These are lab observations, not field results.

The current one-leg API analysis returned 66,300 kgCO₂e with exact client/server parity. The 1.82 ms engine duration and 112.83 ms HTTP duration are identified as individual warm observations. The initial 23.25 s health request has unknown prior idle history and is not presented as a controlled cold-start measurement. Previous release results remain archived under `previous_release` in the evidence manifest.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| DOCX | 453532 | `60c67b3fef697f7eae164733524a25d5a265d8e9c712ce14a951a956e43d3cb9` |
| PDF | 611642 | `733aacbdbd234457bb84b285797234bf5a9aae948965207047af6ff474b798aa` |

Final page renders:

- `artifacts/doc-build/case-study-revision-final-qa/page-1.png`
- `artifacts/doc-build/case-study-revision-final-qa/page-2.png`
- `artifacts/doc-build/case-study-revision-final-qa/page-3.png`
- `artifacts/doc-build/case-study-revision-final-qa/page-4.png`
- `artifacts/doc-build/case-study-revision-final-qa/page-5.png`

The generated document references the application release tested above. Its later documentation-only commit does not change that test reference. No commit or push was performed by the document task.
