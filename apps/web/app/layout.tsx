import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GlobalWidgets } from "@/components/global-widgets";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const title = "TEMT | Transportation Emission Measurement Tool · IIM Bangalore";
const description = "Measure, report and reduce freight emissions across road, rail, air, sea and inland waterways with India-specific, ISO 14083-aligned factors from the TCI–IIMB Supply Chain Sustainability Lab.";

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: title, template: "%s | TEMT · IIM Bangalore" },
  description,
  openGraph: { type: "website", title, description, ...(siteUrl ? { url: siteUrl, images: [{ url: `${siteUrl}/og.png`, width: 1536, height: 1024, alt: "TEMT, the Transportation Emission Measurement Tool from IIM Bangalore" }] } : {}) },
  twitter: { card: "summary_large_image", title, description, ...(siteUrl ? { images: [`${siteUrl}/og.png`] } : {}) },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#740000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preload" href="/fonts/open-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/playfair-display-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <GlobalWidgets />
      </body>
    </html>
  );
}
