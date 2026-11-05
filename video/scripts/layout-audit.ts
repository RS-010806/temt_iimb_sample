/**
 * Layout audit: opens every page (and the main states of the calculator, chain, import and ledger) at five widths
 * and reports overlapping text, horizontal overflow, clipped text, truncated drop-downs and side-by-side fields
 * whose boxes do not line up. Screenshots of every view go to out/layout.
 *
 *   BASE=http://localhost:3300 npx tsx scripts/layout-audit.ts [width,...]
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { FIXTURES, writeFixtures } from "./fixtures";

const BASE = process.env.BASE ?? "http://localhost:3300";
const OUT = join(import.meta.dirname, "../out/layout");
const WIDTHS = (process.argv[2] ?? "1440,1280,1024,768,390").split(",").map(Number);

interface Finding { view: string; width: number; kind: string; detail: string }
const findings: Finding[] = [];

/** Runs in the page: returns layout problems as short strings. */
function inspect() {
  const out: { kind: string; detail: string }[] = [];
  const visible = (el: Element) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const pinned = (el: Element) => { for (let node: Element | null = el; node; node = node.parentElement) { const position = getComputedStyle(node).position; if (position === "fixed" || position === "sticky") return true; } return false; };
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} “${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}”`;

  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ kind: "page-overflow", detail: `page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px window` });

  // Text boxes: each text node's rectangles, cut to what its clipping ancestors actually show.
  const clipOf = (el: Element) => {
    let box = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX + style.overflowY)) {
        const r = node.getBoundingClientRect();
        box = { left: Math.max(box.left, r.left), top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom) };
      }
    }
    return box;
  };
  const clipped = (rect: DOMRect, el: Element) => {
    const box = clipOf(el);
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right), top = Math.max(rect.top, box.top), bottom = Math.min(rect.bottom, box.bottom);
    return right - left > 2 && bottom - top > 2 ? new DOMRect(left, top, right - left, bottom - top) : undefined;
  };
  const boxes: { el: Element; rect: DOMRect }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || !node.parentElement || !visible(node.parentElement) || pinned(node.parentElement)) continue;
    if (node.parentElement.closest("svg, [aria-hidden='true'], option, script, style, [role='tooltip'], [data-audit-ignore]")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const raw of range.getClientRects()) { const rect = raw.width > 2 && raw.height > 2 ? clipped(raw, node.parentElement) : undefined; if (rect) boxes.push({ el: node.parentElement, rect }); }
  }
  const seen = new Set<string>();
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const a = boxes[i]!, b = boxes[j]!;
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left), h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
    if (w <= 1 || h <= 1) continue;
    const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
    if ((w * h) / smaller < 0.2) continue;
    const key = `${name(a.el)}|${name(b.el)}`;
    if (!seen.has(key)) { seen.add(key); out.push({ kind: "text-overlap", detail: `${name(a.el)} overlaps ${name(b.el)}` }); }
  }

  // Elements running past the right edge of the window (outside any horizontal scroller).
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || pinned(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.right <= innerWidth + 1 || rect.width > innerWidth * 3) continue;
    let scroller = false;
    for (let node = el.parentElement; node; node = node.parentElement) { const style = getComputedStyle(node); if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && node !== document.body && node !== document.documentElement) { scroller = true; break; } }
    if (!scroller && !el.closest("[aria-hidden='true']")) out.push({ kind: "past-right-edge", detail: `${name(el)} ends at ${Math.round(rect.right)}px` });
  }

  // Text cut off inside buttons, labels, badges and headings (tables and deliberate ellipses excluded).
  for (const el of document.querySelectorAll("button, label, .label, .badge, h1, h2, h3, p, dt, dd, a")) {
    if (!visible(el) || el.closest("table, [data-audit-ignore]")) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow === "ellipsis" || /line-clamp/.test(el.className.toString())) continue;
    if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(style.overflowX)) out.push({ kind: "clipped-text", detail: `${name(el)} is cut off (${el.scrollWidth}px of text in ${el.clientWidth}px)` });
  }

  // Drop-downs too narrow for the chosen option.
  const canvas = document.createElement("canvas").getContext("2d")!;
  for (const select of document.querySelectorAll("select")) {
    if (!visible(select)) continue;
    const style = getComputedStyle(select);
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = select.selectedOptions[0]?.textContent ?? "";
    const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (canvas.measureText(text).width > room + 1) out.push({ kind: "select-truncated", detail: `select “${text.slice(0, 50)}” needs ${Math.round(canvas.measureText(text).width)}px, has ${Math.round(room)}px` });
  }

  // Side-by-side fields: their input boxes should share a top edge.
  const controlOf = (field: Element) => field.querySelector("input:not(.sr-only):not([type='checkbox']), select, textarea, .segmented, [role='combobox']") as HTMLElement | null;
  for (const parent of new Set([...document.querySelectorAll(".field")].map((field) => field.parentElement))) {
    if (!parent) continue;
    const fields = [...parent.children].filter((child) => child.classList.contains("field") && visible(child));
    const rows = new Map<number, { field: Element; top: number }[]>();
    for (const field of fields) {
      const control = controlOf(field);
      if (!control || !visible(control)) continue;
      const fieldTop = Math.round(field.getBoundingClientRect().top / 6) * 6;
      rows.set(fieldTop, [...(rows.get(fieldTop) ?? []), { field, top: control.getBoundingClientRect().top }]);
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const tops = row.map((item) => item.top);
      if (Math.max(...tops) - Math.min(...tops) > 3) out.push({ kind: "fields-misaligned", detail: `${row.map((item) => `“${item.field.querySelector(".label")?.textContent?.trim() ?? "?"}” at ${Math.round(item.top)}`).join(", ")}` });
    }
  }
  return out;
}

async function audit(page: Page, view: string, width: number) {
  await page.waitForTimeout(450);
  for (const item of await page.evaluate(inspect)) findings.push({ view, width, ...item });
  await page.screenshot({ path: join(OUT, `${width}-${view.replace(/[^a-z0-9]+/gi, "-")}.png`), fullPage: true });
}

async function choose(page: Page, label: string, text: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(text);
  await page.locator('[role="listbox"] [role="option"]').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(250);
  await input.press("Enter");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await writeFixtures();
  const browser = await chromium.launch({ channel: "chrome" });
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    // tsx keeps function names with a __name helper that does not exist inside the page.
    await context.addInitScript({ content: "window.__name = (fn) => fn;" });
    const page = await context.newPage();
    const step = async (view: string, run: () => Promise<void>) => { try { await run(); await audit(page, view, width); } catch (error) { findings.push({ view, width, kind: "audit-failed", detail: String(error).split("\n")[0]!.slice(0, 200) }); } };
    for (const path of ["/", "/methodology/", "/why-temt/", "/privacy/", "/tour/", "/signin/"]) await step(`page${path}`, async () => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); });
    await page.goto(`${BASE}/app/`, { waitUntil: "networkidle" });
    await page.getByRole("dialog", { name: "Welcome to TEMT" }).getByRole("button", { name: "FMCG" }).click();
    await step("dashboard", async () => { await page.getByText("Total emissions, well-to-wheel").waitFor(); await page.waitForTimeout(800); });
    await step("calculator-empty", async () => { await page.goto(`${BASE}/app/calculate/`, { waitUntil: "networkidle" }); });
    await step("calculator-road", async () => { await choose(page, "From", "Pune"); await choose(page, "To", "Nashik"); await page.locator("#tonnes").fill("12"); await page.getByText("Well-to-wheel emissions").waitFor(); });
    await step("calculator-more-details", async () => { await page.getByRole("button", { name: /More details/ }).click(); });
    for (const [mode, from, to] of [["Rail", "NDLS", "Howrah"], ["Air", "DEL", "BLR"], ["Sea", "Nhava Sheva", "Rotterdam"], ["Inland waterway", "Haldia", "Patna"], ["Courier / PTL", "Gurugram", "Lucknow"]] as const) {
      await step(`calculator-${mode}`, async () => { await page.getByRole("radio", { name: mode, exact: true }).click(); await choose(page, mode === "Courier / PTL" ? "From" : `From ${mode === "Rail" ? "station" : mode === "Air" ? "airport" : mode === "Sea" ? "port" : "terminal"}`, from); await choose(page, mode === "Courier / PTL" ? "To" : `To ${mode === "Rail" ? "station" : mode === "Air" ? "airport" : mode === "Sea" ? "port" : "terminal"}`, to); await page.waitForTimeout(800); });
    }
    await step("calculator-fuel", async () => { await page.getByRole("radio", { name: "Road", exact: true }).click(); await page.getByRole("radio", { name: /Fuel-based/ }).click(); await page.locator("#fuel-quantity").fill("58"); });
    await step("chain-blank", async () => { await page.goto(`${BASE}/app/chain/`, { waitUntil: "networkidle" }); });
    await step("chain-rail", async () => { await choose(page, "Origin", "Hosur"); await choose(page, "Destination", "Guwahati"); await page.getByRole("radio", { name: /Rail intermodal/ }).click(); await page.getByText("Shortest route on the Indian Railways network, station to station").first().waitFor({ timeout: 15000 }); await page.locator("#chain-reference").scrollIntoViewIfNeeded(); });
    await step("compare", async () => { await page.goto(`${BASE}/app/compare/?from=Chennai&to=Delhi&t=25`, { waitUntil: "networkidle" }); await page.getByText("Lowest emission").first().waitFor({ timeout: 20000 }); });
    await step("import", async () => { await page.goto(`${BASE}/app/import/`, { waitUntil: "networkidle" }); });
    await step("import-read", async () => { await page.getByLabel("Choose a file to import").setInputFiles(join(FIXTURES, "temt-template.csv")); await page.getByText(/read from temt-template\.csv/).waitFor({ timeout: 30000 }); });
    await step("shipments", async () => { await page.goto(`${BASE}/app/shipments/`, { waitUntil: "networkidle" }); });
    await step("shipment-drawer", async () => { await page.locator("tbody tr").first().click(); await page.getByText("Factor source").first().waitFor(); });
    await step("reports", async () => { await page.goto(`${BASE}/app/reports/`, { waitUntil: "networkidle" }); await page.waitForTimeout(800); });
    await step("planner", async () => { await page.goto(`${BASE}/app/planner/`, { waitUntil: "networkidle" }); });
    await step("factors", async () => { await page.goto(`${BASE}/app/factors/`, { waitUntil: "networkidle" }); });
    for (const tab of ["Rail and air", "Sea", "Waterways and hubs", "Fuels and electricity", "Sources"]) await step(`factors-${tab}`, async () => { await page.getByRole("button", { name: tab, exact: true }).click(); });
    await step("settings", async () => { await page.goto(`${BASE}/app/settings/`, { waitUntil: "networkidle" }); });
    await step("help", async () => { await page.goto(`${BASE}/app/help/`, { waitUntil: "networkidle" }); });
    await context.close();
  }
  await browser.close();
  const byKind = new Map<string, Finding[]>();
  for (const finding of findings) byKind.set(finding.kind, [...(byKind.get(finding.kind) ?? []), finding]);
  for (const [kind, list] of byKind) {
    console.log(`\n${kind}: ${list.length}`);
    const unique = new Map<string, string[]>();
    for (const item of list) { const key = `${item.view} · ${item.detail}`; unique.set(key, [...(unique.get(key) ?? []), String(item.width)]); }
    for (const [key, widths] of unique) console.log(`  [${widths.join(",")}] ${key}`);
  }
  console.log(`\n${findings.length} findings; screenshots in ${OUT}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
