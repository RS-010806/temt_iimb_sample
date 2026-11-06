/** Every factor in the library cites one of these published sources. */
export interface Source {
  id: SourceId;
  title: string;
  publisher: string;
  year: number;
  url: string;
  note?: string;
}

export type SourceId = "glec-3.3" | "temt" | "cea-22" | "iso-14083" | "ghg-protocol-scope3";

export const SOURCES: Readonly<Record<SourceId, Source>> = Object.freeze({
  "glec-3.3": {
    id: "glec-3.3",
    title: "Global Logistics Emissions Council Framework v3.3",
    publisher: "Smart Freight Centre",
    year: 2026,
    url: "https://www.smartfreightcentre.org/en/our-programs/global-logistics-emissions-council/",
    note: "India values for road, electric trucks, rail and domestic air are developed by SFC India and the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore; hubs use the global Fraunhofer IML defaults, which include Indian hubs.",
  },
  temt: {
    id: "temt",
    title: "TEMT emission factors",
    publisher: "TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore",
    year: 2024,
    url: "https://www.iimb.ac.in/tci-supply-chain-sustainability-lab",
    note: "India-specific factors validated through TEMT's ISO 14083 certification (December 2024).",
  },
  "cea-22": {
    id: "cea-22",
    title: "CO2 Baseline Database for the Indian Power Sector, Version 22.0",
    publisher: "Central Electricity Authority, Ministry of Power",
    year: 2026,
    url: "https://cea.nic.in/cdm-co2-baseline-database/?lang=en",
    note: "All-India weighted average for FY 2025–26, adjusted for cross-border transfers: 0.675 tCO2/MWh (Table S). As in GLEC v3.3's Indian values, TEMT applies it at the point of use with transmission and distribution losses and upstream fuel production: 0.903 kg CO2e/kWh.",
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
