/**
 * Builds a desktop-style "Downloads" viewer for the files TEMT exported during the demo capture:
 * PDF and Word pages rendered to images, Excel sheets as a spreadsheet grid, the Power BI pack's
 * contents, and the CSV and JSON. Everything shown is read from the downloaded files themselves.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const require = createRequire(join(import.meta.dirname, "../../package.json"));
const ExcelJS = require("exceljs") as typeof import("exceljs");
const JSZip = require("jszip") as typeof import("jszip");

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const size = (file: string) => { const kb = statSync(file).size / 1024; return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`; };

function pages(pdf: string, dir: string, prefix: string) {
  execFileSync("pdftoppm", ["-r", "112", "-png", pdf, join(dir, prefix)]);
  return readdirSync(dir).filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".png")).sort((a, b) => Number(a.match(/-(\d+)\.png$/)![1]) - Number(b.match(/-(\d+)\.png$/)![1]));
}

/** Display a number the way Excel would with the cell's number format (decimals, thousands separators, %). */
function formatted(value: unknown, numFmt?: string) {
  if (typeof value !== "number") return value && typeof value === "object" && "result" in value ? String((value as { result: unknown }).result ?? "") : String(value ?? "");
  const fmt = numFmt ?? "General";
  const decimals = (fmt.split(".")[1]?.match(/0/g) ?? []).length;
  const n = fmt.includes("%") ? value * 100 : value;
  const text = fmt === "General" ? String(Math.round(value * 1000) / 1000) : n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: fmt.includes(",") });
  return fmt.includes("%") ? `${text}%` : text;
}

