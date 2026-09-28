/**
 * Narration for the product demonstration. Each chapter is captured separately and paced to its narration,
 * so what is said always matches what is on screen. `title` shows as an on-screen chapter label.
 */
export interface ChapterScript { id: string; title?: string; lines: string[] }

export const INTRO: ChapterScript = {
  id: "intro",
  lines: [
    "This is TEMT, the Transportation Emission Measurement Tool from IIM Bangalore's Supply Chain Management Centre.",
    "Here is the whole product, end to end.",
  ],
};

export const CHAPTERS: ChapterScript[] = [
  { id: "landing", title: "The website", lines: [
    "The website opens with a live walkthrough of what TEMT does: enter a shipment, get its footprint, compare cleaner modes, and report it.",
    "Below are the credentials, every module, and a lane comparison anyone can try.",
  ] },
  { id: "onboarding", title: "Getting started", lines: [
    "Open the app, and start with your company, the guided tour, or a sample workspace.",
    "Let's load the FMCG sample, labelled as sample data everywhere.",
  ] },
  { id: "dashboard", title: "Overview", lines: [
    "The overview shows the year's well-to-wheel emissions, intensity per tonne-kilometre, and progress against your target.",
    "Each month splits into tank-to-wheel and well-to-tank, as ISO 14083 requires, followed by modes, business units, lanes and reduction opportunities.",
  ] },
  { id: "quick", title: "Quick calculate", lines: [
    "The quick calculator compares every practical mode, door to door. Pune to Kolkata by rail is about eighty-four percent lower than by truck.",
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
    "Bulk import reads the TEMT template, six formats from earlier TEMT versions and GST e-way bills, and checks every row before anything is saved.",
  ] },
  { id: "ledger", title: "Shipment ledger", lines: [
    "Every shipment lands in the ledger. Search, filter, and open any one to see its legs and calculation basis.",
  ] },
  { id: "account", title: "Account and sync", lines: [
    "Accounts are optional. Sign in on its own page, and your workspace syncs securely across devices.",
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
    "The factor library lists every value TEMT applies, with its source: TEMT's own India-specific factors first, and the GLEC defaults alongside for comparison.",
    "Settings hold your NIFTY 500 company, targets, backups, and an optional local AI model.",
  ] },
  { id: "copilot", title: "TEMT Copilot", lines: [
    "The Copilot runs in your browser.",
    "Twenty tonnes from Mumbai to Delhi by thirty-two foot truck.",
    "Compare that with rail.",
    "Summarise FY 2025–26. It calculates, compares, analyses and exports, on request.",
  ] },
  { id: "help", title: "Guided tour", lines: [
    "And a fourteen-step guided tour explains every screen.",
  ] },
];

export const OUTRO: ChapterScript = {
  id: "outro",
  lines: [
    "TEMT: India-specific factors, ISO 14083 certification, and reports that stand up to scrutiny.",
    "Measure your next shipment today.",
  ],
};

/** Spoken form for the neural voice: acronyms spelled out, and units it would otherwise misread. Captions keep the written form. */
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
  [/\bFY (\d{4})–(\d{2})\b/g, "F Y $1 to $2"],
  [/\bGHG\b/g, "G H G"],
  [/\bGST\b/g, "G S T"],
  [/\bPIN\b/g, "pin"],
  [/\bPDF\b/g, "P D F"],
  [/\bCSV\b/g, "C S V"],
  [/\bJSON\b/g, "jay-son"],
  [/\bDAX\b/g, "dax"],
  [/Power BI/g, "Power B I"],
  [/tonne-kilometre/g, "tonne kilometre"],
  // Indian place names the voice mispronounces, respelt phonetically (checked with VERIFY=1).
  [/\bPune\b/g, "Poonay"],
  [/\bKolkata\b/g, "Kolkahta"],
  [/\bDelhi\b/g, "Dell-ee"],
  [/well-to-wheel/g, "well to wheel"],
  [/tank-to-wheel/g, "tank to wheel"],
  [/well-to-tank/g, "well to tank"],
];
export const spoken = (line: string) => SPOKEN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line);
