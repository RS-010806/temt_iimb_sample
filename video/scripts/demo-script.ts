/**
 * Narration for the product demonstration. Each chapter is captured separately and paced to its narration,
 * so what is said always matches what is on screen. `title` shows as an on-screen chapter label.
 */
export interface ChapterScript { id: string; title?: string; lines: string[] }

export const INTRO: ChapterScript = {
  id: "intro",
  lines: [
    "This is TEMT, the Transportation Emission Measurement Tool from the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore.",
    "Let's walk through the whole product, from a single shipment to a board-ready report.",
  ],
};

export const CHAPTERS: ChapterScript[] = [
  { id: "landing", title: "The website", lines: [
    "The website shows what TEMT does, and everything on it works.",
    "The calculator in the hero is live. Pick two cities and a weight, and it compares road, rail, air and coastal shipping with the same engine as the full product.",
    "Below are the credentials, the problem TEMT solves, and each module you're about to see.",
  ] },
  { id: "onboarding", title: "Getting started", lines: [
    "Open TEMT, and choose how to begin: set up your company, take the guided tour, or explore a sample workspace.",
    "We'll load the FMCG sample: two financial years of synthetic shipments, labelled as sample data wherever they appear.",
  ] },
  { id: "dashboard", title: "Overview", lines: [
    "The overview answers the first questions a sustainability team is asked.",
    "Total well-to-wheel emissions for the year, intensity per tonne-kilometre, and whether you're on track for your reduction target.",
    "Every month is split into tank-to-wheel and well-to-tank, the two parts ISO 14083 asks you to report.",
    "Further down are emissions by mode, business unit and lane, and reduction opportunities, each recalculated with the same engine.",
  ] },
  { id: "quick", title: "Quick calculate", lines: [
    "Need a fast answer? The quick calculator compares every practical mode, door to door.",
    "Pune to Kolkata, twelve tonnes: rail with road drayage is about eighty-five percent lower than a direct truck.",
  ] },
  { id: "calculator", title: "Calculator", lines: [
    "The full calculator covers road, courier, rail, air, sea and inland waterways.",
    "Type a city, or a six-digit PIN code, and TEMT finds it and estimates the shortest feasible distance.",
    "Pick the truck class, and the result updates as you type, split into tank-to-wheel and well-to-tank.",
    "Open the calculation basis for what an auditor needs: transport activity, distance type, emission intensity, factor source and data quality.",
    "Have fuel receipts? Switch to fuel-based, and the leg counts as primary data.",
  ] },
  { id: "modes", lines: [
    "Rail uses the Indian average for mixed diesel and electric traction.",
    "Air uses the great-circle distance between airports.",
    "And sea routes port to port through a sea-lane network, by trade lane or vessel type.",
  ] },
  { id: "compare", title: "Compare modes", lines: [
    "Compare modes puts every option side by side for the same cargo, and flags the ones that aren't practical.",
    "Pick one, and save it straight to your shipment ledger.",
  ] },
  { id: "chain", title: "Transport chains", lines: [
    "Real freight is often multimodal.",
    "The transport chain builder links legs and hubs: here, a factory to the gateway port by trailer, then a container ship, with terminal handling counted as a hub operation.",
  ] },
  { id: "import", title: "Bulk import", lines: [
    "For a full year of data, bulk import takes the TEMT Excel template, six file formats from the production TEMT platform, and GST e-way bill JSON.",
    "Every row is checked before anything is saved, and problems are listed row by row, so a bad line never slips into your inventory.",
  ] },
  { id: "ledger", title: "Shipment ledger", lines: [
    "Every shipment lands in the ledger.",
    "Search, filter by year, mode or GHG scope, and open any shipment to see its legs and calculation basis.",
  ] },
  { id: "account", title: "Account and sync", lines: [
    "An account is optional. Everything so far has stayed in this browser.",
    "Create one, and your workspace syncs securely across devices.",
    "The server recalculates the account copy independently and confirms that it matches. Your sessions, activity and report history are all here.",
  ] },
  { id: "reports", title: "Reports", lines: [
    "Reports are read in the tool first: the headline figures, the life-cycle split, GHG Protocol scopes, business units, lanes, data quality, and the SEBI BRSR Principle 6 mapping.",
    "Then take them anywhere, in six formats.",
  ] },
  { id: "export-pdf", title: "Exports", lines: [
    "The PDF is a board-ready report, with a cover, charts, the BRSR table, the methodology, and the factors used.",
  ] },
  { id: "export-xlsx", lines: [
    "The Excel workbook has a sheet for every view, down to each leg with its factor, source and distance type.",
  ] },
  { id: "export-docx", lines: [
    "The Word document is fully editable, ready for your sustainability report.",
  ] },
  { id: "export-powerbi", lines: [
    "The Power BI pack is a star schema with DAX measures, a Power Query script and a report theme.",
  ] },
  { id: "export-data", lines: [
    "And CSV and JSON carry the same leg-level figures into any other system.",
  ] },
  { id: "planner", title: "Reduction planner", lines: [
    "The reduction planner tests the levers that matter: long road hauls to rail, air to road, consolidation, electric trucks and better load factors.",
    "The waterfall shows each lever's effect, measured against your target.",
  ] },
  { id: "factors", title: "Factor library", lines: [
    "The factor library lists every value with its source.",
    "Switch between the GLEC v3.2 India defaults and the production TEMT factor set, and every shipment recalculates, so a prior year can be restated in one click.",
  ] },
  { id: "copilot", title: "TEMT Copilot", lines: [
    "The Copilot runs in your browser. Just ask.",
    "Twenty tonnes, Mumbai to Delhi, by thirty-two foot truck.",
    "Then: compare that with rail. It remembers the shipment, and answers with the same engine.",
    "It can also summarise your footprint, run what-ifs, and export reports on request.",
  ] },
  { id: "help", title: "Guided tour", lines: [
    "New to TEMT? The fourteen-step guided tour and the help centre explain every screen and every concept.",
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