const colour = (argb?: string) => (argb && argb.length === 8 ? `#${argb.slice(2)}` : undefined);
const letters = (n: number) => { let s = ""; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

async function sheets(xlsx: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsx);
  return workbook.worksheets.map((ws) => {
    const cols = Math.min(ws.columnCount, 12);
    const widths = Array.from({ length: cols }, (_, i) => Math.round(Math.min(40, Math.max(8, ws.getColumn(i + 1).width ?? 11)) * 7));
    // Horizontal merges become colspans, as Excel shows them.
    const spans = new Map<string, number>();
    for (const range of (ws.model as { merges?: string[] }).merges ?? []) {
      const [from, to] = range.split(":");
      const a = ws.getCell(from!), b = ws.getCell(to!);
      if (Number(a.row) === Number(b.row)) spans.set(a.address, Math.min(cols, Number(b.col)) - Number(a.col) + 1);
    }
    const rows: string[] = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 34); r += 1) {
      const row = ws.getRow(r);
      const cells = Array.from({ length: cols }, (_, c) => {
        const cell = row.getCell(c + 1);
        if (cell.isMerged && cell.master.address !== cell.address) return spans.has(cell.master.address) ? "" : "<td></td>";
        const fill = cell.fill && cell.fill.type === "pattern" ? colour((cell.fill as { fgColor?: { argb?: string } }).fgColor?.argb) : undefined;
        const font = cell.font ?? {};
        const numeric = typeof cell.value === "number";
        const style = [fill ? `background:${fill}` : "", font.bold ? "font-weight:700" : "", colour(font.color?.argb) ? `color:${colour(font.color?.argb)}` : "", numeric ? "text-align:right" : "", font.size && font.size > 12 ? `font-size:${Math.min(18, font.size)}px` : ""].filter(Boolean).join(";");
        const span = spans.get(cell.address);
        return `<td${span && span > 1 ? ` colspan="${span}"` : ""} style="${style}">${esc(formatted(cell.value, cell.numFmt))}</td>`;
      });
      rows.push(`<tr><th>${r}</th>${cells.join("")}</tr>`);
    }
    const total = 44 + widths.reduce((sum, w) => sum + w, 0);
    return { name: ws.name, html: `<table class="grid" style="width:${total}px"><colgroup><col style="width:44px">${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr><th></th>${widths.map((_, i) => `<th>${letters(i + 1)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` };
  });
}

function highlightJson(text: string) {
  return esc(text).replace(/(&quot;|")([^"\n]*?)("\s*:)/g, '<span class="k">"$2"</span>:').replace(/:\s(-?\d[\d.e+-]*)/g, ': <span class="n">$1</span>').replace(/:\s("[^"\n]*")/g, ': <span class="s">$1</span>');
}

export async function buildViewer(downloads: string, outDir: string) {
  mkdirSync(join(outDir, "img"), { recursive: true });
  const files = readdirSync(downloads).map((name) => join(downloads, name));
  const find = (pattern: RegExp) => { const file = files.find((item) => pattern.test(basename(item))); if (!file) throw new Error(`Missing export ${pattern}`); return file; };
  const pdf = find(/\.pdf$/), xlsx = find(/\.xlsx$/), docx = find(/\.docx$/), zip = find(/power-bi\.zip$/), csv = find(/\.csv$/), json = find(/^TEMT-.*\.json$/);

  const pdfPages = pages(pdf, join(outDir, "img"), "pdf");
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, docx], { stdio: "ignore" });
  const docxPages = pages(join(outDir, basename(docx).replace(/\.docx$/, ".pdf")), join(outDir, "img"), "docx");
  const workbook = await sheets(xlsx);
  const pack = await JSZip.loadAsync(readFileSync(zip));
  const packFiles = Object.values(pack.files).filter((entry) => !entry.dir);
  const measures = await pack.file("measures.dax")!.async("string");
  const theme = JSON.parse(await pack.file("report-theme.json")!.async("string")) as { dataColors?: string[]; name?: string };
  const csvLines = readFileSync(csv, "utf8").split(/\r?\n/).slice(0, 26);
  const jsonText = JSON.stringify(JSON.parse(readFileSync(json, "utf8")), null, 2).split("\n").slice(0, 70).join("\n");

  const items = [
    { id: "pdf", file: pdf, kind: "PDF report", icon: "PDF", tone: "#b12322" },
    { id: "xlsx", file: xlsx, kind: "Excel workbook", icon: "XLS", tone: "#1d7a46" },
    { id: "docx", file: docx, kind: "Word document", icon: "DOC", tone: "#2a5bb5" },
    { id: "powerbi", file: zip, kind: "Power BI pack", icon: "BI", tone: "#c28a06" },
    { id: "csv", file: csv, kind: "CSV, one row per leg", icon: "CSV", tone: "#4b5563" },
    { id: "json", file: json, kind: "JSON report", icon: "{ }", tone: "#6b3fa0" },
  ];
  const csvCells = csvLines.map((line, i) => `<tr class="${i === 0 ? "head" : ""}"><td class="ln">${i + 1}</td><td>${esc(line.length > 190 ? `${line.slice(0, 190)}…` : line)}</td></tr>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Downloads</title><style>
@font-face{font-family:"Open Sans";src:url(/fonts/open-sans-latin.woff2) format("woff2")}
@font-face{font-family:"Plex";src:url(/fonts/ibm-plex-mono-400.woff2) format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{height:100%;overflow:hidden}
body{font-family:"Open Sans",system-ui,sans-serif;background:radial-gradient(120% 120% at 20% 0%,#7a1a18 0%,#3b0909 55%,#1c0303 100%);color:#1c1917}
.window{position:absolute;inset:28px 40px;background:#fff;border-radius:16px;overflow:hidden;display:grid;grid-template-rows:44px 1fr;box-shadow:0 40px 90px -30px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08);animation:open .5s cubic-bezier(.2,.8,.2,1)}
@keyframes open{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}
.bar{display:flex;align-items:center;gap:14px;padding:0 16px;background:#f5f3f1;border-bottom:1px solid #e7e2de}
.dots{display:flex;gap:8px}.dots i{width:12px;height:12px;border-radius:50%;display:block}.dots i:nth-child(1){background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840}
.bar .title{flex:1;text-align:center;font-size:13px;font-weight:600;color:#44403c;margin-right:60px}
.body{display:grid;grid-template-columns:290px 1fr;min-height:0}
aside{background:#faf8f6;border-right:1px solid #ece7e3;padding:18px 12px;overflow:hidden}
aside h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a1b1a;margin:0 8px 12px}
.file{display:flex;align-items:center;gap:11px;padding:10px;border-radius:11px;cursor:pointer;margin-bottom:4px;transition:background .2s}
.file:hover{background:#f1ece8}.file.active{background:#fff;box-shadow:0 1px 0 rgba(0,0,0,.04),0 6px 16px -10px rgba(80,10,10,.35);outline:1px solid #eadfdb}
.icon{width:38px;height:46px;border-radius:7px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:11px;flex:none;position:relative}
.icon:after{content:"";position:absolute;right:0;top:0;border-width:0 10px 10px 0;border-style:solid;border-color:transparent #fff transparent transparent;opacity:.5}
.file b{display:block;font-size:12.5px;line-height:1.3;color:#1c1917}.file span{font-size:11.5px;color:#78716c}
aside .note{margin:16px 8px 0;font-size:11.5px;line-height:1.5;color:#78716c}
main{position:relative;min-height:0;overflow:hidden}
.pane{position:absolute;inset:0;overflow:auto;opacity:0;pointer-events:none;transition:opacity .35s}
.pane.active{opacity:1;pointer-events:auto}
.pages{background:#e9e6e3;padding:28px 0 60px;display:grid;justify-items:center;gap:22px}
.pages img{width:660px;box-shadow:0 12px 30px -14px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.05);background:#fff}
.xl{display:grid;grid-template-rows:auto 1fr auto;height:100%}
.xl .ribbon{background:#1d7a46;color:#fff;padding:9px 16px;font-size:12.5px;font-weight:600;display:flex;gap:18px}
.xl .ribbon span{opacity:.75;font-weight:500}
.xl .sheet{overflow:hidden;position:relative}
.xl .sheet>div{position:absolute;inset:0;overflow:hidden;display:none}.xl .sheet>div.active{display:block}
.grid{border-collapse:collapse;table-layout:fixed;font-size:12px}
.grid td,.grid th{border:1px solid #e1e4e8;padding:3px 6px;height:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grid th{background:#f3f4f6;color:#6b7280;font-weight:500;text-align:center;font-size:11px}
.tabs{display:flex;gap:2px;background:#f3f4f6;border-top:1px solid #d9dde2;padding:0 10px;overflow:hidden}
.tabs button{border:0;background:transparent;font:inherit;font-size:12px;padding:8px 14px;color:#4b5563;border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}
.tabs button.active{background:#fff;color:#1d7a46;font-weight:700;border-bottom-color:#1d7a46}
.bi{padding:28px 34px;display:grid;grid-template-columns:1.05fr 1fr;gap:26px;background:#fbfaf8;height:100%}
.bi h3{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a1b1a;margin-bottom:12px}
.card{background:#fff;border:1px solid #ece7e3;border-radius:14px;padding:18px}
.schema{position:relative;height:300px}
.node{position:absolute;background:#fff;border:1.5px solid #d6cfc9;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;box-shadow:0 6px 14px -10px rgba(0,0,0,.4)}
.node.fact{border-color:#c28a06;background:#fff8e6}
.node small{display:block;font-weight:500;color:#78716c;font-size:10.5px}
pre{font-family:Plex,ui-monospace,monospace;font-size:11.5px;line-height:1.55;white-space:pre-wrap}
.list{display:grid;gap:6px;font-size:12.5px}.list div{display:flex;justify-content:space-between;border-bottom:1px dashed #eee;padding-bottom:5px}
.swatches{display:flex;gap:6px;margin-top:10px}.swatches i{width:26px;height:26px;border-radius:6px;display:block}
.code{background:#1e1b1a;color:#e7e5e4;height:100%;overflow:hidden;padding:22px 0}
.code table{border-collapse:collapse;font-family:Plex,ui-monospace,monospace;font-size:12px;line-height:1.7}
.code td{padding:0 16px;white-space:pre;vertical-align:top}.code td.ln{color:#78716c;text-align:right;user-select:none;width:44px}
.code tr.head td:last-child{color:#fbbf24}
.json{padding:22px 28px}.json .k{color:#93c5fd}.json .n{color:#fca5a5}.json .s{color:#bef264}
</style></head><body>
<div class="window"><div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="title" id="title"></div></div>
<div class="body"><aside><h2>Downloads · from TEMT</h2>
${items.map((item) => `<div class="file" data-id="${item.id}" id="f-${item.id}"><div class="icon" style="background:${item.tone}">${item.icon}</div><div><b>${esc(basename(item.file))}</b><span>${item.kind} · ${size(item.file)}</span></div></div>`).join("")}
<p class="note">Generated in the browser by TEMT, exactly as downloaded.</p></aside>
<main>
<section class="pane pages" id="p-pdf">${pdfPages.map((page) => `<img src="img/${page}" alt="">`).join("")}</section>
<section class="pane" id="p-xlsx"><div class="xl"><div class="ribbon">${esc(basename(xlsx))}<span>${workbook.length} sheets</span></div><div class="sheet">${workbook.map((sheet, i) => `<div data-sheet="${i}" class="${i === 0 ? "active" : ""}">${sheet.html}</div>`).join("")}</div><div class="tabs">${workbook.map((sheet, i) => `<button data-sheet="${i}" class="${i === 0 ? "active" : ""}">${esc(sheet.name)}</button>`).join("")}</div></div></section>
<section class="pane pages" id="p-docx">${docxPages.map((page) => `<img src="img/${page}" alt="">`).join("")}</section>
<section class="pane" id="p-powerbi"><div class="bi">
<div><h3>Star schema</h3><div class="card schema">
<div class="node fact" style="left:36%;top:40%">fact_legs<small>one row per transport leg</small></div>
<div class="node fact" style="left:38%;top:80%">fact_hubs<small>hub operations</small></div>
<div class="node" style="left:3%;top:8%">dim_shipments<small>route, unit, commodity</small></div>
<div class="node" style="left:66%;top:8%">dim_date<small>month, financial year</small></div>
<div class="node" style="left:2%;top:62%">dim_mode<small>mode colours</small></div>
<div class="node" style="left:68%;top:58%">dim_factors<small>factor, source</small></div>
<svg style="position:absolute;inset:0;width:100%;height:100%;z-index:-0" viewBox="0 0 100 100" preserveAspectRatio="none"><g stroke="#d6cfc9" stroke-width=".5" fill="none"><path d="M20 18 L45 44"/><path d="M78 18 L55 44"/><path d="M16 66 L40 50"/><path d="M80 64 L58 50"/><path d="M48 58 L48 80"/></g></svg>
</div><h3 style="margin-top:22px">Files in the pack</h3><div class="card list">${packFiles.map((entry) => `<div><span>${esc(entry.name)}</span><span style="color:#78716c">${esc(entry.name.split(".").pop()?.toUpperCase())}</span></div>`).join("")}</div></div>
<div><h3>DAX measures · measures.dax</h3><div class="card"><pre>${esc(measures.split("\n").slice(0, 16).join("\n"))}</pre></div>
<h3 style="margin-top:22px">Report theme</h3><div class="card"><b style="font-size:13px">${esc(theme.name ?? "TEMT")}</b><div class="swatches">${(theme.dataColors ?? []).slice(0, 8).map((c) => `<i style="background:${esc(c)}"></i>`).join("")}</div></div></div>
</div></section>
<section class="pane code" id="p-csv"><table>${csvCells}</table></section>
<section class="pane code json" id="p-json"><pre>${highlightJson(jsonText)}</pre></section>
</main></div></div>
<script>
const items=${JSON.stringify(items.map((item) => ({ id: item.id, name: basename(item.file) })))};
function show(id){document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("active",p.id==="p-"+id));document.querySelectorAll(".file").forEach(f=>f.classList.toggle("active",f.dataset.id===id));document.getElementById("title").textContent=items.find(i=>i.id===id).name;}
document.querySelectorAll(".file").forEach(f=>f.addEventListener("click",()=>show(f.dataset.id)));
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-sheet]").forEach(n=>n.classList.toggle("active",n.dataset.sheet===b.dataset.sheet));}));
show(location.hash.slice(1)||"pdf");
addEventListener("hashchange",()=>show(location.hash.slice(1)||"pdf"));
</script></body></html>`;
  writeFileSync(join(outDir, "viewer.html"), html);
  return { pdfPages: pdfPages.length, docxPages: docxPages.length, sheets: workbook.map((sheet) => sheet.name), pack: packFiles.length };
}

if (process.argv[2]) buildViewer(process.argv[2], process.argv[3]!).then((info) => console.log(info));
