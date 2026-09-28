/**
 * Knowledge base for the TEMT Copilot. Answers are written from the sources cited in the
 * methodology page (GLEC v3.2, ISO 14083, GHG Protocol, CEA, SEBI BRSR) and describe what
 * this tool actually does. Keep each article short: the Copilot shows it verbatim.
 */
export interface Article {
  id: string;
  title: string;
  keywords: string[];
  body: string;
  actions?: { label: string; href?: string; prompt?: string }[];
  kind: "concept" | "howto" | "product";
}

export const ARTICLES: Article[] = [
  {
    id: "wtw", kind: "concept", title: "Well-to-wheel, well-to-tank and tank-to-wheel",
    keywords: ["wtw", "wtt", "ttw", "well to wheel", "well to tank", "tank to wheel", "lifecycle", "upstream fuel", "energy provision", "vehicle operation"],
    body: "**Tank-to-wheel (TTW)** is what the vehicle emits while burning fuel. **Well-to-tank (WTT)** covers producing, refining and delivering that fuel or electricity. **Well-to-wheel (WTW)** is the sum, and it is what ISO 14083 asks you to report as the headline. TEMT shows all three for every shipment. Example: diesel has a TTW of 3.24 and a WTW of 4.21 kg CO₂e per kg (GLEC v3.2, Indian sources). Electric vehicles have zero TTW; all their emissions are WTT from the grid.",
  },
  {
    id: "iso14083", kind: "concept", title: "ISO 14083 and what it means for TEMT",
    keywords: ["iso 14083", "iso", "standard", "certified", "certification", "compliant", "transport chain", "tce", "toc", "hoc"],
    body: "ISO 14083:2023 is the international standard for quantifying and reporting greenhouse gas emissions from transport chains: every leg (transport operation) and every hub (terminal, warehouse, cross-dock), on a well-to-wheel basis. TEMT was the **first platform in India to achieve ISO 14083 certification** (December 2024) and its information security is certified to **ISO/IEC 27001:2022**. Every result follows the standard's structure: legs plus hubs, a WTT/TTW split, documented factor sources, data-quality labels and the stated distance type.",
    actions: [{ label: "Read the methodology", href: "/methodology/" }],
  },
  {
    id: "glec", kind: "concept", title: "Where TEMT's Indian factors come from",
    keywords: ["glec", "smart freight centre", "sfc", "default factors", "india factors", "tci", "iimb lab", "table 13", "where do the indian factors come from", "emission factors"],
    body: "TEMT's emission factors were developed from research at the **TCI–IIMB Supply Chain Sustainability Lab** (Supply Chain Management Centre, IIM Bangalore) and validated through TEMT's ISO 14083 certification. They cover seven Indian truck classes by gross vehicle weight and fuel, Indian Railways, air by haul and aircraft type, and sea by vessel. The lab's truck research is also published in the international GLEC Framework v3.2. Where TEMT has no value of its own, such as container trade lanes, inland waterways and most hubs, it uses the ISO 14083-aligned GLEC defaults.",
    actions: [{ label: "Open the factor library", href: "/app/factors/" }],
  },
  {
    id: "factor-sets", kind: "product", title: "TEMT factors and the GLEC comparison",
    keywords: ["factor set", "switch factors", "legacy", "restate", "reconcile", "compare factor sets", "which factors", "glec comparison"],
    body: "TEMT calculates with **its own India-specific factors** by default. For benchmarking, Settings can switch the whole workspace to the **GLEC Framework v3.2** defaults, for example to compare with a partner who reports on GLEC. Switching recalculates every shipment instantly; your inputs never change, and every report names the factor set it used.",
    actions: [{ label: "Open the factor library", href: "/app/factors/" }],
  },
  {
    id: "scopes", kind: "concept", title: "Scope 1, 2 and 3 (Category 4 and 9) for freight",
    keywords: ["scope", "scope 1", "scope 2", "scope 3", "category 4", "category 9", "cat 4", "cat 9", "upstream transportation", "downstream transportation", "ghg protocol", "own fleet"],
    body: "Under the GHG Protocol, freight lands in different scopes depending on **who operates or pays**:\n- **Own fleet** fuel → Scope 1 (electricity for own EVs → Scope 2)\n- **Transport you buy** (inbound, outbound and between your sites) → Scope 3 Category 4\n- **Transport your customer pays for** after sale → Scope 3 Category 9\nSet “Who pays” on each shipment and TEMT classifies every leg automatically. Reports show the split.",
  },
  {
    id: "brsr", kind: "concept", title: "BRSR and freight emissions",
    keywords: ["brsr", "sebi", "business responsibility", "sustainability report", "brsr core", "principle 6", "listed companies", "nifty", "disclosure", "assurance"],
    body: "SEBI's Business Responsibility and Sustainability Report (BRSR) asks listed companies for GHG emissions under **Principle 6**: Scope 1 and 2 with intensity as essential indicators, and **Scope 3 as a leadership indicator**. SEBI's January 2026 master circular applies BRSR to the top 1,000 listed entities by market capitalisation. TEMT's reports include a BRSR mapping table and emission intensity per rupee of revenue when you enter revenue in Settings. Freight evidence supports the disclosure; it is not by itself a complete BRSR.",
    actions: [{ label: "Open reports", href: "/app/reports/" }],
  },
  {
    id: "tkm", kind: "concept", title: "Tonne-kilometres and emission intensity",
    keywords: ["tonne km", "tonne-km", "t-km", "tkm", "intensity", "g/tkm", "per tonne", "kpi", "efficiency"],
    body: "A **tonne-kilometre** is one tonne moved one kilometre; it measures transport work. Emission intensity is **grams CO₂e per tonne-kilometre**, so you can compare lanes, modes and years fairly even when volumes change. TEMT also shows kg CO₂e per tonne shipped and, if you add revenue, tonnes per ₹ crore.",
  },
  {
    id: "methods", kind: "concept", title: "Distance-based, fuel-based and energy-based methods",
    keywords: ["method", "fuel based", "distance based", "activity based", "spend based", "energy based", "litres", "fuel data", "primary data", "which method", "accuracy"],
    body: "- **Distance-based**: cargo tonnes × distance × a default factor. Easiest when you know weight and route.\n- **Fuel-based**: litres or kg of fuel × the fuel's emission factor. More accurate; use fuel cards or carrier reports. For shared trucks, set the share that belongs to your cargo.\n- **Energy-based**: kWh of electricity × the grid factor, for electric vehicles.\nFuel and energy data count as **primary data**, which ISO 14083 prefers over defaults.",
  },
  {
    id: "quality", kind: "concept", title: "Data quality labels",
    keywords: ["data quality", "primary", "modelled", "default data", "tier", "uncertainty", "improve accuracy"],
    body: "Every leg is labelled **Primary** (measured fuel or energy, or a carrier-specific intensity), **Modelled**, or **Default** (published factor). Reports show what share of emissions rests on each, so auditors and managers know how firm the number is. To improve it, ask your largest carriers for fuel records and enter them with the fuel-based method.",
  },
  {
    id: "reefer", kind: "concept", title: "Refrigerated freight",
    keywords: ["reefer", "refrigerated", "cold chain", "temperature controlled", "frozen", "chilled"],
    body: "Temperature-controlled road freight uses more fuel. TEMT applies its refrigeration uplift to refrigerated road legs and uses reefer container values at sea. Tick “Refrigerated” on the leg.",
  },
  {
    id: "air", kind: "concept", title: "How air freight is calculated",
    keywords: ["air", "flight", "airport", "belly", "freighter", "95 km", "short haul", "long haul", "air cargo"],
    body: "Air distance is the great-circle distance between airports, with the standard routing allowance. Air factors distinguish **short-haul (≤1,500 km)** and long-haul, and **freighter, belly-hold or unknown** aircraft. Per tonne-kilometre, air is roughly 12–20 times a heavy truck and far above Indian rail, so small air volumes dominate footprints quickly.",
  },
  {
    id: "sea", kind: "concept", title: "How sea and coastal freight are calculated",
    keywords: ["sea", "ship", "vessel", "coastal", "ocean", "container", "teu", "trade lane", "port", "nautical", "bulk", "tanker", "distance adjustment"],
    body: "Choose **container by trade lane** (per TEU-km, converted with the cargo per TEU: 6, 10 or 14.5 t; TEMT suggests the lane from the route) or a **vessel type and size**, from bulk carriers to tankers. TEMT routes port to port through a sea-lane network and adjusts estimated routes to typical sailed distances. Enter the actual sailed distance when you have it.",
  },
  {
    id: "hubs", kind: "concept", title: "Hubs, terminals and warehouses",
    keywords: ["hub", "terminal", "warehouse", "transshipment", "cross dock", "icd", "cfs", "port handling", "storage"],
    body: "ISO 14083 counts hub operations as part of the transport chain. TEMT uses ISO 14083-aligned hub defaults: transshipment 1.2 kg CO₂e per tonne (2.6 mixed temperature), storage and transshipment 2.7, warehouse 40.1, liquid bulk terminal 3.4, and 11.4 kg per container at intermodal terminals. Add hubs between legs in the transport chain builder.",
    actions: [{ label: "Build a chain", href: "/app/chain/" }],
  },
  {
    id: "ev", kind: "concept", title: "Electric trucks and the Indian grid",
    keywords: ["ev", "electric", "battery", "e-truck", "charging", "grid", "cea", "renewable", "kwh"],
    body: "Electric legs use electricity × grid factor. TEMT uses **CEA V21.0: 0.710 kg CO₂/kWh** (all-India weighted average, FY 2024–25). Enter measured kWh from charging logs for primary data. On India's average grid, an electric truck's emissions can be close to a modern diesel's (GLEC notes parity near 733 g/kWh), so the big gains come with **renewable electricity**: enter your supplier's factor to reflect a green power contract.",
  },
  {
    id: "courier", kind: "concept", title: "Courier and part-truckload (PTL)",
    keywords: ["courier", "ptl", "part truck", "express", "surface express", "ltl", "consolidated", "first mile", "last mile", "mid mile"],
    body: "Express and PTL consignments move in three legs: **first mile** to the carrier's hub, **line haul** between hubs, and **last mile** to the customer, with two transshipments. TEMT models all five steps with its courier defaults for each leg.",
    actions: [{ label: "Courier calculator", href: "/app/calculate/?mode=courier" }],
  },
  {
    id: "distance", kind: "product", title: "How TEMT estimates distance without maps",
    keywords: ["distance", "pin code", "pincode", "google maps", "route", "km", "estimate distance", "how far", "sfd", "gcd"],
    body: "Type a city (aliases like Bombay or Gurgaon work) or a 6-digit PIN code. TEMT estimates the shortest feasible road, rail or waterway distance with an India network model calibrated on major corridors, uses the great-circle distance for air and routes sea legs port to port. Estimates are typically within 10–15% on the corridors we checked; **type the actual distance** whenever you have it from your transport management system or e-way bill.",
  },
  {
    id: "howto-calculate", kind: "howto", title: "Calculate a shipment",
    keywords: ["calculate", "how do i calculate", "new shipment", "single shipment", "estimate", "start", "add shipment"],
    body: "1. Open **Calculate** and pick a mode.\n2. Enter origin and destination (city or PIN code); distance fills in automatically.\n3. Enter cargo weight and, for road, the truck class and fuel.\n4. The result updates live with the WTT/TTW split and a full calculation trace.\n5. Press **Save to shipments** to add it to your ledger and reports.\nTip: ask me, for example, “20 tonnes Pune to Delhi by 32 ft truck”.",
    actions: [{ label: "Open the calculator", href: "/app/calculate/" }],
  },
  {
    id: "howto-import", kind: "howto", title: "Import shipments in bulk",
    keywords: ["import", "upload", "bulk", "csv", "excel", "xlsx", "template", "spreadsheet", "many shipments", "columns"],
    body: "Open **Bulk import**, download the TEMT template (CSV or Excel), fill one row per shipment leg and drop the file in. Distances can be left blank; TEMT estimates them from city names or PIN codes. Every row is validated before anything is saved, and you can download an error report. TEMT also reads **bulk templates from earlier TEMT versions** (road, courier, rail, air, coastal and international water) and **e-way bill JSON** exports.",
    actions: [{ label: "Go to bulk import", href: "/app/import/" }],
  },
  {
    id: "howto-ewaybill", kind: "howto", title: "Use e-way bill data",
    keywords: ["e-way", "eway", "ewb", "e way bill", "gst", "transdistance", "invoice"],
    body: "Export your e-way bills as JSON from the GST e-way bill portal or your ERP and drop the file into **Bulk import**. TEMT reads origin and destination PIN codes, the declared transport distance, the mode and date, and converts item quantities recorded in KGS, QTL, MTS or TON to tonnes. Where weight isn't declared, you set a default weight before importing.",
    actions: [{ label: "Go to bulk import", href: "/app/import/" }],
  },
  {
    id: "howto-compare", kind: "howto", title: "Compare transport modes",
    keywords: ["compare", "which mode", "greener", "best mode", "rail vs road", "alternatives", "mode shift", "cleanest"],
    body: "Open **Compare modes**, enter origin, destination and weight. TEMT builds door-to-door options for road, rail (with road drayage), air (via nearest airports) and coastal shipping (via nearest ports) and ranks them. You can save any option as a shipment. Ask me: “compare 25 t Chennai to Delhi”.",
    actions: [{ label: "Compare modes", href: "/app/compare/" }],
  },
  {
    id: "howto-chain", kind: "howto", title: "Build a multimodal transport chain",
    keywords: ["chain", "multimodal", "intermodal", "multi leg", "legs", "transport chain", "tce", "door to door"],
    body: "Open **Transport chain**, start from a template (rail intermodal, export via port, air express, courier) or a blank chain. Each leg has its own mode, distance and vehicle; add hubs between legs. The diagram and totals update as you edit. Save the chain as one shipment.",
    actions: [{ label: "Open the chain builder", href: "/app/chain/" }],
  },
  {
    id: "howto-reports", kind: "howto", title: "Reports and exports",
    keywords: ["report", "export", "download", "pdf", "excel", "xlsx", "csv", "word", "docx", "json", "power bi", "powerbi", "board", "share"],
    body: "Open **Reports**, choose the financial year and filters, and read the report on screen. Export as **PDF** (board-ready), **Excel** (formatted workbook with summary, shipments, legs, factors and BRSR sheets), **Word** (editable narrative), **CSV**, **JSON** (for ERP and data lakes) or a **Power BI pack** (star-schema tables, DAX measures and Power Query). Every export states the factor set, engine version and data quality.",
    actions: [{ label: "Open reports", href: "/app/reports/" }],
  },
  {
    id: "howto-planner", kind: "howto", title: "Plan reductions against a target",
    keywords: ["planner", "target", "reduce", "reduction", "decarbonise", "decarbonize", "net zero", "sbti", "levers", "scenario", "what if", "pathway"],
    body: "Open **Reduction planner**. Pick a baseline year, set a target, then adjust levers: road-to-rail shift, truck consolidation, air-to-road shift, electric vehicles with a chosen electricity factor, and better load factors. The waterfall shows each lever's effect on your own shipments, recalculated with the same engine, and whether you reach the target.",
    actions: [{ label: "Open the planner", href: "/app/planner/" }],
  },
  {
    id: "privacy", kind: "product", title: "Where is my data stored?",
    keywords: ["privacy", "data", "stored", "secure", "security", "confidential", "cloud", "server", "upload", "backup", "local", "account", "sign in", "sync"],
    body: "Your workspace lives **privately in this browser** (IndexedDB). It is uploaded only if you **sign in**, which keeps a copy in your TEMT account (sent over HTTPS) and syncs it across devices, or if you run the server check. The Copilot runs in your browser. Without an account, use **Settings → Backup** to move a workspace file between devices.",
    actions: [{ label: "Account and sync", href: "/app/account/" }, { label: "Backup and restore", href: "/app/settings/#data" }],
  },
  {
    id: "credentials", kind: "product", title: "TEMT's credentials",
    keywords: ["credentials", "dpiit", "ulip", "government", "iimb", "tci", "why temt", "trust", "certified", "27001", "adopted", "national"],
    body: "- Developed by the **TCI–IIMB Supply Chain Sustainability Lab**, part of the **Supply Chain Management Centre** at IIM Bangalore (founded with Transport Corporation of India in 2023).\n- **First platform in India with ISO 14083 certification** for transport emissions (December 2024).\n- **ISO/IEC 27001:2022** certified information security (SGS).\n- **Adopted by DPIIT**, Ministry of Commerce and Industry, with its emission factors API **integrated with ULIP**.\n- Contact: scmc.office@iimb.ac.in",
  },
  {
    id: "copilot", kind: "product", title: "What the Copilot can do",
    keywords: ["copilot", "assistant", "chatbot", "ai", "agent", "what can you do", "help", "capabilities", "local model", "ollama"],
    body: "I run inside your browser and can: calculate a shipment from a sentence, compare modes, save shipments, summarise your footprint and hotspots, find reduction opportunities, run what-if scenarios, export reports, change settings, explain any concept and give you a guided tour. Optionally, connect a local model (Ollama or LM Studio) in Settings for free-form conversation, still without your data leaving your machine.",
  },
];

