/**
 * Records the product demonstration: drives the real production build in Chrome the way a person would
 * (visible cursor, typing, real clicks and downloads) and paces each chapter to its narration.
 * Frames come from the Chrome DevTools screencast; timings for captions and sound effects go to timeline.json.
 *
 *   npx tsx scripts/voice.ts && npx tsx scripts/capture.ts
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright-core";
import { FIXTURES, writeFixtures } from "./fixtures";
import { buildViewer } from "./viewer";
import type { VoiceChapter } from "./voice";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(import.meta.dirname, "../out/demo");
const FRAMES = join(OUT, "frames");
const DOWNLOADS = join(OUT, "downloads");
const VIEWER = join(OUT, "viewer");
const PORT = 3300;
const BASE = `http://localhost:${PORT}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TAIL = 0.45;
/** FAST=1 runs every step without waiting for narration: a quick check that all selectors work. */
const FAST = process.env.FAST === "1";

const voices = new Map((JSON.parse(readFileSync(join(OUT, "voice/voice.json"), "utf8")) as VoiceChapter[]).map((v) => [v.id, v]));
const events: { t: number; kind: "click" | "type" | "chime" | "chapter"; id?: string; ms?: number }[] = [];
const chapters: { id: string; start: number; end: number }[] = [];
const now = () => Date.now() / 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (text: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${text}`);

// ─── Cursor overlay (headless Chrome draws none) ──────────────────────────
// tsx keeps function names with a __name() helper, which also appears in code sent to page.evaluate.
const CURSOR = `globalThis.__name = globalThis.__name || ((fn) => fn);
(() => {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;
    const style = document.createElement("style");
    // The site smooth-scrolls anchors via CSS; the capture animates scrolling itself, frame by frame.
    style.textContent = "html{scroll-behavior:auto!important}#__demo_cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}" +
      ".__demo_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(177,35,34,.85);background:rgba(177,35,34,.18);animation:__demo_r .55s ease-out forwards}" +
      "@keyframes __demo_r{from{transform:scale(.35);opacity:1}to{transform:scale(1.35);opacity:0}}";
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__demo_cursor";
    cursor.innerHTML = '<svg width="24" height="28" viewBox="0 0 24 28"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24.2 L15 22.8 L11.7 15.2 L18.6 15.2 Z" fill="#161616" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    const place = (x, y) => { cursor.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)"; try { sessionStorage.setItem("__demo_xy", x + "," + y); } catch {} };
    const saved = (sessionStorage.getItem("__demo_xy") || "720,420").split(",").map(Number);
    place(saved[0], saved[1]);
    addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
    addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "__demo_ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  };
  if (document.documentElement) install(); else addEventListener("DOMContentLoaded", install);
  addEventListener("DOMContentLoaded", install);
})();`;

// ─── Human-like input ─────────────────────────────────────────────────────
let mouse = { x: 800, y: 460 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

async function moveTo(page: Page, x: number, y: number, ms = 600) {
  const from = { ...mouse };
  const distance = Math.hypot(x - from.x, y - from.y);
  const duration = Math.max(180, Math.min(ms, 250 + distance * 0.9));
  const steps = Math.max(6, Math.round(duration / 16));
  for (let i = 1; i <= steps; i += 1) {
    const e = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(duration / steps);
  }
  mouse = { x, y };
}

async function smoothScrollTo(page: Page, y: number, ms = 1100) {
  await page.evaluate(({ y, ms }) => new Promise<void>((resolve) => {
    const start = window.scrollY, delta = y - start, t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      window.scrollTo(0, start + delta * e);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), { y, ms });
}

/** Scroll smoothly so the element sits comfortably in view, in its own scroll panel if it has one, else the page. */
async function reveal(page: Page, locator: Locator) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.evaluate((node) => new Promise<void>((resolve) => {
    let scroller: Element | null = node.parentElement;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 4 && scroller.clientHeight < window.innerHeight - 20) break;
      scroller = scroller.parentElement;
    }
    const inner = scroller && scroller !== document.body ? scroller : null;
    const view = inner ? inner.getBoundingClientRect() : { top: 76, bottom: window.innerHeight - 30, height: window.innerHeight - 76 };
    const rect = node.getBoundingClientRect();
    if (rect.top >= view.top + 8 && rect.bottom <= view.bottom - 8) { resolve(); return; }
    const element = inner ?? document.scrollingElement!;
    const start = element.scrollTop;
    const target = Math.max(0, start + rect.top - view.top - Math.max(0, (view.bottom - view.top) * 0.3 - rect.height / 2));
    const t0 = performance.now(), ms = Math.min(1100, 420 + Math.abs(target - start) * 0.35);
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      element.scrollTop = start + (target - start) * (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
      if (p < 1) requestAnimationFrame(step); else setTimeout(resolve, 60);
    };
    requestAnimationFrame(step);
  }));
}

async function point(page: Page, locator: Locator, dx = 0.5, dy = 0.5) {
  await reveal(page, locator);
  const box = (await locator.boundingBox())!;
  await moveTo(page, box.x + box.width * dx, box.y + box.height * dy);
}

async function click(page: Page, locator: Locator, pause = 220) {
  await point(page, locator);
  // Re-aim if the layout moved while the cursor was travelling.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await locator.boundingBox();
    if (box && mouse.x >= box.x && mouse.x <= box.x + box.width && mouse.y >= box.y && mouse.y <= box.y + box.height) break;
    log(`  re-aiming at ${await locator.evaluate((node) => node.textContent?.trim().slice(0, 40))} (box ${box ? `${Math.round(box.x)},${Math.round(box.y)}` : "none"}, cursor ${Math.round(mouse.x)},${Math.round(mouse.y)})`);
    await sleep(250);
    await point(page, locator);
  }
  await sleep(110);
  events.push({ t: now(), kind: "click" });
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(pause);
}

async function type(page: Page, locator: Locator, text: string, delay = 48) {
  await click(page, locator, 120);
  await locator.focus();
  // Select and type over the existing value: clearing first can let number fields snap back to a default.
  await page.keyboard.press("Meta+A");
  events.push({ t: now(), kind: "type", ms: text.length * delay });
  await page.keyboard.type(text, { delay });
  await sleep(160);
}

/** Type into a place field and pick the first suggestion with the mouse. */
async function choose(page: Page, locator: Locator, text: string) {
  await type(page, locator, text, 55);
  const option = page.locator('[role="listbox"] [role="option"]').first();
  await option.waitFor({ timeout: 10000 });
  await sleep(250);
  await click(page, option, 200);
}

async function select(page: Page, locator: Locator, value: string) {
  await point(page, locator);
  events.push({ t: now(), kind: "click" });
  await locator.selectOption(value);
  await sleep(350);
}

async function hover(page: Page, locator: Locator, ms = 500) {
  await point(page, locator);
  await sleep(ms);
}

// ─── Chapters paced to narration ──────────────────────────────────────────
type At = (line: number, offset?: number) => Promise<void>;
async function chapter(id: string, run: (at: At) => Promise<void>) {
  const voice = voices.get(id);
  if (!voice) throw new Error(`No narration for ${id}`);
  const start = now();
  events.push({ t: start, kind: "chapter", id });
  const at: At = async (line, offset = 0) => { if (FAST) return; const wait = start + voice.lines[line]!.start + offset - now(); if (wait > 0) await sleep(wait * 1000); };
  log(`▶ ${id} (${voice.duration.toFixed(1)} s narration)`);
  await run(at);
  const end = start + voice.duration + TAIL;
  const over = FAST ? 0 : now() - end;
  if (over < 0) await sleep(-over * 1000); else if (over > 0.3) log(`  ${id} ran ${over.toFixed(1)} s past its narration`);
  chapters.push({ id, start, end: now() });
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error("Preview server did not start");
}

async function main() {
  rmSync(OUT + "/frames", { recursive: true, force: true });
  rmSync(DOWNLOADS, { recursive: true, force: true });
  rmSync(VIEWER, { recursive: true, force: true });
  rmSync(join(OUT, "accounts"), { recursive: true, force: true });
  for (const dir of [FRAMES, DOWNLOADS, VIEWER]) mkdirSync(dir, { recursive: true });
  await writeFixtures();

  // Never reuse a server left over from an earlier run: it would carry that run's accounts.
  try { execSync(`lsof -ti :${PORT} | xargs kill`, { stdio: "ignore" }); } catch { /* port free */ }
  await sleep(300);
  const server: ChildProcess = spawn("node", ["scripts/preview-server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DEMO_DIR: VIEWER, TEMT_DATA_DIR: join(OUT, "accounts") }, stdio: "ignore" });
  process.on("exit", () => server.kill());
  await waitForServer();

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true, locale: "en-IN", timezoneId: "Asia/Kolkata", colorScheme: "light" });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  debugPage = page;
  page.on("filechooser", async (chooser) => { if (pendingFile) { await chooser.setFiles(pendingFile); pendingFile = undefined; } });
  let pendingFile: string | undefined;
  page.on("pageerror", (error) => log(`  page error: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error" && !/favicon|404|401/.test(message.text())) log(`  console: ${message.text().slice(0, 160)}`); });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);

  // Frames: every compositor frame, with its own timestamp.
  const cdp = await context.newCDPSession(page);
  const frames: { file: string; t: number }[] = [];
  cdp.on("Page.screencastFrame", (frame) => {
    const file = join(FRAMES, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, t: frame.metadata.timestamp ?? now() });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 });
  await page.mouse.move(mouse.x, mouse.y);
  await sleep(400);
  const nav = (tour: string) => page.locator(`[data-tour="${tour}"]`).first();

  await chapter("landing", async (at) => {
    await hover(page, page.getByRole("heading", { level: 1 }), 300);
    // Step through the hero walkthrough: a shipment, its footprint, cleaner modes, the report.
    const steps = page.getByRole("list", { name: "What TEMT does" });
    await hover(page, steps.getByRole("button", { name: /Enter a shipment/ }), 900);
    for (const label of [/Get its footprint/, /Compare modes/, /Report it/]) await click(page, steps.getByRole("button", { name: label }), 1150);
    await at(1, -0.3);
    const top = await page.evaluate(() => window.scrollY);
    const y = async (text: string) => top + ((await page.getByText(text).first().boundingBox())?.y ?? 0) - 110;
    await smoothScrollTo(page, await y("Credentials of the TEMT platform"), 1000);
    await sleep(500);
    await smoothScrollTo(page, await y("Everything from one shipment to a board report."), 1000);
    await sleep(400);
    await select(page, page.getByLabel("From", { exact: true }), "chennai");
    await sleep(500);
  });

  await chapter("onboarding", async (at) => {
    await click(page, page.locator("header").getByRole("link", { name: /Open TEMT/ }).first(), 300);
    const dialog = page.getByRole("dialog", { name: "Welcome to TEMT" });
    await dialog.waitFor();
    await sleep(500);
    await hover(page, dialog.getByText("Start with my company"), 500);
    await hover(page, dialog.getByText("Take the guided tour"), 500);
    await at(1, 0.2);
    await click(page, dialog.getByRole("button", { name: "FMCG" }), 300);
    await page.getByText("Total emissions, well-to-wheel").waitFor();
  });

  await chapter("dashboard", async (at) => {
    await sleep(700);
    await hover(page, page.locator('[data-tour="kpi-total"]'), 900);
    await hover(page, page.getByText("Emission intensity").first(), 700);
    await hover(page, page.getByText(/^Target path/).first(), 900);
    await at(1, -0.2);
    const chart = page.locator(".recharts-wrapper").first();
    await reveal(page, chart);
    const box = (await chart.boundingBox())!;
    for (const fx of [0.18, 0.42, 0.66]) { await moveTo(page, box.x + box.width * fx, box.y + box.height * 0.6, 500); await sleep(650); }
    for (const heading of ["By transport mode", "Reduction opportunities"]) { await reveal(page, page.getByRole("heading", { name: heading })); await sleep(1300); }
  });

  await chapter("quick", async (at) => {
    await smoothScrollTo(page, 0, 900);
    await choose(page, page.getByLabel("Quick calculate origin"), "Pune");
    await choose(page, page.getByLabel("Quick calculate destination"), "Kolkata");
    await type(page, page.getByLabel("Cargo weight in tonnes"), "12");
    const card = page.locator('[data-tour="quick-calc"]');
    await click(page, card.getByRole("radio", { name: "Rail" }), 400);
    const text = await card.innerText();
    if (!/84% below road/.test(text)) log("  narration says 84%; check the quick calculator");
    log(`  quick calculator says: ${text.replace(/\s+/g, " ").slice(0, 260)}`);
    await hover(page, card.getByText(/below road/).first(), 600);
    void at;
  });

  await chapter("calculator", async (at) => {
    await click(page, nav("nav-calculate"), 500);
    await page.getByRole("radiogroup", { name: "Transport mode" }).waitFor();
    for (const mode of ["Road", "Courier / PTL", "Rail", "Air", "Sea", "Inland waterway"]) await hover(page, page.getByRole("radio", { name: mode, exact: true }), 120);
    await at(1, -0.4);
    await choose(page, page.locator("#origin"), "Bangalore");
    await choose(page, page.locator("#destination"), "400001");
    await type(page, page.locator("#tonnes"), "18");
    await click(page, page.getByRole("radio", { name: /Multi-axle heavy truck/ }), 500);
    await at(2, -0.3);
    await click(page, page.getByRole("button", { name: "Calculation basis" }), 400);
    await hover(page, page.getByText("Distance type").first(), 900);
    await hover(page, page.getByText("Factor source").first(), 900);
    await at(3, -0.2);
    await click(page, page.getByRole("button", { name: "Fuel-based" }), 300);
    await type(page, page.getByPlaceholder("e.g. 315"), "380");
    await hover(page, page.getByText("Primary data").first(), 700);
    await click(page, page.getByRole("button", { name: "Save to shipments" }), 600);
  });

  await chapter("modes", async (at) => {
    await click(page, page.getByRole("radio", { name: "Rail", exact: true }), 600);
    await at(1, -0.5);
    await click(page, page.getByRole("radio", { name: "Air", exact: true }), 200);
    await choose(page, page.locator("#origin"), "DEL");
    await choose(page, page.locator("#destination"), "BLR");
    await sleep(250);
    await click(page, page.getByRole("radio", { name: "Sea", exact: true }), 200);
    await choose(page, page.locator("#origin"), "Jawaharlal");
    await choose(page, page.locator("#destination"), "Rotterdam");
    await sleep(400);
  });

  await chapter("compare", async () => {
    await click(page, nav("nav-compare"), 400);
    await choose(page, page.getByLabel("Origin", { exact: true }), "Chennai");
    await choose(page, page.getByLabel("Destination", { exact: true }), "Delhi");
    await type(page, page.getByLabel("Cargo tonnes"), "25");
    await page.getByText("Lowest emission").first().waitFor({ timeout: 20000 });
    await sleep(600);
    await click(page, page.getByRole("button", { name: "Save this option" }).first(), 700);
  });

  await chapter("chain", async () => {
    await click(page, nav("nav-chain"), 400);
    await click(page, page.getByRole("button", { name: /Export via port/ }), 300);
    await choose(page, page.getByLabel("Stop 1", { exact: true }), "Pune");
    await choose(page, page.getByLabel("Stop 3", { exact: true }), "Rotterdam");
    await page.getByText("Chain total, well-to-wheel").waitFor();
    await smoothScrollTo(page, 0, 700);
    await hover(page, page.locator('[data-tour="chain-canvas"]'), 900);
    await click(page, page.getByRole("button", { name: "Save chain as a shipment" }), 600);
  });

  await chapter("import", async () => {
    await click(page, nav("nav-import"), 500);
    pendingFile = join(FIXTURES, "temt-template.csv");
    await click(page, page.getByRole("button", { name: "Choose file" }), 200);
    await page.getByText(/read from temt-template\.csv/).waitFor({ timeout: 30000 });
    await sleep(300);
    const problem = page.locator("tr", { hasText: "BAD" }).first();
    if (await problem.count()) await hover(page, problem, 1200); else await sleep(1000);
    await click(page, page.getByRole("button", { name: /^Import \d+ shipments/ }), 700);
  });

  await chapter("ledger", async () => {
    await click(page, nav("nav-shipments"), 400);
    await select(page, page.getByLabel("Financial year"), "all");
    await type(page, page.getByLabel("Search shipments"), "LR-2026");
    await click(page, page.locator("tbody tr").first().locator("td").nth(2), 700);
    const drawer = page.getByRole("dialog");
    await hover(page, drawer.getByText("Factor source").first(), 1300);
    await page.keyboard.press("Escape");
    await sleep(300);
  });

  await chapter("account", async (at) => {
    await click(page, page.getByRole("link", { name: "Sign in" }), 500);
    await page.getByRole("heading", { name: "Sign in to TEMT" }).waitFor();
    await click(page, page.getByRole("group", { name: "Account" }).getByRole("button", { name: "Create account" }), 200);
    await type(page, page.getByLabel("Your name"), "Asha Rao", 30);
    await type(page, page.getByLabel("Organisation"), "Sample FMCG Ltd", 24);
    await type(page, page.getByLabel("Work email"), "asha.rao@example.com", 22);
    await type(page, page.getByLabel("Password", { exact: true }), "freight emissions 2026", 20);
    await click(page, page.locator('form button[type="submit"]'), 300);
    // Back in the workspace; the account menu shows the sync status.
    const menu = page.getByRole("button", { name: /^Account: / });
    await menu.waitFor({ timeout: 20000 });
    await at(1, -0.6);
    await click(page, menu, 500);
    await click(page, page.getByRole("menuitem", { name: "Account and security" }), 400);
    await page.getByText("Matches this browser").waitFor({ timeout: 20000 });
    await hover(page, page.getByText("Matches this browser"), 700);
    await reveal(page, page.getByText("Active sessions"));
    await hover(page, page.getByText("Active sessions"), 600);
  });

  await chapter("reports", async (at) => {
    await click(page, nav("nav-reports"), 500);
    await select(page, page.getByLabel("Financial year"), "FY 2025–26");
    await page.getByRole("heading", { name: "Freight emissions report" }).waitFor();
    await reveal(page, page.getByRole("heading", { name: "BRSR mapping" }));
    await sleep(900);
    await at(1, -0.6);
    await smoothScrollTo(page, 0, 900);
    // One export at a time: the page disables the other buttons while a file is being generated.
    for (const label of ["PDF report", "Excel workbook", "Word document", "CSV (leg level)", "JSON", "Power BI pack"]) {
      const next = page.waitForEvent("download", { timeout: 60000 });
      await click(page, page.getByRole("button", { name: new RegExp(`^${label.replace(/[()]/g, "\\$&")}`) }), 80);
      const download = await next;
      await download.saveAs(join(DOWNLOADS, download.suggestedFilename()));
      events.push({ t: now(), kind: "chime" });
    }
    await buildViewer(DOWNLOADS, VIEWER);
  });

  const viewerItem = (id: string) => page.locator(`#f-${id}`);
  const scrollPane = async (id: string, to: number, ms: number) => page.evaluate(({ id, to, ms }) => new Promise<void>((resolve) => {
    const pane = document.getElementById(`p-${id}`)!; const start = pane.scrollTop, delta = to - start, t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); pane.scrollTop = start + delta * (p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2); if (p < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { id, to, ms });

  await chapter("export-pdf", async () => {
    await page.goto(`${BASE}/__demo/viewer.html#pdf`, { waitUntil: "networkidle" });
    await hover(page, viewerItem("pdf"), 300);
    await moveTo(page, 900, 450, 500);
    await scrollPane("pdf", 1500, 2200);
    await scrollPane("pdf", 3300, 1800);
  });
  await chapter("export-xlsx", async () => {
    await click(page, viewerItem("xlsx"), 500);
    for (const sheet of ["Monthly", "Legs"]) { await click(page, page.locator(".tabs button", { hasText: new RegExp(`^${sheet}$`) }), 450); }
  });
  await chapter("export-docx", async () => {
    await click(page, viewerItem("docx"), 300);
    await moveTo(page, 900, 450, 400);
    await scrollPane("docx", 700, 900);
  });
  await chapter("export-powerbi", async () => {
    await click(page, viewerItem("powerbi"), 500);
    await hover(page, page.locator(".node.fact").first(), 700);
  });
  await chapter("export-data", async () => {
    await click(page, viewerItem("csv"), 900);
    await click(page, viewerItem("json"), 500);
  });

  await chapter("planner", async () => {
    await page.goto(`${BASE}/app/planner/`, { waitUntil: "networkidle" });
    for (const [label, from, to] of [["Move long road hauls to rail", 30, 80], ["Electrify short road legs", 25, 60]] as const) {
      const slider = page.getByLabel(label);
      await point(page, slider, 0.3);
      events.push({ t: now(), kind: "click" });
      for (let v = from; v <= to; v += 5) { await slider.fill(String(v)); const box = (await slider.boundingBox())!; await page.mouse.move(box.x + box.width * (v / 100), box.y + box.height / 2); mouse = { x: box.x + box.width * (v / 100), y: box.y + box.height / 2 }; await sleep(60); }
    }
    await click(page, page.getByRole("button", { name: "Renewable contract" }), 400);
    await reveal(page, page.getByRole("heading", { name: "Lever by lever" }));
    await sleep(800);
  });

  await chapter("factors", async (at) => {
    await click(page, nav("nav-factors"), 500);
    await hover(page, page.getByText("Calculations use TEMT's emission factors"), 1400);
    await click(page, page.getByText("Show GLEC v3.2 for comparison"), 500);
    await reveal(page, page.getByRole("columnheader", { name: "GLEC v3.2 WTW" }));
    await hover(page, page.getByRole("columnheader", { name: "GLEC v3.2 WTW" }), 1200);
    await at(1, -0.3);
    await click(page, nav("nav-settings"), 500);
    await hover(page, page.getByLabel("Search NIFTY 500 companies"), 600);
    await reveal(page, page.getByRole("button", { name: "Download backup" }));
    await hover(page, page.getByRole("button", { name: "Download backup" }), 700);
    await hover(page, page.getByText("Built-in (no setup)"), 700);
  });

  await chapter("copilot", async (at) => {
    await smoothScrollTo(page, 0, 600);
    await click(page, page.locator('[data-tour="copilot-button"]'), 500);
    const input = page.getByLabel("Message the Copilot");
    await input.waitFor();
    const ask = async (line: number, prompt: string, expect: RegExp) => {
      await at(line, -0.2);
      await type(page, input, prompt, 42);
      await page.keyboard.press("Enter");
      events.push({ t: now(), kind: "click" });
      await page.locator('section[aria-label="TEMT Copilot"]').getByText(expect).last().waitFor({ timeout: 30000 });
    };
    await ask(1, "20 t Mumbai to Delhi by 32 ft truck", /Mumbai → Delhi/);
    await ask(2, "Compare that with rail", /Rail with road drayage/);
    await ask(3, "Summarise FY 2025-26", /Heaviest lanes/);
    await sleep(800);
  });

  await chapter("help", async () => {
    await page.getByRole("button", { name: "Close Copilot" }).click();
    await click(page, nav("nav-help"), 400);
    await click(page, page.getByRole("button", { name: "Start the tour" }), 200);
    await page.getByRole("dialog", { name: /Guided tour, step 1 of 14/ }).waitFor();
    await sleep(900);
  });

  await sleep(600);
  await cdp.send("Page.stopScreencast");
  await browser.close();
  server.kill();

  const first = frames[0]!.t;
  const last = frames[frames.length - 1]!.t;
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify({
    frames: frames.length, duration: last - first + 0.5,
    chapters: chapters.map((c) => ({ id: c.id, start: c.start - first, end: c.end - first })),
    events: events.map((e) => ({ ...e, t: e.t - first })),
  }, null, 2));
  const list = frames.map((frame, i) => `file '${frame.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? frame.t + 0.5) - frame.t).toFixed(4)}`).join("\n");
  writeFileSync(join(OUT, "frames.txt"), `${list}\nfile '${frames[frames.length - 1]!.file}'\n`);
  log(`Captured ${frames.length} frames over ${(last - first).toFixed(1)} s`);
  if (!existsSync(join(OUT, "frames.txt"))) process.exit(1);
}

let debugPage: Page | undefined;
main().catch(async (error) => {
  console.error(error);
  await debugPage?.screenshot({ path: join(OUT, "capture-failure.png") }).catch(() => undefined);
  process.exit(1);
});
