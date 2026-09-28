import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TEMT · Transportation Emission Measurement Tool",
    short_name: "TEMT",
    description: "Measure, report and reduce freight emissions with India-specific factors, from IIM Bangalore.",
    id: "/app/",
    start_url: "/app/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#740000",
    categories: ["business", "productivity"],
    lang: "en-IN",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
