#!/usr/bin/env python3
"""Build the five-page editable case study using the managed document runtime.

The evidence manifest is deliberately separate from layout. Final generation
requires actual screenshots, live URLs and completed build/API checks.
Preset: standard_business_brief. Header pattern: customer_pack.
Named brand overrides: Manrope body; Barlow Condensed titles; IBM Plex Mono
metadata; graphite/orange/ivory palette; page-leading headings 26pt; 36pt title.
"""
from __future__ import annotations

import argparse
import json
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
INK = "101512"
ORANGE = "C6471D"
IVORY = "F4F2EB"
MUTED = "566059"
LINE = "D9DDD5"
BODY = "Manrope"
DISPLAY = "Barlow Condensed"
MONO = "IBM Plex Mono"
WIDTH = 6.5


def font(style, family, size, color=INK, bold=False):
    style.font.name = family
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.italic = False
    style.font.color.rgb = RGBColor.from_string(color)
    rpr = style.element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.insert(0, rf)
    for name in ("ascii", "hAnsi", "eastAsia", "cs"):
        rf.set(qn(f"w:{name}"), family)
    for name in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        rf.attrib.pop(qn(f"w:{name}"), None)
    for name in ("spacing", "iCs"):
        for item in rpr.findall(qn(f"w:{name}")):
            rpr.remove(item)


def spacing(style, before=0, after=6, line=1.10):
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.line_spacing = line
    style.paragraph_format.left_indent = Inches(0)
    style.paragraph_format.right_indent = Inches(0)
    style.paragraph_format.first_line_indent = Inches(0)
    ppr = style.element.get_or_add_pPr()
    for name in ("pBdr", "numPr", "contextualSpacing"):
        for item in ppr.findall(qn(f"w:{name}")):
            ppr.remove(item)


def style(doc, name, family=BODY, size=11, color=INK, bold=False, before=0, after=6, line=1.10):
    result = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    font(result, family, size, color, bold)
    spacing(result, before, after, line)
    return result


def shade(paragraph, color=IVORY):
    ppr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    ppr.append(shd)


def field(paragraph, instruction):
    run = paragraph.add_run()
    field_el = OxmlElement("w:fldSimple")
    field_el.set(qn("w:instr"), instruction)
    run._r.addnext(field_el)


def link(paragraph, label, url):
    rel = paragraph.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    element = OxmlElement("w:hyperlink")
    element.set(qn("r:id"), rel)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), ORANGE)
    props.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(underline)
    run.append(props)
    text = OxmlElement("w:t")
    text.text = label
    run.append(text)
    element.append(run)
    paragraph._p.append(element)


def body(doc, text, name="Normal"):
    return doc.add_paragraph(text, style=name)


def label_para(doc, label, text):
    p = doc.add_paragraph(style="Normal")
    p.add_run(label + " ").bold = True
    p.add_run(text)
    return p


def heading(doc, number, title, subtitle=None):
    body(doc, f"{number:02d} / DESIGN & ENGINEERING", "Kicker")
    doc.add_paragraph(title, style="Page Heading")
    if subtitle:
        body(doc, subtitle, "Lead")


def word_image(path):
    """Add a JFIF marker in memory for JPEG captures lacking format metadata.

    python-docx identifies JPEGs by JFIF/Exif markers. The browser can emit
    valid progressive JPEGs without either. Preserve the compressed image
    stream and assert identical decoded pixels before embedding the copy.
    """
    raw = path.read_bytes()
    if raw[:2] == b"\xff\xd8" and raw[6:11] not in (b"JFIF\x00", b"Exif\x00"):
        marker = bytes.fromhex("ffe000104a46494600010100000100010000")
        normalized = raw[:2] + marker + raw[2:]
        with Image.open(BytesIO(raw)) as original, Image.open(BytesIO(normalized)) as embedded:
            if original.size != embedded.size or original.convert("RGB").tobytes() != embedded.convert("RGB").tobytes():
                raise ValueError(f"JPEG metadata normalization changed pixels: {path}")
        return BytesIO(normalized)
    return str(path)


