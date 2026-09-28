import type { ReportModel } from "../report-model";
import { downloadBlob, legCsvRows, round, toCsv } from "./common";

const MEASURES = `// TEMT measures. Create each in the fact_legs table (Modeling > New measure).
Emissions tCO2e = DIVIDE ( SUM ( fact_legs[wtw_kgco2e] ), 1000 ) + DIVIDE ( SUM ( fact_hubs[wtw_kgco2e] ), 1000 )
Vehicle operation tCO2e (TTW) = DIVIDE ( SUM ( fact_legs[ttw_kgco2e] ), 1000 )
Energy provision tCO2e (WTT) = DIVIDE ( SUM ( fact_legs[wtt_kgco2e] ), 1000 )
Hub operations tCO2e = DIVIDE ( SUM ( fact_hubs[wtw_kgco2e] ), 1000 )
Tonne-km = SUM ( fact_legs[tonne_km] )
Intensity gCO2e per tkm = DIVIDE ( SUM ( fact_legs[wtw_kgco2e] ) * 1000, [Tonne-km] )
Shipments = DISTINCTCOUNT ( fact_legs[shipment_ref] )
Primary data share = DIVIDE ( CALCULATE ( SUM ( fact_legs[wtw_kgco2e] ), fact_legs[data_quality] = "Primary" ), SUM ( fact_legs[wtw_kgco2e] ) )
Scope 3 Cat 4 tCO2e = DIVIDE ( CALCULATE ( SUM ( fact_legs[wtw_kgco2e] ), fact_legs[ghg_scope] = "Scope 3 · Cat 4" ), 1000 )
Scope 3 Cat 9 tCO2e = DIVIDE ( CALCULATE ( SUM ( fact_legs[wtw_kgco2e] ), fact_legs[ghg_scope] = "Scope 3 · Cat 9" ), 1000 )
Emissions previous FY = CALCULATE ( [Emissions tCO2e], DATEADD ( dim_date[date], -1, YEAR ) )
YoY change % = DIVIDE ( [Emissions tCO2e] - [Emissions previous FY], [Emissions previous FY] )
`;

const QUERY = `// Power Query (M). Home > Transform data > New source > Blank query > Advanced editor.
// Set FolderPath to the folder where you extracted this pack, then duplicate for each table.
let
    FolderPath = "C:\\\\TEMT\\\\",
    Source = Csv.Document(File.Contents(FolderPath & "fact_legs.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(Promoted, {
        {"date", type date}, {"leg_no", Int64.Type}, {"tonnes", type number}, {"distance_km", type number}, {"tonne_km", type number},
        {"ttw_kgco2e", type number}, {"wtt_kgco2e", type number}, {"wtw_kgco2e", type number}, {"intensity_gco2e_per_tkm", type number},
        {"factor_wtt", type number}, {"factor_ttw", type number}
    })
in
    Typed
`;

const THEME = {
  name: "TEMT · IIM Bangalore",
  dataColors: ["#B12322", "#2A72C4", "#BB7A08", "#0E9A88", "#7048B0", "#4F9420", "#D45B8A", "#3F58C8"],
  background: "#FFFFFF", foreground: "#1C1917", tableAccent: "#B12322",
  good: "#1F7A45", neutral: "#BB7A08", bad: "#B12322", maximum: "#740000", center: "#E8E3DB", minimum: "#FCF3F2",
  textClasses: { title: { fontFace: "Georgia", color: "#740000" }, label: { fontFace: "Segoe UI", color: "#4A4745" } },
};

function dateDimension(dates: string[]) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const start = new Date(`${sorted[0]!.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
  const rows: Record<string, unknown>[] = [];
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    const month = day.getUTCMonth() + 1, year = day.getUTCFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    rows.push({ date: iso, year, month, month_name: day.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }), fiscal_year: `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`, fiscal_quarter: `Q${Math.floor(((month + 8) % 12) / 3) + 1}`, fiscal_month_no: ((month + 8) % 12) + 1 });
  }
  return rows;
}

export async function buildPowerBiPack(model: ReportModel) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const legs = legCsvRows(model);
  zip.file("fact_legs.csv", await toCsv(legs));
  zip.file("fact_hubs.csv", await toCsv(model.hubs.map((hub) => ({ shipment_ref: hub.shipmentRef, date: hub.date, hub: hub.hub, hub_type: hub.type, wtw_kgco2e: round(hub.wtwKg), basis: hub.basis }))));
  zip.file("dim_shipments.csv", await toCsv(model.shipments as unknown as Record<string, unknown>[]));
  zip.file("dim_date.csv", await toCsv(dateDimension(model.shipments.map((row) => row.date))));
  zip.file("dim_mode.csv", await toCsv([{ mode: "Road", color: "#B12322" }, { mode: "Rail", color: "#2A72C4" }, { mode: "Air", color: "#BB7A08" }, { mode: "Sea", color: "#0E9A88" }, { mode: "Inland waterway", color: "#7048B0" }]));
  zip.file("dim_factors.csv", await toCsv(model.factorsUsed));
  zip.file("measures.dax", MEASURES);
  zip.file("fact_legs.pq", QUERY);
  zip.file("report-theme.json", JSON.stringify(THEME, null, 2));
  zip.file("README.md", `# TEMT Power BI pack

${model.organisation} · ${model.period} · ${model.factorSet.label} · engine ${model.engineVersion}

## Model
- **fact_legs**: one row per transport leg (emissions split TTW/WTT/WTW, tonne-km, factor, scope, data quality).
- **fact_hubs**: hub and terminal operations per shipment.
- **dim_shipments**: one row per shipment (reference, route, business unit, direction, who pays).
- **dim_date**: calendar with Indian financial year (April–March), fiscal quarter and month.
- **dim_mode**, **dim_factors**: lookup tables.

Relationships: fact_legs[shipment_ref] → dim_shipments[ref]; fact_hubs[shipment_ref] → dim_shipments[ref]; fact_legs[date] → dim_date[date]; fact_legs[mode] → dim_mode[mode].

## Steps
1. Extract this folder.
2. Power BI Desktop → Get data → Text/CSV → load each CSV (UTF-8). Or use fact_legs.pq in the Advanced editor and set FolderPath.
3. Model view → create the relationships above; mark dim_date as a date table.
4. Add the measures in measures.dax.
5. View → Themes → Browse for themes → report-theme.json for IIM Bangalore colours.

Emissions are reported in kg CO2e in the tables; the measures convert to tonnes. Figures are quantified to ISO 14083:2023 on a well-to-wheel basis with TEMT's India-specific emission factors.
`);
  return zip.generateAsync({ type: "blob" });
}

export async function exportPowerBi(model: ReportModel, stem: string) {
  downloadBlob(await buildPowerBiPack(model), `${stem}-power-bi.zip`);
}
