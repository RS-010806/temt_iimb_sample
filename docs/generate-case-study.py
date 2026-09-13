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


def screenshot(doc, path, width=WIDTH, max_height=None, alt=""):
    p = doc.add_paragraph(style="Figure")
    with Image.open(path) as img:
        ratio = img.height / img.width
    if max_height and width * ratio > max_height:
        width = max_height / ratio
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(str(path), width=Inches(width))
    shape._inline.docPr.set("descr", alt)
    return p


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
    body(doc, "A working enterprise experience for India's sustainability and supply-chain teams.", "Subtitle")
    screenshot(doc, image["hero"], max_height=3.4, alt="The finished TEMT landing page with freight imagery, enterprise proposition, primary CTA and interactive road-to-rail estimate.")
    caption(doc, 1, "The opening connects a clear product proposition to an immediate, adjustable freight scenario.")
    body(doc, "4 transport modes  /  501 company records  /  1 shared engine", "Metric")
    body(doc, "I designed and built a responsive landing page, a shipment-analysis workspace and a real API. The journey moves from a quick carbon estimate to editable shipment data, traceable calculations and useful reporting files.")
    body(doc, "Company names come from the official NIFTY 500 snapshot. Scenario activity is synthetic; company selection does not imply a customer relationship or actual company emissions.", "Small")

    # 2: Conversion and interaction design.
    new_page(doc)
    heading(doc, 2, "MAKE THE FIRST TEN SECONDS USEFUL.", "The opening is designed to create a meaningful action before asking a visitor for a sales conversation.")
    p = doc.add_paragraph(style="Figure")
    for key, width in (("demo", 4.50), ("mobile", 1.30)):
        pic = p.add_run().add_picture(str(image[key]), width=Inches(width))
        pic._inline.docPr.set("descr", "Desktop analytics workspace" if key == "demo" else "Responsive TEMT page on a mobile viewport")
        if key == "demo":
            p.add_run("  ")
    caption(doc, 2, "Desktop workspace and mobile layout. The same product journey adapts to available space, with readable inputs and direct actions.")
    label_para(doc, "Recognize the problem.", "Condensed headlines, freight photography and an orange action color create hierarchy. The primary CTA opens a working scenario; the secondary CTA explains the platform.")
    label_para(doc, "Try a decision.", "The road-to-rail slider recalculates immediately. Four mode tabs expose their assumptions, and sector presets give enterprise teams a relevant starting point.")
    label_para(doc, "Stay in context.", "Search real company names or choose an industry. Edit shipment legs and compare the resulting analytics without losing the scenario context.")
    body(doc, "Design decision: motion signals interaction and progress. Reduced-motion preferences, keyboard operation and clear focus states support practical access.", "Small")

    # 3: Real calculations and traceable output.
    new_page(doc)
    heading(doc, 3, "FROM SHIPMENT ROWS TO EVIDENCE.", "The demonstration does real calculation work, with explicit validation and a reporting trail.")
    screenshot(doc, image["pipeline"], max_height=3.5, alt="TEMT shipment processing interface showing inputs, validation, calculation progress and outputs.")
    caption(doc, 3, "The working pipeline makes inputs, processing and outcomes inspectable. Invalid shipment data is surfaced before it enters totals.")
    label_para(doc, "Validate.", "CSV import and an editable ledger support multi-leg shipments. Invalid, duplicate or missing legs exclude the identifiable shipment until corrected; exceptions remain visible.")
    label_para(doc, "Calculate.", "Each accepted leg uses tonnes × kilometres × a published WTW factor. Browser and API share the same unrounded TypeScript calculation, then aggregate by mode, month and subsidiary.")
    label_para(doc, "Export.", "Filtered results become CSV, a PDF report and a Power BI import pack. The files preserve factor context and active filters. The pack is an import workflow, not a live Power BI connection.")
    body(doc, "Methodology boundary: GLEC v3.2 defaults support scenario estimates. This separate demo engine is not the certified TEMT product, a carrier measurement system or a complete corporate inventory.", "Small")

    # 4: Implementation and observed verification.
    new_page(doc)
    heading(doc, 4, "BUILT TO BE INSPECTED.", "A small, transparent architecture keeps the landing immediate and makes the server-side work demonstrable.")
    label_para(doc, "01 / Static frontend.", "Next.js, React and Tailwind export to Render's CDN. Locally hosted assets, Motion, Recharts and Lucide shape the responsive experience.")
    label_para(doc, "02 / Stateless API.", "Express processes requested analyses in memory, with request limits, validation and CORS. It does not persist shipments or log request bodies.")
    label_para(doc, "03 / Shared calculator.", "One versioned package serves the browser and API. If the free backend is waking, local processing remains available and its origin is shown.")
    rows = [["Verification", "Observed result"],
            ["Automated tests", f"{e['tests_passed']} passed"],
            ["TypeScript and source integrity", "Passed"],
            ["Production frontend and API builds", "Passed"],
            ["Live server analysis", "32-leg parity; 4.925 ms engine"]]
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
    label_para(doc, "Fast first interaction.", "A CDN serves the landing page independently of the API. The stateless server demonstrates backend processing; enterprise connectors and persistent workflows remain future integrations.")
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
    body(doc, "Full source register: docs/SOURCES.md in the repository. Photography: CHUTTERSNAP / Unsplash. Fonts: Barlow Condensed, Manrope and IBM Plex Mono under their included licenses.", "Small")
    body(doc, "Validated release " + e["commit"] + " / " + e["date"], "Small")
    return doc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, default=ROOT / "docs/case-study-evidence.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/deliverables/TEMT-Product-Case-Study.docx")
    args = parser.parse_args()
    e = json.loads(args.evidence.read_text())
    for key in ("site_url", "api_url", "production_build_passed", "live_api_verified"):
        if not e.get(key):
            raise SystemExit(f"Final evidence required: {key}")
    for name, path in e["screenshots"].items():
        if not path or not (ROOT / path).is_file():
            raise SystemExit(f"Final screenshot required: {name}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    doc = build(e)
    doc.save(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
