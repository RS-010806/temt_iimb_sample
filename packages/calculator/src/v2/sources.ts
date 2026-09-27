/** Every factor in the library cites one of these published sources. */
export interface Source {
  id: SourceId;
  title: string;
  publisher: string;
  year: number;
  url: string;
  note?: string;
}

export type SourceId = "glec-3.2" | "temt-production" | "cea-21" | "iso-14083" | "ghg-protocol-scope3";

export const SOURCES: Readonly<Record<SourceId, Source>> = Object.freeze({
  "glec-3.2": {
    id: "glec-3.2",
    title: "Global Logistics Emissions Council Framework v3.2",
    publisher: "Smart Freight Centre",
    year: 2025,
    url: "https://smartfreightcentre.org/news/13311209",
    note: "Indian road intensities in Table 13 are based on research by the TCI–IIMB Supply Chain Sustainability Lab.",
  },
  "temt-production": {
    id: "temt-production",
    title: "Production TEMT factor set (iimb.freightemissions.com)",
    publisher: "TCI–IIMB Supply Chain Sustainability Lab",
    year: 2024,
    url: "https://iimb.freightemissions.com/",
    note: "Values as used by the production TEMT platform, reproduced for reconciliation with existing TEMT records.",
  },
  "cea-21": {
    id: "cea-21",
    title: "CO2 Baseline Database for the Indian Power Sector, Version 21.0",
    publisher: "Central Electricity Authority, Ministry of Power",
    year: 2025,
    url: "https://cea.nic.in/cdm-co2-baseline-database/?lang=en",
    note: "All-India weighted average emission factor for FY 2024–25, including cross-border transfers: 0.710 tCO2/MWh.",
  },
  "iso-14083": {
    id: "iso-14083",
    title: "ISO 14083:2023 Greenhouse gases — Quantification and reporting of GHG emissions arising from transport chain operations",
    publisher: "International Organization for Standardization",
    year: 2023,
    url: "https://www.iso.org/standard/78864.html",
  },
  "ghg-protocol-scope3": {
    id: "ghg-protocol-scope3",
    title: "Corporate Value Chain (Scope 3) Accounting and Reporting Standard",
    publisher: "World Resources Institute and WBCSD",
    year: 2011,
    url: "https://ghgprotocol.org/corporate-value-chain-scope-3-standard",
  },
});
