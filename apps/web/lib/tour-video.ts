/**
 * Chapters of the product walkthrough video (seconds), generated from video/src/demo-data.json after each render
 * (see video/README.md). Publishing a new cut also adds redirects from the previous file names in render.yaml.
 */
// The file names carry the recording date so browsers and the CDN never serve an earlier cut.
export const TOUR_VIDEO = {
  src: "/video/temt-tour-2026-11-05.mp4",
  poster: "/video/temt-tour-2026-11-05-poster.jpg",
  captions: "/video/temt-tour-2026-11-05.vtt",
  durationSeconds: 306,
  published: "2026-11-05",
  chapters: [
    { at: 0, title: "TEMT from IIM Bangalore" },
    { at: 13, title: "The website" },
    { at: 29, title: "Getting started" },
    { at: 39, title: "Overview" },
    { at: 56, title: "Quick calculate" },
    { at: 66, title: "Calculator" },
    { at: 131, title: "Compare modes" },
    { at: 141, title: "Shipments with several stops" },
    { at: 163, title: "Bulk import" },
    { at: 180, title: "Shipment ledger" },
    { at: 189, title: "Account and sync" },
    { at: 204, title: "Reports" },
    { at: 226, title: "Exports" },
    { at: 247, title: "Reduction planner" },
    { at: 256, title: "Factors and settings" },
    { at: 274, title: "TEMT Copilot" },
    { at: 288, title: "Guided tour" },
    { at: 293, title: "Measure your next shipment" },
  ],
} as const;