def screenshot(doc, path, width=WIDTH, max_height=None, alt=""):
    p = doc.add_paragraph(style="Figure")
    with Image.open(path) as img:
        ratio = img.height / img.width
    if max_height and width * ratio > max_height:
        width = max_height / ratio
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(word_image(path), width=Inches(width))
    shape._inline.docPr.set("descr", alt)
    return p


def screenshot_pair(doc, items, max_height):
    """Keep actual captures together without cropping or changing their pixels."""
    tbl = doc.add_table(rows=1, cols=len(items))
    tbl.autofit = False
    total = sum(item[1] for item in items)
    widths = [round(9360 * item[1] / total) for item in items]
    widths[-1] = 9360 - sum(widths[:-1])
    props = tbl._tbl.tblPr
    props.find(qn("w:tblW")).set(qn("w:w"), "9360")
    props.find(qn("w:tblW")).set(qn("w:type"), "dxa")
    margins = OxmlElement("w:tblCellMar")
    for edge in ("top", "bottom", "start", "end"):
        margin = OxmlElement(f"w:{edge}")
        margin.set(qn("w:w"), "0")
        margin.set(qn("w:type"), "dxa")
        margins.append(margin)
    props.append(margins)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "bottom", "left", "right", "insideH", "insideV"):
        border = OxmlElement(f"w:{edge}")
        border.set(qn("w:val"), "nil")
        borders.append(border)
    props.append(borders)
    tbl.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    for index, (path, max_width, alt) in enumerate(items):
        tbl._tbl.tblGrid.gridCol_lst[index].set(qn("w:w"), str(widths[index]))
        cell = tbl.cell(0, index)
        cell.width = Inches(widths[index] / 1440)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.style = doc.styles["Figure"]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        with Image.open(path) as img:
            ratio = img.height / img.width
        width = min(max_width, max_height / ratio)
        shape = p.add_run().add_picture(word_image(path), width=Inches(width))
        shape._inline.docPr.set("descr", alt)
    return tbl


def caption(doc, number, text):
    p = doc.add_paragraph(style="Caption")
    p.add_run(f"FIG. {number:02d}  ").bold = True
    p.add_run(text)
    return p


def new_page(doc):
    p = doc.add_paragraph(style="Page Break")
    p.add_run().add_break(WD_BREAK.PAGE)


def table(doc, rows, widths):
    tbl = doc.add_table(rows=1, cols=len(widths))
    tbl.autofit = False
    tblpr = tbl._tbl.tblPr
    width_el = tblpr.find(qn("w:tblW"))
    width_el.set(qn("w:w"), str(sum(widths)))
    width_el.set(qn("w:type"), "dxa")
    indent = OxmlElement("w:tblInd")
    indent.set(qn("w:w"), "120")
    indent.set(qn("w:type"), "dxa")
    tblpr.append(indent)
    margins = OxmlElement("w:tblCellMar")
    for edge, amount in (("top", 80), ("bottom", 80), ("start", 120), ("end", 120)):
        item = OxmlElement(f"w:{edge}")
        item.set(qn("w:w"), str(amount))
        item.set(qn("w:type"), "dxa")
        margins.append(item)
    tblpr.append(margins)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        item = OxmlElement(f"w:{edge}")
        item.set(qn("w:val"), "single")
        item.set(qn("w:sz"), "4")
        item.set(qn("w:color"), LINE)
        borders.append(item)
    tblpr.append(borders)
    for grid, value in zip(tbl._tbl.tblGrid.gridCol_lst, widths):
        grid.set(qn("w:w"), str(value))
    for i, values in enumerate(rows):
        row = tbl.rows[0] if i == 0 else tbl.add_row()
        for cell, value, colwidth in zip(row.cells, values, widths):
            cell.width = Inches(colwidth / 1440)
            cell._tc.get_or_add_tcPr().find(qn("w:tcW")).set(qn("w:w"), str(colwidth))
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = cell.paragraphs[0]
            p.style = doc.styles["Table Text"]
            p.add_run(value).bold = i == 0
            if i == 0:
                shd = OxmlElement("w:shd")
                shd.set(qn("w:fill"), IVORY)
                cell._tc.get_or_add_tcPr().append(shd)
        if i == 0:
            repeat = OxmlElement("w:tblHeader")
            row._tr.get_or_add_trPr().append(repeat)
    return tbl


