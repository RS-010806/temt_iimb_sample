import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap { const base=process.env.NEXT_PUBLIC_SITE_URL; return base?['/','/methodology/','/privacy/'].map(path=>({url:base+path,changeFrequency:'monthly' as const,priority:path==='/'?1:.5})):[]; }
