import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@temt/calculator'],
  poweredByHeader: false,
  reactStrictMode: true,
};
export default nextConfig;
