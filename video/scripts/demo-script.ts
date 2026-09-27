/**
 * Narration for the product demonstration. Each chapter is captured separately and paced to its narration,
 * so what is said always matches what is on screen. `title` shows as an on-screen chapter label.
 */
export interface ChapterScript { id: string; title?: string; lines: string[] }

export const INTRO: ChapterScript = {
  id: "intro",
  lines: [
    "This is TEMT, the Transportation Emission Measurement Tool from the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore.",
    "Here is the whole product, end to end.",
  ],
};

export const CHAPTERS: ChapterScript[] = [
  { id: "landing", title: "The website", lines: [
    "The website's hero calculator is live: two cities and a weight, and it compares road, rail, air and coastal shipping with the same engine as the product.",
    "Below are the credentials, and every module you're about to see.",
  ] },
  { id: "onboarding", title: "Getting started", lines: [
    "Open TEMT and start with your company, the guided tour, or a sample workspace.",
    "We'll load the FMCG sample, labelled as sample data everywhere.",
  ] },
  { id: "dashboard", title: "Overview", lines: [
    "The overview shows the year's well-to-wheel emissions, intensity per tonne-kilometre, and progress against your target.",
    "Each month splits into tank-to-wheel and well-to-tank, as ISO 14083 requires, followed by modes, business units, lanes and reduction opportunities.",
  ] },
  { id: "quick", title: "Quick calculate", lines: [
    "The quick calculator compares every practical mode, door to door. Pune to Kolkata by rail is about eighty-five percent lower than by truck.",
  ] },
  { id: "calculator", title: "Calculator", lines: [
    "The full calculator covers road, courier, rail, air, sea and inland waterways.",
    "Enter a city or a PIN code, and TEMT estimates the shortest feasible distance. Pick the truck class, and the result updates live.",
    "The calculation basis shows what an auditor needs: activity, distance type, intensity, factor source and data quality.",
    "With fuel receipts, switch to fuel-based for primary data.",
  ] },
  { id: "modes", lines: [
    "Rail, air and sea work the same way. Rail uses the Indian average for mixed diesel and electric traction.",
    "Air uses great-circle distances between airports, and sea legs are routed port to port through a sea-lane network, by trade lane or vessel type.",
  ] },
  { id: "compare", title: "Compare modes", lines: [
    "Compare modes ranks road, rail, air and coastal options for the same cargo, flags impractical ones, and saves your choice to the ledger.",
  ] },
  { id: "chain", title: "Transport chains", lines: [
    "Real freight is often multimodal. The chain builder links legs and hubs in one shipment: here, a factory to the gateway port by trailer, then a container ship, with terminal handling counted as a hub operation.",
  ] },
  { id: "import", title: "Bulk import", lines: [
    "Bulk import reads the TEMT template, six production TEMT formats and GST e-way bills, and checks every row before anything is saved.",
  ] },
  { id: "ledger", title: "Shipment ledger", lines: [
    "Every shipment lands in the ledger. Search, filter, and open any one to see its legs and calculation basis.",
  ] },
  { id: "account", title: "Account and sync", lines: [
    "Accounts are optional. Sign in, and your workspace syncs securely across devices.",
    "The server recalculates it independently, and your sessions and report history live here.",
  ] },
  { id: "reports", title: "Reports", lines: [
    "Reports are read in the tool first, down to the SEBI BRSR Principle 6 mapping.",
    "Then export them in six formats: PDF, Excel, Word, CSV, JSON and Power BI.",
  ] },
  { id: "export-pdf", title: "Exports", lines: [
    "A board-ready PDF, with charts, the BRSR table, methodology and factors.",
  ] },
  { id: "export-xlsx", lines: [
    "An Excel workbook with a sheet for every view, down to each leg.",
  ] },
  { id: "export-docx", lines: [
    "An editable Word report.",
  ] },
  { id: "export-powerbi", lines: [
    "A Power BI pack with a star schema and DAX measures.",
  ] },
  { id: "export-data", lines: [
    "Plus CSV and JSON for any other system.",
  ] },
  { id: "planner", title: "Reduction planner", lines: [
    "The reduction planner tests rail shift, air to road, consolidation, electric trucks and load factors, and measures each lever against your target.",
  ] },
  { id: "factors", title: "Factors and settings", lines: [
    "The factor library lists every value and its source. Switch between GLEC v3.2 India defaults and the production TEMT set, and every shipment recalculates.",
    "Settings hold your NIFTY 500 company, targets, backups, and an optional local AI model.",
  ] },
  { id: "copilot", title: "TEMT Copilot", lines: [
    "The Copilot runs in your browser.",
    "Twenty tonnes, Mumbai to Delhi, by thirty-two foot truck.",
    "Compare that with rail.",
    "Summarise my footprint. It calculates, compares, analyses and exports, on request.",
  ] },
  { id: "help", title: "Guided tour", lines: [
    "And a fourteen-step guided tour explains every screen.",
  ] },
];

export const OUTRO: ChapterScript = {
  id: "outro",
  lines: [
    "TEMT: India-specific factors, an ISO 14083-aligned method, and reports that stand up to scrutiny.",
    "Measure your next shipment today.",
  ],
};

/** Spoken form: acronyms and units the voice would otherwise misread. Captions keep the written form. */
const SPOKEN: [RegExp, string][] = [
  [/TCI–IIMB/g, "T C I, I I M B"],
  [/\bTEMT\b/g, "T E M T"],
  [/\bIIM Bangalore\b/g, "I I M Bangalore"],
  [/\bISO 14083\b/g, "I S O fourteen oh eight three"],
  [/\bGLEC v3\.2\b/g, "glek version three point two"],
  [/\bGLEC\b/g, "glek"],
  [/\bBRSR\b/g, "B R S R"],
  [/\bSEBI\b/g, "sebi"],
  [/\bNIFTY 500\b/g, "nifty five hundred"],
  [/\bAI\b/g, "A I"],
  [/\bFMCG\b/g, "F M C G"],
  [/\bGHG\b/g, "G H G"],
  [/\bGST\b/g, "G S T"],
  [/\bPIN\b/g, "pin"],
  [/\bPDF\b/g, "P D F"],
  [/\bCSV\b/g, "C S V"],
  [/\bJSON\b/g, "jay-sonn"],
  [/\bDAX\b/g, "dax"],
  [/Power BI/g, "Power B I"],
  [/tonne-kilometre/g, "tonne kilometre"],
  [/well-to-wheel/g, "well to wheel"],
  [/tank-to-wheel/g, "tank to wheel"],
  [/well-to-tank/g, "well to tank"],
];
export const spoken = (line: string) => SPOKEN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line);
