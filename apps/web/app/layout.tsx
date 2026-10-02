import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GlobalWidgets } from "@/components/global-widgets";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, pageMetadata } from "@/components/seo";

const title = "TEMT | Transportation Emission Measurement Tool · IIM Bangalore";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: "TEMT",
  authors: [{ name: "TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore", url: "https://www.iimb.ac.in/tci-supply-chain-sustainability-lab" }],
  creator: "TCI–IIMB Supply Chain Sustainability Lab",
  publisher: "TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore",
  category: "business",
  keywords: ["freight emissions", "ISO 14083", "Scope 3 Category 4", "BRSR Principle 6", "logistics carbon footprint India", "transport emissions calculator", "TEMT", "IIM Bangalore"],
  ...pageMetadata({ description: SITE_DESCRIPTION, path: "/" }),
  alternates: undefined,
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
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
