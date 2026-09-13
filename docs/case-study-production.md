# Case study production

The five-page case study is generated from `docs/generate-case-study.py` and the observed evidence in `docs/case-study-evidence.json`. The editable Word file and its visually checked PDF are in `artifacts/deliverables/`.

## Document design

The document follows the `standard_business_brief` preset and `customer_pack` header pattern from the Documents skill. Named brand overrides use Manrope body text, Barlow Condensed titles, IBM Plex Mono metadata, and the site's graphite, ivory and orange palette. Pages are US Letter with one-inch margins. Tables have explicit widths; screenshots include alternative text. All five pages use actual browser captures, editable headings and paragraphs, and live hyperlinks.

The PDF embeds the selected fonts. Editing the DOCX on another computer without those fonts can change line breaks or pagination. Install the matching open-source fonts before editing or use the PDF for consistent presentation. Font licenses are retained in `apps/web/public/fonts/`.

## Evidence and reproduction

1. Review `docs/verification.md` and update the evidence manifest only with observed results. The public deployment, warm API timing and browser lab measurements have different test conditions.
2. Preserve the four source screenshots in `artifacts/screenshots/`. Do not substitute illustrations for working interface evidence.
3. Run `docs/generate-case-study.py` with Python containing `python-docx` and Pillow. The build requires the live URLs and completed verification flags.
4. Render the Word file with the Documents skill's `render_docx.py`, using `--emit_pdf`. Use a fontconfig file whose directories include the static Manrope Regular/Bold, Barlow Condensed SemiBold and IBM Plex Mono Regular TTFs plus the renderer's bundled fallback fonts.
5. Verify the result is exactly five pages, visually inspect every rendered page, check font embedding and hyperlink destinations, then copy the checked PDF to `artifacts/deliverables/TEMT-Product-Case-Study.pdf`.

The production run used the managed Codex document runtime. Intermediate page renders, private font configuration and local audit reports stay in ignored build directories. The source screenshots, evidence manifest, generation script and final artifacts remain reviewable.

The `commit` field identifies the application release tested for the case study. A later documentation-only commit can contain the finished case study without changing that reference.
