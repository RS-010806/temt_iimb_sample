import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/seo";

export const dynamic = "force-static";

// The public pages are open to search engines and AI answer engines; the workspace and sign-in hold no public content.
const PRIVATE = ["/app/", "/demo/", "/signin/"];
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }, { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
