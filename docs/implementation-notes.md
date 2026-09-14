# TEMT product preview: implementation notes

The project pairs an interactive enterprise landing page with a shipment-analysis workspace and API. The [case study](../artifacts/deliverables/TEMT-Product-Case-Study.pdf), [editable document](../artifacts/deliverables/TEMT-Product-Case-Study.docx), [source register](SOURCES.md) and [measured verification](verification.md) document the implementation and its evidence.

## Product intention

Help Indian enterprise sustainability, supply-chain and finance teams understand freight emissions, try a useful scenario and inspect the calculation evidence. NIFTY 500 companies are the primary commercial audience. The experience also supports companies outside that index through sector scenarios and CSV import.

The opening answers what the product measures, how an alternative mode changes an estimate, and how to explore the inputs. Four animated chapters connect freight activity, its baseline, a comparison and reporting evidence. The integrated estimator immediately displays the calculated result and carries its inputs into the demo.

## Experience and boundaries

- Road, rail, air and ocean illustrations expose factors, units and operating assumptions.
- Four sector networks show synthetic shipment routes and calculated mode contributions. Company search uses a dated official NSE snapshot containing 501 source records.
- A three-row pipeline demonstrates validation, calculation and aggregation. A missing-load experiment excludes the entire affected shipment, keeping partial journeys out of the total.
- Landing analytics preview the same synthetic FMCG data as the workspace. Chart tables show calculated values to two decimal places in kgCO₂e.
- The workspace supports editable shipment legs, filters, CSV import, scenario comparison, CSV/PDF export and a Power BI import pack.
- Native controls, keyboard tab navigation, visible focus, pause/play, reduced-motion preferences and responsive layouts support access.

Institutional references open their published evidence. Existing TEMT v1.3 methodology validation does not certify this separate demonstration engine. Company selection does not imply actual customer activity or a customer relationship. Equal-distance modal comparisons do not establish route feasibility, capacity, cost or customer savings. Freight evidence contributes to corporate reporting; it is not a complete corporate inventory or independent proof of BRSR compliance.

## Architecture

The npm workspaces are `apps/web`, `apps/api` and `packages/calculator`. Next.js 16.3.5, React 19.3.0 and Tailwind CSS 4.3.3 provide a static frontend delivered through Render's CDN. Local fonts and responsive AVIF photography support the visual design. Native CSS/SVG animation supplies the freight story; Recharts and Lucide provide workspace charts and icons. The hero imports the lightweight `@temt/calculator/preview` entry point. Full pipeline validation loads on interaction; workspace charts and report-generation libraries load separately. No live carrier, company or Power BI connection is implemented.

A stateless Express 5 API validates and calculates requested shipment records in memory. It uses Helmet, exact browser origins, a process-local limit of 60 requests per minute per IP, a 2 MiB body limit and a 1,000-leg cap. Health checks and CORS preflights are exempt from the rate limit. CORS is not authentication; requests without an Origin header are permitted. The service does not persist shipment records or log request bodies.

The shared TypeScript engine uses Zod to validate input, applies versioned GLEC v3.2 well-to-wheel defaults, and sums `tonnes × kilometres × factor` without intermediate rounding. An invalid, duplicate or missing leg excludes the whole identifiable shipment before filters are applied. A valid consecutive sequence cannot reveal an unsubmitted final leg, so the caller remains responsible for complete shipment data. The [calculator contract](../packages/calculator/README.md) lists factor values and assumptions.

CSV import validates the complete file before replacing the current dataset. Any row error rejects that import; it does not partially load the valid rows. Ledger edits and API analysis expose excluded shipments and their row-level errors. CSV exports preserve full numeric values and escape spreadsheet formula prefixes. PDF and Power BI files are generated in the browser from the current filtered analysis. The Power BI ZIP contains the shipment ledger, summary, exceptions, factor register, field definitions, Power Query instructions, DAX measures and README; it does not contain a hosted dashboard.

The hero links to `/demo/?quick=1&tonnes=1000&km=1000&rail=30`. A valid quick URL requires one value for every parameter, finite tonnes from 1 to 1,000,000, kilometres from 1 to 20,000, and rail share from 0 to 100. It seeds the synthetic road leg `QUICK-001`, dated 14 September 2026, under the name **Quick freight scenario**. The default produces 66.30 tCO₂e baseline and 16.71 tCO₂e potential reduction. Invalid quick URLs use the normal demo. Sector/company selection or a successful CSV import clears the quick identity; resetting filters retains the existing dataset.

Source snapshots, retrieval metadata and hashes remain in the repository. CI checks source integrity, TypeScript, calculation/API tests and both production builds. Render builds the static site and Singapore API independently from the repository root after CI passes. The free API can sleep, while the local calculation is available immediately. After eight seconds of a pending server request, **Process in browser** allows manual cancellation. Failure or a 90-second timeout uses the local fallback automatically. Edits cancel pending requests and prevent stale responses from replacing the new result.

## Delivery and validation

- Live site: https://temt-iimb-sample.onrender.com
- Working demo: https://temt-iimb-sample.onrender.com/demo/
- Repository: https://github.com/RS-010806/temt_iimb_sample
- Reports and Power BI files: linked from the website and root README.

The cinematic application release `81f7a0b` passed 112 automated tests and the published Lighthouse audits recorded performance 91 mobile / 100 desktop and accessibility 100 on both. These are lab observations under the conditions in the verification record, not production guarantees. Native file-picker automation and an OS reduced-motion toggle were not automated on the test machine; the record distinguishes code/test coverage from browser observations. The Power BI pack is verified for file structure and numerical reconciliation; it has not been exercised in Power BI Desktop.

Case-study page renders, screenshot provenance, report hashes, PDF font embedding and hyperlink checks are recorded in [case-study QA](case-study-qa.md). The [UX research record](ux-research.md) explains the design decisions and supporting references.

## Reproduction

Use Node 22.23.2 and `npm ci`. The root README provides development, test and build commands. `npm run samples:generate` regenerates the public example PDF, CSV and Power BI ZIP through the same export functions as the workspace. See [deployment.md](deployment.md) for the two free Render services and [case-study-production.md](case-study-production.md) for case-study generation. The original Apache 2.0 licence and third-party font/image credits are preserved.
