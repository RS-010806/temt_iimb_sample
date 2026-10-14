/** Chapters of the product walkthrough video (seconds), generated from video/src/demo-data.json. */
// The file names carry the recording date so browsers and the CDN never serve an earlier cut.
export const TOUR_VIDEO = {
  src: "/video/temt-tour-2026-10-14.mp4",
  poster: "/video/temt-tour-2026-10-14-poster.jpg",
  captions: "/video/temt-tour-2026-10-14.vtt",
  durationSeconds: 290,
  published: "2026-10-14",
  chapters: [
    { at: 0, title: "TEMT from IIM Bangalore" },
    { at: 13, title: "The website" },
    { at: 29, title: "Getting started" },
    { at: 38, title: "Overview" },
    { at: 56, title: "Quick calculate" },
    { at: 65, title: "Calculator" },
    { at: 129, title: "Compare modes" },
    { at: 139, title: "Transport chains" },
    { at: 153, title: "Bulk import" },
    { at: 166, title: "Shipment ledger" },
    { at: 174, title: "Account and sync" },
    { at: 189, title: "Reports" },
    { at: 209, title: "Exports" },
    { at: 231, title: "Reduction planner" },
    { at: 240, title: "Factors and settings" },
    { at: 257, title: "TEMT Copilot" },
    { at: 272, title: "Guided tour" },
    { at: 276, title: "Measure your next shipment" },
  ],
} as const;
