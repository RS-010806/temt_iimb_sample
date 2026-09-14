# Technical submission production

`docs/generate-case-study.py` builds the editable five-page Word submission from `docs/case-study-evidence.json` and the retained browser screenshots. Its checked PDF and Word file are stored in `artifacts/deliverables/`, with identical copies in `apps/web/public/downloads/`. The filenames `TEMT-Product-Case-Study.pdf` and `.docx` are retained for stable download URLs; the document title is “TEMT Enterprise Product Preview: Technical Submission”.

## Purpose and document specification

The report is a formal post-meeting submission to Pratham Agarwal at IIM Bangalore. Its five pages cover scope and status; calculation method and data; validation and API controls; architecture and interface decisions; and verification, delivery and proposed production work.

The document uses the Documents skill's `standard_business_brief` preset and `memo_masthead` header pattern, with the user's formal typography requirements as named overrides. All authored text uses Times New Roman and black (`000000`), including links, captions, table text and headers/footers. The title is 18 pt, page headings 14 pt, body 11 pt, tables 10 pt, captions 9.5 pt and headers/footers 9 pt. Pages are US Letter with one-inch margins; normal paragraphs use 1.10 line spacing and six points of trailing space. Three genuine data tables use explicit 9,360-DXA widths and matching grid/cell geometry. Screenshots are inline images in normal paragraphs, not table-based layouts.

The generator applies the font and colour rules to Word styles and all explicit run properties. The exported PDF is then inspected independently to verify the actual rendered fonts and colours. The presentation contains no promotional headings or em dashes. Screenshot content remains unchanged even where the product interface itself uses colour or different fonts.

## Fonts and images

The local render uses the real Times New Roman Regular and Bold fonts available in `/System/Library/Fonts/Supplemental/`. The private fontconfig file at `artifacts/doc-build/fonts-tnr.conf` points to that directory and the managed renderer's bundled fallback fonts. No desktop font files are copied into the repository or public assets. The PDF embeds subsets of Times New Roman Regular and Bold. Editing the DOCX on a computer without Times New Roman can change pagination; the checked PDF preserves the rendered presentation.

The four revised screenshots show the local production build of `81f7a0b`; the retained workspace image depicts the unchanged synthetic FMCG scenario from the prior public release. Capture provenance, dimensions and hashes are retained in the evidence manifest. Captions identify this distinction.

Four browser JPEG captures lack JFIF/Exif metadata used by `python-docx` to detect JPEG images. The helper adds a JFIF marker to an in-memory embedding copy while preserving the compressed stream. It asserts identical decoded dimensions and RGB pixels. Original files are never cropped, retouched or re-encoded.

## Reproduction and verification

1. Review the evidence manifest, `docs/verification.md`, current source contracts and raw measurements before changing claims. Application evidence refers to the measured release, not automatically to a later documentation commit.
2. Confirm the live URLs, completed verification flags, positive passing-test count and five screenshot roles. Final generation requires `status: "ready"`; it does not proceed with missing evidence.
3. Run the generator with the managed document runtime containing `python-docx` and Pillow. The script's default output is `artifacts/deliverables/TEMT-Product-Case-Study.docx`.
4. Render the Word file with the Documents skill's canonical `render_docx.py`, passing `--emit_pdf` and a task-specific fontconfig that resolves Times New Roman. Use a new output directory for each final candidate.
5. Confirm exactly five pages and inspect every page PNG at original resolution. Check the recipient, equation, factors, numeric example, validation distinctions, API limits, timing scope, download links and future-work wording as well as layout.
6. Inspect DOCX XML and actual PDF text: all fonts must be Times New Roman, every text colour must be black, and authored text must contain no em dash. Check the table geometry, page fields, alternative text and hyperlink destinations. Compare embedded images against the originals using decoded RGB pixels.
7. Copy the visually checked PDF into `artifacts/deliverables/` and both files into `apps/web/public/downloads/`. Verify byte-for-byte equality and record final hashes in the evidence and QA files.

The final run used the managed Codex Python runtime and LibreOffice renderer on 14 September 2026. All five final pages were visually inspected by the document author after the interface-label and preflight wording corrections. The release coordinator independently reviewed all five preceding formal pages; structural checks are recorded in `docs/case-study-qa.md`. The author did not commit or push. The release coordinator performs final repository and deployed-file checks.

## Scope of the recorded evidence

The application release is `81f7a0b52022b3af7773bed137992968e2f11d36`, with 112 passing tests and the recorded public Lighthouse/API observations. Prior measurements remain archived under `previous_release`; they are not substituted for current evidence. The report explains that defaults support scenario estimates, CORS does not provide authentication, and the Power BI pack is a file-import workflow. Certification references concern the original TEMT product and do not certify this demonstration. SSO, tenant isolation, persistent audit trails, governed data integrations and monitored production capacity are proposals, not implemented claims.
