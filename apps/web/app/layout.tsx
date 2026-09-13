import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: 'TEMT | Freight decisions. Backed by carbon data.', template: '%s | TEMT' },
  description: 'Explore India-focused freight emissions intelligence. Compare modes, analyze sample shipments, and build a traceable reporting trail with the TEMT enterprise preview.',
  openGraph: { type: 'website', title: 'TEMT | Freight decisions. Backed by carbon data.', description: 'An interactive enterprise freight emissions preview for the teams moving India.', ...(siteUrl ? { url: siteUrl, images: [{url: `${siteUrl}/og.png`, width:1536, height:1024, alt:'TEMT. Freight decisions. Backed by carbon data.'}] } : {}) },
  twitter: { card: 'summary_large_image', title: 'TEMT | Freight decisions. Backed by carbon data.', ...(siteUrl ? {images:[`${siteUrl}/og.png`]} : {}) },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><head><link rel="preload" href="/fonts/barlow-condensed-600.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><link rel="preload" href="/fonts/manrope-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
