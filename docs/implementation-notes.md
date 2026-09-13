# TEMT product preview: implementation notes

This is working handoff copy. The final project document will use the completed site's screenshots and verified test and deployment results.

## Product intention

Help an Indian enterprise buyer understand freight-emissions visibility quickly, try an illustrative scenario, and see the route from shipment records to a useful emissions report. The primary audience is sustainability, supply-chain and finance teams at NIFTY 500 companies. A general enterprise scenario also supports companies outside that index.

The first interaction should answer three questions: what the product measures, what the result helps a team decide, and how to try it. Strong typography, real freight imagery and a concise product preview support that sequence. Motion should clarify state changes and respect reduced-motion preferences.

## Experience

The experience is built around multimodal calculation, scenario comparison, analytics and report output. A company-name search uses an official NSE snapshot to personalize the context. Metrics remain synthetic demonstration data, even when the selected company name is real.

Institutional references link to published evidence. Existing product verification is carefully scoped to its published version. The new website and example calculator do not inherit the original product's certification, integrations or customer relationships.

## Architecture

- Next.js, React and Tailwind provide the responsive frontend. Motion, Recharts and Lucide support interaction, charting and recognizable controls.
- The frontend exports static HTML, CSS and JavaScript to Render's CDN for immediate page delivery.
- A separate Node API demonstrates server-side calculation and reporting without storing uploaded records persistently.
- A pure TypeScript calculator package keeps browser and server calculations aligned.
- Source data is checked into the repository with a retrieval timestamp, raw snapshot and hash. CI verifies that published company fields match the retained source.
- API calls use the actual public service URL and a configured CORS origin list. Starting or unavailable API states must leave the local estimator usable.

## Local and deployment commands

Install dependencies with `npm ci --include=dev`. The repository exposes `npm run build:calculator`, `npm run check`, `npm test`, `npm run build:web` and `npm run build:api`. Follow the final root README for development start commands.

See [deployment.md](deployment.md) for the Render configuration and actual-URL setup, and [SOURCES.md](SOURCES.md) for product, market, imagery and methodology references.

## Final document outline

1. **The proposition:** audience, core buyer problem, final hero screenshot and concise project outcome.
2. **The first ten seconds:** value proposition, choice of imagery and typography, CTA hierarchy and mobile screenshot.
3. **From shipments to decisions:** estimator and pipeline screenshots, genuine interactive behavior and what each result means.
4. **What makes the implementation dependable:** frontend/API architecture, shared calculation logic, responsiveness, accessibility and actual test evidence.
5. **Delivery and next steps:** live URL and repository, achieved scope, measured results, source links and the remaining steps for a production integration.

Target deliverables are a five-page illustrated PDF and an editable DOCX. Illustrations will use screenshots of the finished implementation. The editable document will be rendered to page images and every page visually reviewed before delivery.

## Evidence pending final implementation

Final screenshots, deployed URLs and commit, successful CI run, interaction checks, calculation consistency, browser console findings, responsive inspection and any measured performance results will be inserted only after verification. Do not replace missing evidence with realistic-looking sample metrics.
