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
    "The quick calculator compares every practical mode, door to door. Pune to Kolkata by rail is about eighty-five percent lower than by truck.",
  ] },
  { id: "calculator", title: "Calculator", lines: [
    "The calculator starts with the method: distance-based, or fuel-based when you have fuel records. Then pick the mode.",
    "Type a city, even an old name like Bangalore, or a PIN code, and TEMT calculates the distance. Or enter it manually from your trip sheet.",
    "Enter the cargo in tons, pick the truck, and the result shows the emission factor, intensity per ton, and every step, with the GLEC reference.",
    "The LR number and dispatch date are required, and saving the same LR number again updates that shipment.",
    "Fuel-based asks only for the fuel used: here, litres of diesel from a fuel card.",
  ] },
  { id: "modes", lines: [
    "For rail, search stations by name or code. TEMT measures the shortest route on the Indian Railways network, station to station: on average within about three percent of published route distances.",
    "Air uses great-circle distances between airports, and sea legs are routed port to port through a sea-lane network, by trade lane or vessel type.",
  ] },
  { id: "compare", title: "Compare modes", lines: [
    "Compare modes ranks road, rail, air and coastal options for the same cargo, flags impractical ones, and saves your choice to the ledger.",
  ] },
  { id: "chain", title: "Shipments with several stops", lines: [
    "Many shipments make several stops. Start from the origin and destination, or an example such as rail intermodal: here, Hosur to Guwahati, and TEMT picks the nearest stations.",
    "Press plus on any leg to add another stop, up to twelve legs, each with its own mode, and terminal handling counted at every stop.",
  ] },
  { id: "import", title: "Bulk import", lines: [
    "Bulk import reads the TEMT template, six formats from earlier TEMT versions and GST e-way bills. It checks every row before saving, and updates any shipment whose LR number is already saved.",
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

/**
 * Spoken form for the neural voice (Ava): only what it would otherwise misread. Captions keep the written form.
 * Checked with VERIFY=1, which transcribes every line with Whisper.
 */
const SPOKEN: [RegExp, string][] = [
  [/TCI–IIMB/g, "T C I, I I M B"],
  [/\bTEMT\b/g, "T E M T"],
  [/\bIIM Bangalore\b/g, "I I M Bangalore"],
  [/\bFY (\d{4})–(\d{2})\b/g, "F Y $1 to $2"],
  [/\bPune\b/g, "Poo-nay"],
  [/tonne-kilometre/g, "tonne kilometre"],
];
export const spoken = (line: string) => SPOKEN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line);
