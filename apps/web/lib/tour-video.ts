/** Chapters of the product walkthrough video (seconds), generated from video/src/demo-data.json. */
// The file names carry the recording date so browsers and the CDN never serve an earlier cut.
export const TOUR_VIDEO = {
  src: "/video/temt-tour-2026-10-24.mp4",
  poster: "/video/temt-tour-2026-10-24-poster.jpg",
  captions: "/video/temt-tour-2026-10-24.vtt",
  durationSeconds: 292,
  published: "2026-10-24",
  chapters: [
    { at: 0, title: "TEMT from IIM Bangalore" },
    { at: 13, title: "The website" },
    { at: 28, title: "Getting started" },
    { at: 38, title: "Overview" },
    { at: 55, title: "Quick calculate" },
    { at: 65, title: "Calculator" },
    { at: 130, title: "Compare modes" },
    { at: 140, title: "Shipments with several stops" },
    { at: 161, title: "Bulk import" },
    { at: 174, title: "Shipment ledger" },
    { at: 182, title: "Account and sync" },
    { at: 197, title: "Reports" },
    { at: 212, title: "Exports" },
    { at: 232, title: "Reduction planner" },
    { at: 241, title: "Factors and settings" },
    { at: 259, title: "TEMT Copilot" },
    { at: 273, title: "Guided tour" },
    { at: 278, title: "Measure your next shipment" },
  ],
} as const;
