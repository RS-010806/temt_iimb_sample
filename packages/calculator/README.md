# Shared emissions engine

`analyze(rows)` powers both the local demonstration and `POST /api/analyze`. The same versioned, unrounded calculation is used in both paths. Only the timestamp and measured processing duration vary between runs.

Inputs use tonnes, kilometres and ISO calendar dates. Each shipment's `legIndex` starts at 1 and must be consecutive. A missing or mismatched profile, invalid leg, duplicate `(shipmentId, legIndex)` or missing index excludes the **whole identifiable shipment**. Every rejected input row receives an error at its original zero-based index. An invalid row without an identifiable shipment ID can only be excluded individually. A consecutive sequence cannot establish whether an unsubmitted final leg exists: callers remain responsible for supplying complete shipments.

`byMode` always returns road, rail, ocean and air, including zero values. Other aggregates are ordered alphabetically by subsidiary and chronologically by month. `rows` preserves input order. A batch contains at most 1,000 legs. Empty batches return zero totals. Numeric inputs are finite and positive, and each leg's tonne-kilometres cannot exceed JavaScript's maximum safe integer.

## Methodology

For each leg: `tonnes × kilometres × factor = kg CO₂e`. Factors are published well-to-wheel (WTW) defaults from the [Smart Freight Centre GLEC Framework v3.2, October 2025](https://smartfreightcentre.org/news/13311209). `FACTORS` exposes exact sources, pages, version and assumptions.

| Profile | kg CO₂e / tonne-km | Source page |
| --- | ---: | ---: |
| `road-hcv` | 0.0663 | 106 |
| `rail-india` | 0.0106 | 97 |
| `ocean-container` | 0.01145 | 112 |
| `air-short` | 1.363 | 94 |
| `air-long` | 0.788 | 94 |

Road refers to an Indian diesel HCV with 30–50 t GVW. Rail is India's mixed-traction average. Ocean uses the Intra Middle East / India dry-container factor of 114.5 g CO₂e/TEU-km, converted at an explicit 10 tonnes/TEU. Air uses an unknown aircraft mix, with this demo assigning exactly 1,500 km to short-haul; longer legs require the long-haul profile. Published road, sea and air distance adjustments are already embedded and are not applied twice.

These are default estimates, not measured carrier emissions, certified calculations or a complete corporate inventory. Indian road and rail defaults are preliminary and subject to review. Hub operations, refrigerant leakage and unsubmitted first/last-mile legs are excluded. Different modes require different route distances and operating constraints; a shared distance is only an intensity illustration.

`compareFreightMix(1000, 1000, 30)` compares a hypothetical equal-distance road baseline with a 30% rail share. It returns baseline 66,300 kg, scenario 49,590 kg, saving 16,710 kg, approximately 25.20%. It does not establish route feasibility or predict actual operational savings.
