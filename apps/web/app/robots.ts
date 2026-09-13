import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots { return {rules:{userAgent:'*',allow:'/',disallow:'/demo/'},...(process.env.NEXT_PUBLIC_SITE_URL?{sitemap:`${process.env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`}:{})}; }
