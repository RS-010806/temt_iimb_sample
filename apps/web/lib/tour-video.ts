/**
 * Chapters of the product walkthrough video (seconds), generated from video/src/demo-data.json after each render
 * (see video/README.md). Publishing a new cut also adds redirects from the previous file names in render.yaml.
 */
// The file names carry the recording date so browsers and the CDN never serve an earlier cut.
export const TOUR_VIDEO = {
  src: "/video/temt-tour-2026-11-06b.mp4",
  poster: "/video/temt-tour-2026-11-06b-poster.jpg",
  captions: "/video/temt-tour-2026-11-06b.vtt",
  durationSeconds: 315,
  published: "2026-11-06",
  chapters: [
    { at: 0, title: "TEMT from IIM Bangalore" },
    { at: 13, title: "The website" },
    { at: 29, title: "Getting started" },
    { at: 39, title: "Overview" },
    { at: 56, title: "Quick calculate" },
    { at: 66, title: "Calculator" },
    { at: 132, title: "Compare modes" },
    { at: 142, title: "Shipments with several stops" },
    { at: 165, title: "Bulk import" },
    { at: 181, title: "Shipment ledger" },
    { at: 190, title: "Account and sync" },
    { at: 206, title: "Reports" },
    { at: 232, title: "Exports" },
    { at: 253, title: "Reduction planner" },
    { at: 262, title: "Factors and settings" },
    { at: 282, title: "TEMT Copilot" },
    { at: 297, title: "Guided tour" },
    { at: 301, title: "Measure your next shipment" },
  ],
} as const;
