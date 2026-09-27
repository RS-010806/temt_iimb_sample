import type { NextConfig } from 'next';

// Vercel provides the production host at build time; other hosts set NEXT_PUBLIC_SITE_URL.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@temt/calculator'],
  poweredByHeader: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_SITE_URL: siteUrl },
};
export default nextConfig;