def setup(doc):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Inches(8.5), Inches(11)
    sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Inches(1)
    sec.header_distance = sec.footer_distance = Inches(0.492)
    style(doc, "Normal")
    style(doc, "Title", DISPLAY, 36, before=0, after=10, line=0.96)
    style(doc, "Subtitle", BODY, 13, MUTED, after=8)
    style(doc, "Heading 1", DISPLAY, 16, ORANGE, before=16, after=8)
    style(doc, "Heading 2", DISPLAY, 13, ORANGE, before=12, after=6)
    style(doc, "Heading 3", DISPLAY, 12, INK, before=8, after=4)
    for name in ("Heading 1", "Heading 2", "Heading 3"):
        doc.styles[name].paragraph_format.keep_with_next = True
    page_heading = style(doc, "Page Heading", DISPLAY, 26, before=0, after=9, line=1.0)
    page_heading.base_style = doc.styles["Heading 1"]
    page_heading.paragraph_format.keep_with_next = True
    outline = OxmlElement("w:outlineLvl")
    outline.set(qn("w:val"), "0")
    page_heading.element.get_or_add_pPr().append(outline)
    style(doc, "Kicker", MONO, 8.3, ORANGE, after=8).paragraph_format.keep_with_next = True
    style(doc, "Lead", BODY, 11, MUTED, after=12)
    style(doc, "Figure", BODY, 1, after=0, line=1.0).paragraph_format.keep_with_next = True
    style(doc, "Caption", BODY, 9, MUTED, before=5, after=10, line=1.12)
    style(doc, "Table Text", BODY, 10, after=0, line=1.1)
    style(doc, "Table Note", BODY, 9, MUTED, before=4, after=4, line=1.12)
    style(doc, "Small", BODY, 9, MUTED, after=5, line=1.12)
    style(doc, "Metric", DISPLAY, 20, ORANGE, after=5)
    style(doc, "Link", BODY, 10, after=6, line=1.15)
    style(doc, "Page Break", BODY, 1, after=0, line=1.0)
    style(doc, "Header", MONO, 7.5, MUTED, after=0)
    style(doc, "Footer", MONO, 7, MUTED, after=0)
    doc.styles["Header"].paragraph_format.tab_stops.clear_all()
    doc.styles["Footer"].paragraph_format.tab_stops.clear_all()
    hp = sec.header.paragraphs[0]
    hp.style = doc.styles["Header"]
    hp.paragraph_format.tab_stops.clear_all()
    hp.paragraph_format.tab_stops.add_tab_stop(Inches(WIDTH), WD_TAB_ALIGNMENT.RIGHT)
    hp.add_run("TEMT / ENTERPRISE PREVIEW\tPRODUCT CASE STUDY")
    fp = sec.footer.paragraphs[0]
    fp.style = doc.styles["Footer"]
    fp.paragraph_format.tab_stops.clear_all()
    fp.paragraph_format.tab_stops.add_tab_stop(Inches(WIDTH), WD_TAB_ALIGNMENT.RIGHT)
    fp.add_run("DESIGN + ENGINEERING / SEPTEMBER 2026\t")
    field(fp, "PAGE")
    fp.add_run(" / 5")
    doc.core_properties.title = "TEMT: freight decisions backed by carbon data"
    doc.core_properties.subject = "Five-page enterprise product preview case study"
    doc.core_properties.author = "TEMT project"
    doc.core_properties.keywords = "TEMT, freight emissions, NIFTY 500, product design, full-stack"


