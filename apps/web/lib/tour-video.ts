/** Chapters of the product walkthrough video (seconds), generated from video/src/demo-data.json. */
// The file names carry the recording date so browsers and the CDN never serve an earlier cut.
export const TOUR_VIDEO = {
  src: "/video/temt-tour-2026-10-03.mp4",
  poster: "/video/temt-tour-2026-10-03-poster.jpg",
  captions: "/video/temt-tour-2026-10-03.vtt",
  durationSeconds: 266,
  published: "2026-10-03",
  chapters: [
    { at: 0, title: "TEMT from IIM Bangalore" },
    { at: 13, title: "The website" },
    { at: 29, title: "Getting started" },
    { at: 38, title: "Overview" },
    { at: 56, title: "Quick calculate" },
    { at: 65, title: "Calculator" },
    { at: 113, title: "Compare modes" },
    { at: 123, title: "Transport chains" },
    { at: 137, title: "Bulk import" },
    { at: 147, title: "Shipment ledger" },
    { at: 156, title: "Account and sync" },
    { at: 170, title: "Reports" },
    { at: 186, title: "Exports" },
    { at: 206, title: "Reduction planner" },
    { at: 215, title: "Factors and settings" },
    { at: 233, title: "TEMT Copilot" },
    { at: 247, title: "Guided tour" },
    { at: 252, title: "Measure your next shipment" },
  ],
} as const;
