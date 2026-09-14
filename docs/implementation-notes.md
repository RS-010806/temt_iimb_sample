# TEMT product preview: implementation notes

The completed project pairs a cinematic enterprise landing page with a working shipment-analysis workspace and API. The [five-page case study](../artifacts/deliverables/TEMT-Product-Case-Study.pdf), [editable document](../artifacts/deliverables/TEMT-Product-Case-Study.docx), [source register](SOURCES.md) and [measured verification](verification.md) document the shipped result.

## Product intention

Help Indian enterprise sustainability, supply-chain and finance teams understand freight emissions, try a useful scenario and inspect the calculation evidence. NIFTY 500 companies are the primary commercial audience. The experience also supports companies outside that index through sector scenarios and CSV import.

The opening answers what the product measures, how an alternative mode changes an estimate, and how to explore the inputs. Four animated chapters connect freight activity, its baseline, a comparison and reporting evidence. The integrated estimator immediately displays the calculated result and carries its inputs into the demo.

## Experience and boundaries

- Road, rail, air and ocean illustrations expose factors, units and operating assumptions.
- Four sector networks show synthetic shipment routes and calculated mode contributions. Company search uses a dated official NSE snapshot containing 501 source records.
- A three-row pipeline demonstrates validation, calculation and aggregation. A missing-load experiment excludes the entire affected shipment, keeping partial journeys out of the total.
- Landing analytics preview the same synthetic FMCG data as the workspace. Exact chart values remain available as readable tables.
- The workspace supports editable shipment legs, filters, CSV import, scenario comparison, CSV/PDF export and a Power BI import pack.
- Native controls, keyboard tab navigation, visible focus, pause/play, reduced-motion preferences and responsive layouts support access.

Institutional references open their published evidence. Existing TEMT v1.3 methodology validation does not certify this separate demonstration engine. Company selection does not imply actual customer activity or a customer relationship. Equal-distance modal comparisons do not establish route feasibility, capacity, cost or customer savings. Freight evidence contributes to corporate reporting; it is not a complete corporate inventory or independent proof of BRSR compliance.

## Architecture

Next.js, React and Tailwind provide a static frontend delivered through Render's CDN. Local fonts and responsive AVIF photography support the visual design. Native CSS/SVG animation supplies the freight story; Recharts and Lucide provide workspace charts and icons. The landing calculator operates independently of the API.

A stateless Express API validates and calculates requested shipment records in memory. It uses explicit browser origins, rate limits, a 2 MB request limit and a 1,000-leg cap. It does not persist shipment records or log request bodies. A shared, versioned TypeScript package aligns browser and server calculations without intermediate rounding. Report files are assembled in the browser from the resulting data and metadata.

Source snapshots, retrieval metadata and hashes remain in the repository. CI checks source integrity, TypeScript, calculation/API tests and both production builds. The free Render backend can sleep; the interface offers browser processing after eight seconds and identifies where a result was calculated.

## Delivery and validation

- Live site: https://temt-iimb-sample.onrender.com
- Working demo: https://temt-iimb-sample.onrender.com/demo/
- Repository: https://github.com/RS-010806/temt_iimb_sample
- Reports and Power BI files: linked from the website and root README.

The cinematic application release passed 112 automated tests and the published Lighthouse audits recorded performance 91 mobile / 100 desktop and accessibility 100 on both. These are lab observations under the conditions in the verification record, not production guarantees. Native file-picker automation and an OS reduced-motion toggle were not automated on the test machine; the record distinguishes code/test coverage from browser observations.

All five case-study pages were rendered and visually inspected. Screenshot provenance, report hashes, PDF font embedding and hyperlink checks are recorded in [case-study QA](case-study-qa.md). The [UX research record](ux-research.md) explains the design decisions and supporting references.

## Reproduction

Use Node 22.23.2 and `npm ci`. The root README provides development, test and build commands. See [deployment.md](deployment.md) for the two free Render services and [case-study-production.md](case-study-production.md) for report generation. The original Apache 2.0 licence and third-party font/image credits are preserved.