def build(e):
    doc = Document()
    setup(doc)
    site = e["site_url"].rstrip("/")
    image = {k: ROOT / v for k, v in e["screenshots"].items()}

    # 1: Outcome and visual evidence.
    body(doc, "AUTHORIZED PRODUCT PREVIEW / " + e["date"].upper(), "Kicker")
    doc.add_paragraph("FREIGHT DECISIONS.\nBACKED BY CARBON DATA.", style="Title")
    body(doc, "A cinematic product experience for India's sustainability and supply-chain teams.", "Subtitle")
    screenshot_pair(doc, [
        (image["hero"], 4.76, "The revised desktop TEMT hero with an illustrative freight network, four story chapters and a working estimator."),
        (image["mobile"], 1.30, "The revised mobile hero prioritizes the estimated result and usable controls before the freight story."),
    ], max_height=3.35)
    caption(doc, 1, "Production-build desktop and mobile captures. The opening connects a freight story to a working decision; the narrow layout gives the estimator priority.")
    body(doc, "4 story chapters  /  4 transport modes  /  501 company records", "Metric")
    body(doc, "I built a cinematic landing page around a working shipment-analysis product. The visual revision brings calculation, comparison and evidence into the opening while preserving the company directory, analysis workspace, API and reporting workflow.")
    body(doc, "Company names come from the official NIFTY 500 snapshot. Scenario activity is synthetic; company selection does not imply a customer relationship or actual company emissions.", "Small")

    # 2: Conversion and interaction design.
    new_page(doc)
    heading(doc, 2, "TRY THE PRODUCT. KEEP THE CONTEXT.", "The landing offers a useful first decision, then opens the evidence behind it.")
    screenshot_pair(doc, [
        (image["reporting"], 3.04, "Interactive landing analytics calculated from the synthetic FMCG sample, with mode and month views."),
        (image["demo"], 3.04, "The enterprise workspace shows shipment totals, analytics and an editable ledger."),
    ], max_height=2.45)
    caption(doc, 2, "Production-build landing analytics and the existing public workspace expose the same synthetic FMCG sample at different levels of detail.")
    label_para(doc, "Follow the story.", "Connect, Measure, Compare and Report chapters link inputs to a baseline, an alternative and reporting evidence. Pause and manual chapter selection keep the pace in the visitor's hands.")
    label_para(doc, "Carry the decision forward.", "Freight weight, distance and rail share recalculate immediately. The primary CTA carries all three through the URL into an editable monthly road baseline and its mode-shift comparison.")
    label_para(doc, "Inspect the detail.", "Sector examples show calculated shipment legs and mode contributions. The landing report switches between modes and months, with exact chart data available before opening the full workspace.")
    body(doc, "Motion pauses when the hero leaves view or the tab is hidden. Reduced-motion and supported data-saving preferences use manual playback. Native inputs, keyboard tabs and visible focus support access.", "Small")

    # 3: Real calculations and traceable output.
    new_page(doc)
    heading(doc, 3, "FROM SHIPMENT ROWS TO EVIDENCE.", "The demonstration does real calculation work, with explicit validation and a reporting trail.")
    screenshot(doc, image["pipeline"], max_height=3.5, alt="TEMT shipment processing interface showing inputs, validation, calculation progress and outputs.")
    caption(doc, 3, "Production-build pipeline, with the valid sample completed. The missing-load control lets the visitor inspect how an exception changes the total.")
    label_para(doc, "Validate.", "Toggle a missing load, then run the three-row sample. The complete two-leg shipment is excluded until corrected. The calculation trail shows accepted rows and validation exceptions.")
    label_para(doc, "Calculate.", "Each accepted leg uses tonnes × kilometres × a published WTW factor. The full browser and API engines share unrounded TypeScript calculations; accepted legs aggregate by mode, month and subsidiary.")
    label_para(doc, "Export.", "Filtered results become CSV, a PDF report and a Power BI import pack. The files preserve factor context and active filters. The pack is an import workflow, not a live Power BI connection.")
    body(doc, "Methodology boundary: GLEC v3.2 defaults support scenario estimates. This separate demo engine is not the certified TEMT product, a carrier measurement system or a complete corporate inventory.", "Small")

    # 4: Implementation and observed verification.
    new_page(doc)
    heading(doc, 4, "BUILT TO BE INSPECTED.", "A small, transparent architecture keeps the landing immediate and makes the server-side work demonstrable.")
    label_para(doc, "01 / Static frontend.", "Next.js, React and Tailwind export to Render's CDN. Local image and font assets, CSS animation, SVG scenes, Recharts and Lucide shape the experience.")
    label_para(doc, "02 / Stateless API.", "Express processes requested analyses in memory, with request limits, validation and CORS. It does not persist shipments or log request bodies.")
    label_para(doc, "03 / Shared calculator.", "One versioned package serves the browser and API. If the free backend is waking, local processing remains available and its origin is shown.")
    rows = [["Verification", "Observed result"],
            ["Automated tests", f"{e['tests_passed']} passed"],
            ["TypeScript and source integrity", "Passed"],
            ["Production frontend and API builds", "Passed"],
            ["Live server analysis", e["live_analysis_summary"]]]
    for m in e["measurements"]:
        rows.append([m["label"], m["value"]])
    table(doc, rows, [4752, 4608])
    body(doc, "Results describe the tested build and conditions. They are not an uptime SLA, a latency guarantee or evidence of customer emissions reductions.", "Table Note")
    for note in e["validation_notes"][:2]:
        body(doc, note, "Small")
    body(doc, "Release engineering: locked dependencies, a retained NSE source snapshot, pinned CI actions and separate Render services keep the implementation reproducible.", "Normal")
    p = doc.add_paragraph(style="Small")
    link(p, "View the successful CI run for the validated release", e["ci_url"])

    # 5: Delivery and product decisions.
    new_page(doc)
    heading(doc, 5, "A PRODUCT CONVERSATION, READY TO OPEN.", "The handoff includes the live experience, editable source and concrete examples of the reporting workflow.")
    items = [
        ("Live product: " + site.removeprefix("https://"), site),
        ("Explore the working scenario", site + "/demo/"),
        ("Download the sample PDF report", urljoin(site + "/", e["sample_pdf_path"])),
        ("Download the Power BI import pack", urljoin(site + "/", e["power_bi_path"])),
        ("Download the sample shipment CSV", urljoin(site + "/", e["sample_csv_path"])),
        ("Review the source repository", e["repository_url"]),
    ]
    for label, url in items:
        p = doc.add_paragraph(style="Link")
        link(p, label, url)
    body(doc, "THE DECISIONS THAT MATTER", "Kicker")
    label_para(doc, "Personalization with clear boundaries.", "Real company names make the demonstration relevant. Synthetic labels prevent example activity from looking like confidential company data.")
    label_para(doc, "A traceable commercial story.", "Institutional references open the original evidence. Product verification is scoped to its published version, while demonstration factors and assumptions remain inspectable.")
    label_para(doc, "An expressive, useful opening.", "Four chapters make the freight story visible. The estimator stays usable while the scene plays, and its inputs continue into the workspace. The static landing loads independently of the API.")
    body(doc, "SELECTED REFERENCES", "Kicker")
    refs = [
        ("IIMB: DPIIT adoption and ULIP", "https://www.iimb.ac.in/node/14281"),
        ("TEMT v1.3: SGS validation statement", "https://dpiit.freightemissions.com/certification.pdf"),
        ("Smart Freight Centre: GLEC v3.2", "https://smartfreightcentre.org/news/13311209"),
        ("NSE: constituent snapshot", "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv"),
    ]
    for label, url in refs:
        p = doc.add_paragraph(style="Small")
        link(p, label, url)
    body(doc, "Sources and design rationale: docs/SOURCES.md and docs/ux-research.md. Photography: CHUTTERSNAP / Unsplash. Fonts: Barlow Condensed, Manrope and IBM Plex Mono under their included licenses.", "Small")
    body(doc, "Validated release " + e["commit"] + " / " + e["date"], "Small")
    return doc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, default=ROOT / "docs/case-study-evidence.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/deliverables/TEMT-Product-Case-Study.docx")
    args = parser.parse_args()
    e = json.loads(args.evidence.read_text())
    if e.get("status") != "ready":
        raise SystemExit("Case-study revision is awaiting final screenshots and release evidence.")
    for key in ("commit", "ci_url", "site_url", "api_url", "typecheck_passed", "source_check_passed", "production_build_passed", "live_api_verified", "live_analysis_summary", "measurements"):
        if not e.get(key):
            raise SystemExit(f"Final evidence required: {key}")
    if not isinstance(e.get("tests_passed"), int) or e["tests_passed"] < 1:
        raise SystemExit("Final passing test count required.")
    if set(e["screenshots"]) != {"hero", "mobile", "reporting", "demo", "pipeline"}:
        raise SystemExit("Five final capture roles required: hero, mobile, reporting, demo and pipeline.")
    for name, path in e["screenshots"].items():
        if not path or not (ROOT / path).is_file():
            raise SystemExit(f"Final screenshot required: {name}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    doc = build(e)
    doc.save(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
