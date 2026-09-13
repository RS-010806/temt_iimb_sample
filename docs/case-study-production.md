# Case study production

The five-page case study is generated from `docs/generate-case-study.py` and the observed evidence in `docs/case-study-evidence.json`. The editable Word file and its visually checked PDF are in `artifacts/deliverables/`.

## Cinematic revision status

The cinematic case study is complete for validated application release `81f7a0b`. Its PDF/DOCX deliverables and the matching copies in `apps/web/public/downloads/` have been refreshed. The evidence manifest retains the historical record under `previous_release`; active fields contain the current 112-test release and public measurements. Final generation requires `status: "ready"`, completed checks and all five capture roles.

The verified five-page sequence is: desktop/mobile hero and outcome; landing analytics/workspace and buyer journey; pipeline and calculation evidence; architecture and observed verification; handoff links, decisions and sources. The visual revision retains the baseline product's company directory, shared factors, validation, workspace and exports.

## Document design

The document follows the `standard_business_brief` preset and `customer_pack` header pattern from the Documents skill. Named brand overrides use Manrope body text, Barlow Condensed titles, IBM Plex Mono metadata, and the site's graphite, ivory and orange palette. Pages are US Letter with one-inch margins. Tables have explicit widths; screenshots include alternative text. Borderless cells hold the paired captures together without wrapping. The document uses actual browser captures, editable headings and paragraphs, and live hyperlinks.

Four revised captures show the local production build of `81f7a0b`; captions identify that context. The existing public workspace capture was retained after confirming that its visible FMCG scenario still represents the product. The missing-load control is visible in the pipeline capture, while its displayed result is the valid sample. No screenshot is represented as a new public-browser capture when it was taken from the local production build.

The browser's progressive JPEG captures omit JFIF/Exif metadata that `python-docx` uses to identify images. The generator inserts a JFIF marker into an in-memory embedded copy and verifies identical decoded RGB pixels. It preserves the original compressed image stream and leaves source files untouched. This is metadata normalization only; no resizing, cropping or retouching is applied to the source captures.

The PDF embeds the selected fonts. Editing the DOCX on another computer without those fonts can change line breaks or pagination. Install the matching open-source fonts before editing or use the PDF for consistent presentation. Font licenses are retained in `apps/web/public/fonts/`.

## Evidence and reproduction

1. Review `docs/verification.md` and update the evidence manifest only with observed results. The public deployment, warm API timing and browser lab measurements have different test conditions.
2. Review the five capture roles in the manifest: desktop hero, mobile hero, landing reporting, enterprise workspace and pipeline. Record whether each shows the public deployment or the corresponding local production build, its visible state, dimensions and hash. Retain a prior capture only if its visible content still represents the revised product. Do not substitute illustrations for interface evidence.
3. Once final evidence is supplied, remove resolved pending items and set `status` to `ready`. Run `docs/generate-case-study.py` with Python containing `python-docx` and Pillow. The build requires the live URLs, validated release, completed verification flags, passing test count, measurement rows and five screenshots. It never substitutes the previous release's measurements.
4. Render the Word file with the Documents skill's `render_docx.py`, using `--emit_pdf`. Use a fontconfig file whose directories include the static Manrope Regular/Bold, Barlow Condensed SemiBold and IBM Plex Mono Regular TTFs plus the renderer's bundled fallback fonts.
5. Verify the result is exactly five pages, visually inspect every rendered page, check font embedding and hyperlink destinations, then copy the checked PDF to `artifacts/deliverables/TEMT-Product-Case-Study.pdf`.

The final production run used the managed Codex document runtime. Every page was visually reviewed by the document author and the release coordinator. Intermediate page renders, private font configuration and local audit reports stay in ignored build directories. The source screenshots, evidence manifest, generation script and final artifacts remain reviewable. Rendering began after public benchmark collection completed.

The `commit` field identifies the application release tested for the case study. A later documentation-only commit can contain the finished case study without changing that reference.
