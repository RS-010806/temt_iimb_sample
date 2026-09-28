import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/seo";
import { TOUR_VIDEO } from "@/lib/tour-video";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "monthly", priority: 1, images: [`${SITE_URL}/og.png`] },
    {
      url: `${SITE_URL}/tour/`, lastModified, changeFrequency: "monthly", priority: 0.8,
      videos: [{ title: "TEMT product tour", description: "A narrated, end-to-end walkthrough of TEMT, IIM Bangalore's freight emissions platform.", thumbnail_loc: `${SITE_URL}${TOUR_VIDEO.poster}`, content_loc: `${SITE_URL}${TOUR_VIDEO.src}`, player_loc: `${SITE_URL}/tour/`, duration: TOUR_VIDEO.durationSeconds, publication_date: TOUR_VIDEO.published }],
    },
    { url: `${SITE_URL}/methodology/`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/why-temt/`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/privacy/`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
