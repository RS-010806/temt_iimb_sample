/**
 * End-to-end check of the whole product in real Chrome (headless), against the production build.
 * Every step uses the UI the way a person would: typing, choosing suggestions, uploading files,
 * downloading exports and talking to the Copilot. Writes screenshots and a JSON report to out/e2e.
 *
 *   BASE=http://localhost:3000 npx tsx scripts/e2e.ts
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Download, type Page } from "playwright-core";
import { FIXTURES, writeFixtures } from "./fixtures";

const require = createRequire(join(import.meta.dirname, "../../package.json"));
const ExcelJS = require("exceljs") as typeof import("exceljs");
const JSZip = require("jszip") as typeof import("jszip");

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = join(import.meta.dirname, "../out/e2e");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const results: { step: string; ok: boolean; detail?: string }[] = [];
const consoleErrors: { page: string; text: string }[] = [];
let shotIndex = 0;

async function shot(page: Page, name: string, fullPage = false) {
  shotIndex += 1;
  await page.screenshot({ path: join(OUT, `${String(shotIndex).padStart(3, "0")}-${name}.png`), fullPage });
}

async function step(page: Page, name: string, fn: () => Promise<string | void>) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ step: name, ok: true, detail: `${detail ?? ""} (${Date.now() - started} ms)`.trim() });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0]! : String(error);
    results.push({ step: name, ok: false, detail: message });
    console.log(`✗ ${name} — ${message}`);
    await shot(page, `FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}`).catch(() => undefined);
  }
}

function watch(page: Page, label: string) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ page: `${label} ${page.url()}`, text: message.text().slice(0, 300) }); });
  page.on("pageerror", (error) => consoleErrors.push({ page: `${label} ${page.url()}`, text: `pageerror: ${error.message.slice(0, 300)}` }));
}

async function choosePlace(page: Page, locator: ReturnType<Page["locator"]>, text: string) {
  await locator.click();
  await locator.fill(text);
  await page.locator('[role="listbox"] [role="option"]').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(250);
  await locator.press("Enter");
}

async function download(page: Page, action: () => Promise<void>): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), action()]);
  return file;
}

async function validateDownload(file: Download) {
  const name = file.suggestedFilename();
  const path = join(OUT, "downloads", name);
  await file.saveAs(path);
  const bytes = readFileSync(path);
  if (name.endsWith(".pdf")) { if (bytes.subarray(0, 4).toString() !== "%PDF") throw new Error(`${name} is not a PDF`); return `${name} ${bytes.length} B`; }
  if (name.endsWith(".xlsx")) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as never); return `${name} sheets: ${wb.worksheets.map((ws) => ws.name).join(", ")}`; }
  if (name.endsWith(".docx")) { const zip = await JSZip.loadAsync(bytes); if (!zip.file("word/document.xml")) throw new Error("docx missing document.xml"); return `${name} ${bytes.length} B`; }
  if (name.endsWith(".zip")) { const zip = await JSZip.loadAsync(bytes); return `${name}: ${Object.keys(zip.files).join(", ")}`; }
  if (name.endsWith(".json")) { const data = JSON.parse(bytes.toString()); return `${name} schema ${data.schema ?? data.app} with ${data.shipments?.length ?? data.legs?.length} records`; }
  if (name.endsWith(".csv")) { const lines = bytes.toString().trim().split("\n"); return `${name} ${lines.length - 1} rows; header ${lines[0]!.slice(0, 60)}…`; }
  return `${name} ${bytes.length} B`;
}

async function landing(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page, "landing");
  await step(page, "Landing loads", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    await shot(page, "landing-hero");
    return await page.title();
  });
  await step(page, "Hero calculator computes a real comparison", async () => {
    await page.getByLabel("From", { exact: true }).selectOption("chennai");
    await page.getByLabel("To", { exact: true }).selectOption("kolkata");
    await page.getByLabel("Tonnes", { exact: true }).fill("25");
    const line = page.getByText(/Rail cuts this shipment/);
    await line.waitFor();
    return (await line.textContent())!.trim();
  });
  await step(page, "Live Copilot showcase answers three prompts with the real agent", async () => {
    const showcase = page.getByText("Live: the real Copilot, running in your browser");
    await showcase.scrollIntoViewIfNeeded();
    await page.getByText("Well-to-wheel, well-to-tank and tank-to-wheel").waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);
    await shot(page, "landing-copilot-showcase");
    const text = await page.locator("section", { has: showcase }).innerText();
    if (!/Mumbai → Delhi/.test(text) || !/Rail with road drayage/.test(text)) throw new Error("Showcase answers missing");
    return "calculation, follow-up comparison and concept answer rendered";
  });
  await step(page, "Every internal link and sample download resolves", async () => {
    const hrefs = await page.$$eval("a[href]", (links) => [...new Set(links.map((a) => a.getAttribute("href")!).filter((h) => h.startsWith("/")))]);
    const broken: string[] = [];
    for (const href of hrefs) { const response = await page.request.get(`${BASE}${href.split("#")[0]}`); if (response.status() >= 400) broken.push(`${href} ${response.status()}`); }
    if (broken.length) throw new Error(`Broken: ${broken.join(", ")}`);
    return `${hrefs.length} links OK`;
  });
  await step(page, "FAQ and full-page render", async () => {
    await page.getByRole("button", { name: /Where is my data stored/ }).click();
    await page.getByText(/IndexedDB/).first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    for (let y = 0; y < 14000; y += 700) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120); }
    await shot(page, "landing-full", true);
  });
  for (const path of ["/methodology/", "/why-temt/", "/privacy/", "/tour/", "/does-not-exist/"]) {
    await step(page, `Public page ${path}`, async () => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); await page.getByRole("heading", { level: 1 }).waitFor(); await shot(page, `page-${path.replace(/\//g, "") || "home"}`, true); return await page.getByRole("heading", { level: 1 }).innerText(); });
  }
  await context.close();
}

async function workspace(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  watch(page, "app");
  const toast = async (pattern: RegExp) => { await page.getByText(pattern).first().waitFor({ timeout: 15000 }); };

  await step(page, "First visit shows onboarding; sample workspace loads", async () => {
    await page.goto(`${BASE}/app/`, { waitUntil: "networkidle" });
    await page.getByRole("dialog", { name: "Welcome to TEMT" }).waitFor();
    await shot(page, "onboarding");
    await page.getByRole("dialog").getByRole("button", { name: "FMCG" }).click();
    await page.getByText("Total emissions, well-to-wheel").waitFor();
    await page.getByText(/synthetic sample shipments for exploring TEMT/).waitFor();
    await page.waitForTimeout(1200);
    await shot(page, "dashboard");
    return await page.locator('[data-tour="kpi-total"]').innerText();
  });
  await step(page, "Dashboard quick calculator: inputs to saved shipment", async () => {
    const before = Number(await page.locator('a[href="/app/shipments/"] .num').innerText());
    await choosePlace(page, page.getByLabel("Quick calculate origin"), "Pune");
    await choosePlace(page, page.getByLabel("Quick calculate destination"), "Kolkata");
    await page.getByLabel("Cargo weight in tonnes").fill("12");
    const card = page.locator('[data-tour="quick-calc"]');
    await card.getByText(/g\/t-km/).waitFor({ timeout: 15000 });
    await card.getByRole("radio", { name: "Rail" }).click();
    await page.waitForTimeout(400);
    await shot(page, "dashboard-quick-calc");
    const value = await card.locator("span.num").first().innerText();
    await card.getByRole("button", { name: "Save" }).click();
    await toast(/Your dashboard now includes it/);
    const after = Number(await page.locator('a[href="/app/shipments/"] .num').innerText());
    if (after !== before + 1) throw new Error(`Shipment count ${before} → ${after}`);
    return `rail option ${value}; shipments ${before} → ${after}`;
  });
  await step(page, "Dashboard sections render with data", async () => {
    for (let y = 0; y < 3600; y += 600) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(150); }
    await shot(page, "dashboard-full", true);
    for (const heading of ["Monthly emissions", "By transport mode", "Heaviest lanes", "Reduction opportunities", "Data quality", "Recent shipments"]) await page.getByRole("heading", { name: heading }).waitFor();
  });

  await step(page, "Calculator: road by city and PIN code, trace, save", async () => {
    await page.goto(`${BASE}/app/calculate/`, { waitUntil: "networkidle" });
    await choosePlace(page, page.locator("#origin"), "Bangalore");
    await choosePlace(page, page.locator("#destination"), "400001");
    await page.locator("#tonnes").fill("18");
    await page.getByText("Well-to-wheel emissions").waitFor();
    await page.getByRole("button", { name: "How this was calculated" }).click();
    await page.getByText(/^Activity:/).first().waitFor();
    await shot(page, "calculator-road");
    const headline = await page.locator('[data-tour="result"] .num').first().innerText();
    await page.getByRole("button", { name: "Save to shipments" }).click();
    await toast(/^Saved /);
    return `${headline} t CO₂e for Bengaluru → Mumbai, 18 t`;
  });
  const modeCheck = async (mode: string, origin: string, destination: string, name: string) => {
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await choosePlace(page, page.locator("#origin"), origin);
    await choosePlace(page, page.locator("#destination"), destination);
    await page.locator("#tonnes").fill("10");
    await page.waitForTimeout(500);
    const text = await page.locator('[data-tour="result"]').innerText();
    if (!/CO₂e/.test(text.split("\n").slice(0, 4).join(" "))) throw new Error(`No result: ${text.slice(0, 140)}`);
    await shot(page, `calculator-${name}`);
    return text.split("\n").slice(1, 3).join(" ");
  };
  await step(page, "Calculator: rail", () => modeCheck("Rail", "Ludhiana", "Kolkata", "rail"));
  await step(page, "Calculator: air via airport codes", () => modeCheck("Air", "DEL", "BLR", "air"));
  await step(page, "Calculator: sea via ports", () => modeCheck("Sea", "Jawaharlal", "Rotterdam", "sea"));
  await step(page, "Calculator: courier / PTL", () => modeCheck("Courier / PTL", "Gurugram", "Lucknow", "courier"));
  await step(page, "Calculator: inland waterway", () => modeCheck("Inland waterway", "Patna", "Kolkata", "iww"));
  await step(page, "Calculator: fuel-based and electric road", async () => {
    await page.getByRole("radio", { name: "Road", exact: true }).click();
    await choosePlace(page, page.locator("#origin"), "Pune");
    await choosePlace(page, page.locator("#destination"), "Nashik");
    await page.locator("#tonnes").fill("12");
    await page.getByRole("button", { name: "Fuel-based" }).click();
    await page.getByPlaceholder("e.g. 315").fill("58");
    await page.waitForTimeout(400);
    const fuel = (await page.locator('[data-tour="result"] .num').first().innerText());
    await page.getByRole("button", { name: "Electric" }).click();
    await page.getByRole("radio", { name: /Light commercial vehicle/ }).click();
    await page.getByPlaceholder("From charging logs").fill("24");
    await page.waitForTimeout(400);
    await shot(page, "calculator-electric");
    const ev = await page.locator('[data-tour="result"] .num').first().innerText();
    return `fuel-based ${fuel}; electric ${ev}`;
  });

  await step(page, "Compare modes door to door and save the best option", async () => {
    await page.goto(`${BASE}/app/compare/?from=Chennai&to=Delhi&t=25`, { waitUntil: "networkidle" });
    await page.getByText("Lowest emission").first().waitFor({ timeout: 20000 });
    await shot(page, "compare");
    await page.getByRole("button", { name: "Save this option" }).click();
    await toast(/to shipments/);
    return (await page.getByText(/lowest-emission practical option/).innerText()).slice(0, 140);
  });

  await step(page, "Transport chain: rail intermodal template saved", async () => {
    await page.goto(`${BASE}/app/chain/`, { waitUntil: "networkidle" });
    await choosePlace(page, page.getByLabel("Stop 1", { exact: true }), "Hosur");
    await choosePlace(page, page.getByLabel("Stop 4", { exact: true }), "Guwahati");
    await page.getByText("Chain total, well-to-wheel").waitFor();
    await page.waitForTimeout(600);
    await shot(page, "chain");
    await page.getByRole("button", { name: "Save chain as a shipment" }).click();
    await toast(/^Saved /);
  });

  const fileInput = () => page.getByLabel("Choose a file to import");
  const readFile = async (name: string) => {
    await fileInput().setInputFiles(join(FIXTURES, name));
    await page.getByText(new RegExp(`read from ${name.replace(/\./g, "\\.")}`)).waitFor({ timeout: 30000 });
    const summary = await page.locator('[role="group"][aria-label="Filter rows"]').innerText();
    return summary.replace(/\s+/g, " ");
  };
  await page.goto(`${BASE}/app/import/`, { waitUntil: "networkidle" });
  for (const name of ["temt-template.csv", "legacy-point-to-point.xlsx", "legacy-railway.xlsx", "legacy-air.xlsx", "legacy-coastal.xlsx", "legacy-international-water.xlsx", "legacy-courier.xlsx"]) {
    await step(page, `Import ${name}`, async () => {
      const summary = await readFile(name);
      await shot(page, `import-${name.replace(/\..+$/, "")}`);
      const button = page.getByRole("button", { name: /^Import \d+ shipments/ });
      if (await button.isEnabled()) { await button.click(); await toast(/^Imported /); }
      return summary;
    });
  }
  await step(page, "Import e-way bill JSON, then with a default weight", async () => {
    const first = await readFile("ewaybills.json");
    await page.getByLabel("Default weight").fill("4");
    await page.getByRole("button", { name: "Re-read with these defaults" }).click();
    await page.waitForTimeout(1500);
    const second = (await page.locator('[role="group"][aria-label="Filter rows"]').innerText()).replace(/\s+/g, " ");
    await shot(page, "import-ewaybill");
    await page.getByRole("button", { name: /^Import \d+ shipments/ }).click();
    await toast(/^Imported /);
    return `${first} → ${second}`;
  });

  await step(page, "Ledger: search, detail trace, duplicate, delete and undo", async () => {
    await page.goto(`${BASE}/app/shipments/`, { waitUntil: "networkidle" });
    await page.getByLabel("Financial year").selectOption("all");
    await page.getByLabel("Search shipments").fill("LR-2026-1001");
    await page.getByRole("cell", { name: "LR-2026-1001", exact: true }).first().click();
    await page.getByText("Legs and calculation trace").waitFor();
    await shot(page, "ledger-drawer");
    await page.getByRole("button", { name: "Duplicate" }).click();
    await toast(/Duplicated/);
    await page.getByLabel("Search shipments").fill("LR-2026-1001-COPY");
    await page.getByRole("cell", { name: "LR-2026-1001-COPY", exact: true }).first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("cell", { name: "LR-2026-1001-COPY", exact: true }).first().waitFor();
  });

  await step(page, "Reports render on screen", async () => {
    await page.goto(`${BASE}/app/reports/`, { waitUntil: "networkidle" });
    await page.getByLabel("Financial year").selectOption("FY 2025–26");
    await page.getByRole("heading", { name: "Freight emissions report" }).waitFor();
    for (let y = 0; y < 5000; y += 700) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120); }
    await shot(page, "report-full", true);
  });
  for (const label of ["PDF report", "Excel workbook", "Word document", "CSV (leg level)", "JSON", "Power BI pack"]) {
    await step(page, `Export ${label}`, async () => validateDownload(await download(page, () => page.getByRole("button", { name: new RegExp(`^${label.replace(/[()]/g, "\\$&")}`) }).click())));
  }

  await step(page, "Planner levers change the scenario", async () => {
    await page.goto(`${BASE}/app/planner/`, { waitUntil: "networkidle" });
    const tile = page.locator("text=With these levers").locator("..").locator("..");
    const before = await tile.innerText();
    await page.getByLabel("Move long road hauls to rail").fill("80");
    await page.getByLabel("Electrify short road legs").fill("60");
    await page.getByRole("button", { name: "Renewable contract" }).click();
    await page.waitForTimeout(800);
    await shot(page, "planner");
    const after = await tile.innerText();
    if (before === after) throw new Error("Scenario did not change");
    return `${before.replace(/\s+/g, " ")} → ${after.replace(/\s+/g, " ")}`;
  });

  await step(page, "Factor library: switch sets and every tab", async () => {
    await page.goto(`${BASE}/app/factors/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Production TEMT factor set/ }).click();
    await toast(/Now using TEMT production/);
    for (const tab of ["Rail and air", "Sea", "Waterways and hubs", "Fuels and electricity", "Sources", "Road"]) { await page.getByRole("button", { name: tab, exact: true }).click(); await page.waitForTimeout(150); }
    await shot(page, "factors");
    await page.getByRole("button", { name: /GLEC Framework v3.2/ }).click();
    await toast(/Now using GLEC v3.2 India/);
  });

  await step(page, "Settings: NIFTY 500 company, backup, clear and restore, server check", async () => {
    await page.goto(`${BASE}/app/settings/`, { waitUntil: "networkidle" });
    await page.getByLabel("Search NIFTY 500 companies").fill("Hindustan Unilever");
    await page.getByRole("button", { name: /Hindustan Unilever Ltd/ }).click();
    await page.getByPlaceholder("Name or email").fill("sustainability@example.com");
    const backup = await download(page, () => page.getByRole("button", { name: "Download backup" }).click());
    const backupPath = join(OUT, "downloads", backup.suggestedFilename());
    await backup.saveAs(backupPath);
    const count = JSON.parse(readFileSync(backupPath, "utf8")).shipments.length;
    await page.getByRole("button", { name: "Clear all shipments" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Clear \d+ shipments/ }).click();
    await toast(/Workspace cleared/);
    await page.getByLabel("Restore backup file").setInputFiles(backupPath);
    await toast(new RegExp(`Restored ${count} shipments`));
    await page.getByRole("button", { name: "Run server check" }).click();
    await page.getByText(/Server recalculated|No API|did not respond|HTTP/).waitFor({ timeout: 95000 });
    await shot(page, "settings");
    return `${count} shipments backed up and restored; ${(await page.getByText(/Server recalculated|No API|did not respond|HTTP/).innerText()).slice(0, 160)}`;
  });

  await step(page, "Guided tour walks all 14 steps and finds every target", async () => {
    await page.goto(`${BASE}/app/help/`, { waitUntil: "networkidle" });
    await page.getByLabel("Search help").fill("e-way bill");
    await page.getByRole("button", { name: "Use e-way bill data" }).waitFor();
    await page.getByLabel("Search help").fill("");
    await page.getByRole("button", { name: "Start the tour" }).click();
    const missing: string[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const dialog = page.getByRole("dialog", { name: `Guided tour, step ${i} of 14` });
      await dialog.waitFor({ timeout: 15000 });
      await page.waitForTimeout(1300);
      const highlighted = await page.locator('svg rect[stroke="#efc4c0"]').count();
      if (!highlighted) missing.push(String(i));
      if ([1, 5, 7, 12, 14].includes(i)) await shot(page, `tour-step-${i}`);
      await dialog.getByRole("button", { name: i === 14 ? "Finish" : "Next" }).click();
    }
    if (missing.length) throw new Error(`Steps without a highlighted target: ${missing.join(", ")}`);
  });

  const ask = async (prompt: string, expect: RegExp) => {
    const input = page.getByLabel("Message the Copilot");
    await input.fill(prompt);
    await input.press("Enter");
    await page.locator('section[aria-label="TEMT Copilot"]').getByText(expect).last().waitFor({ timeout: 45000 });
    await page.waitForTimeout(400);
  };
  await step(page, "Copilot: calculate, follow-up, analyse, what-if, export, explain, navigate, plan", async () => {
    await page.goto(`${BASE}/app/`, { waitUntil: "networkidle" });
    await page.keyboard.press("Meta+k");
    await page.getByLabel("Message the Copilot").waitFor();
    await ask("20 t Mumbai to Delhi by 32 ft truck", /Mumbai → Delhi/);
    await ask("Compare that with rail", /Rail with road drayage/);
    await shot(page, "copilot-calc-compare");
    await ask("Summarise my footprint", /Heaviest lanes/);
    await ask("Where can I reduce emissions?", /Move long road hauls to rail/);
    await ask("What if we move 40% of long road hauls to rail?", /Scenario/);
    await shot(page, "copilot-analysis");
    const excel = await download(page, () => ask("Export an Excel workbook", /Preparing your XLSX/));
    const excelInfo = await validateDownload(excel);
    await ask("What is Scope 3 Category 9?", /Scope 1, 2 and 3/);
    await ask("open the planner", /Opening/);
    await page.waitForURL(/\/app\/planner\//);
    const pdf = await download(page, () => ask("load sample automotive data and then export a pdf report", /Preparing your PDF/));
    const pdfInfo = await validateDownload(pdf);
    await shot(page, "copilot-plan");
    return `${excelInfo}; ${pdfInfo}`;
  });
  await context.close();
}

async function mobile(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, "mobile");
  for (const path of ["/", "/app/", "/app/calculate/", "/app/compare/", "/app/shipments/", "/app/reports/", "/app/planner/", "/app/import/", "/methodology/", "/tour/"]) {
    await step(page, `Mobile ${path} has no horizontal overflow`, async () => {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      if (path === "/app/") { const dialog = page.getByRole("dialog", { name: "Welcome to TEMT" }); if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "FMCG" }).click(); await page.waitForTimeout(800); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await shot(page, `mobile-${path.replace(/\//g, "") || "home"}`);
      if (overflow > 1) throw new Error(`Page is ${overflow}px wider than the screen`);
    });
  }
  await step(page, "Mobile navigation menu opens", async () => {
    await page.goto(`${BASE}/app/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Reports" }).waitFor();
    await shot(page, "mobile-menu");
  });
  await context.close();
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "downloads"), { recursive: true });
  await writeFixtures();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const only = process.env.ONLY;
  if (!only || only === "landing") await landing(browser);
  if (!only || only === "app") await workspace(browser);
  if (!only || only === "mobile") await mobile(browser);
  await browser.close();
  const failed = results.filter((result) => !result.ok);
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results, consoleErrors }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} steps passed; ${consoleErrors.length} console errors.`);
  for (const error of consoleErrors.slice(0, 20)) console.log(`  console: ${error.page} → ${error.text}`);
  console.log(`Screenshots: ${OUT} (${statSync(OUT).isDirectory() ? "ok" : "missing"})`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
