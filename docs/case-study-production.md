# Design document production

`docs/generate-case-study.py` creates “TEMT: Design and Implementation” from `docs/case-study-evidence.json` and the interface screenshots. The document covers the assignment's implemented scope, calculation method, validation controls, architecture, interaction decisions and verification.

The document uses black Times New Roman throughout. The title is 18 pt, page headings 14 pt, body 11 pt, tables 10 pt, captions 9.5 pt and headers/footers 9 pt. Pages are US Letter with one-inch margins. The header is “TEMT Design Document”; the footer contains only the page number. The layout follows the standard business brief preset with a neutral masthead. Screenshots retain their original colours and pixels.

Three data tables use explicit 9,360-DXA widths. Images are inline in normal paragraphs. Browser JPEGs that lack identification metadata receive an in-memory JFIF marker for Word compatibility; the helper checks that decoded dimensions and RGB pixels remain identical.

The managed Python runtime supplies `python-docx` and Pillow. The canonical Documents renderer uses the installed Times New Roman fonts through `artifacts/doc-build/fonts-tnr.conf`. Desktop font files are not copied into the repository or public assets.

The final rendering directory is `artifacts/doc-build/design-document-final`. All five final pages were visually confirmed. The PDF and DOCX are copied to `artifacts/deliverables/` and `apps/web/public/downloads/`; final sizes and hashes are recorded in the evidence and QA files. Structural checks confirmed Times New Roman, black text, five intact original images, 12 hyperlink targets and no em dashes.

Recorded technical evidence includes 112 passing tests and the public Lighthouse/API observations. Default factors support scenario estimates; CORS does not supply authentication; and the Power BI pack is a file-import workflow. The original TEMT certification does not certify this demonstration. Enterprise authentication, tenant isolation, persistent audit trails and governed integrations remain proposed production work.