const STOP = new Set(["the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or", "what", "how", "do", "i", "my", "me", "can", "does", "it", "with", "by", "we", "our", "you", "your", "be", "this", "that", "about", "tell", "please", "explain"]);
export const tokens = (text: string) => text.toLowerCase().replace(/[^a-z0-9₹%+.\s-]/g, " ").split(/\s+/).filter((word) => word && !STOP.has(word));

// "well-to-tank", "well to tank" and "tonne–km" should all match the same keyword.
const loose = (text: string) => ` ${text.toLowerCase().replace(/[-–—_/]+/g, " ").replace(/[^a-z0-9₹%+.\s]/g, " ").replace(/\s+/g, " ").trim()} `;

export function searchKnowledge(query: string, limit = 3) {
  const q = loose(query);
  const words = tokens(query.replace(/[-–—_/]+/g, " "));
  return ARTICLES.map((article) => {
    let score = 0;
    for (const keyword of article.keywords) { const k = loose(keyword).trim(); if (q.includes(k)) score += k.includes(" ") ? 6 : 4; }
    const hay = `${article.title} ${article.keywords.join(" ")}`.toLowerCase();
    for (const word of words) { if (word.length > 2 && hay.includes(word)) score += 1.2; if (article.body.toLowerCase().includes(word)) score += 0.3; }
    return { article, score };
  }).filter((item) => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit);
}
