# Case study QA

Final artifacts: `artifacts/deliverables/TEMT-Product-Case-Study.docx` and `artifacts/deliverables/TEMT-Product-Case-Study.pdf`.

The final Word file was rendered with the managed Documents runtime on 14 September 2026. Every one of the five rendered pages was visually inspected after the final screenshot and measurement updates. No clipped text, overlap, orphaned page content or misplaced table rows was observed. The PDF is exactly five US Letter pages and carries page numbers 1/5 through 5/5.

| Page | Checked content |
| --- | --- |
| 1 | Outcome, actual public hero, scope and synthetic-data boundary |
| 2 | Actual desktop workspace and mobile captures, three buyer actions |
| 3 | Completed pipeline capture, input validation, shared calculations and exports |
| 4 | Architecture, 89 tests, public Lighthouse observations, warm API timing and CI link |
| 5 | Live handoff links, design decisions, selected sources and credits |

Structural checks confirmed four screenshots with alternative text, four explicit page breaks, eleven correct PDF hyperlink destinations and zero em dashes. PDF font inspection confirmed embedded subsets of Manrope Regular/Bold, Barlow Condensed SemiBold and IBM Plex Mono Regular. The text remains editable in the DOCX. Screenshot hashes and dimensions are recorded in `docs/case-study-evidence.json`.

The report uses the final public observations of 97 desktop and 87 mobile performance, with accessibility 100 on both. It explicitly records that the mobile performance target of 90 was not met and describes the lab conditions. The 4.925 ms calculation and 146.06 ms request are identified as one warm API observation. Cold-start behavior is not represented by those measurements.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| DOCX | 408942 | `27023cdcdb9d8259d50c342a0ea4a9eb026e24f2ef60fdc57f9ae91c3c654245` |
| PDF | 619599 | `5f7bd28c34608a7ee2a9c66f8b9c7ad7dca2fbab5462b97031ec2300adb4dfb6` |

The application release referenced in the report is `63bcf04`. The final document's later commit does not change the release that was tested.
