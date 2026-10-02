import type { Metadata } from "next";
import { FAQ } from "./marketing/faq-data";

/** Structured data and page metadata for search engines and AI answer engines. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://temt-iimb-sample.onrender.com").replace(/\/$/, "");
export const SITE_NAME = "TEMT · IIM Bangalore";
export const SITE_DESCRIPTION = "TEMT, from IIM Bangalore, measures and reduces freight emissions across road, rail, air, sea and inland waterways with India-specific emission factors, ISO 14083 certification and BRSR-ready reports.";
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "TEMT, the Transportation Emission Measurement Tool from IIM Bangalore" };

/** Title, description, canonical URL and social cards for one page. */
export function pageMetadata({ title, description, path, index = true }: { title?: string; description: string; path: string; index?: boolean }): Metadata {
  const full = title ? `${title} | ${SITE_NAME}` : "TEMT | Transportation Emission Measurement Tool · IIM Bangalore";
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "TEMT", locale: "en_IN", url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

export function JsonLd({ data }: { data: object | object[] }) {
  // Escape "<" so the JSON can never close the script element.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const breadcrumbs = (items: [name: string, path: string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: `${SITE_URL}${path}` })),
});

export const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "TCI–IIMB Supply Chain Sustainability Lab",
  alternateName: "TCI–IIMB Lab",
  url: "https://www.iimb.ac.in/tci-supply-chain-sustainability-lab",
  parentOrganization: { "@type": "CollegeOrUniversity", name: "Indian Institute of Management Bangalore", url: "https://www.iimb.ac.in" },
  address: { "@type": "PostalAddress", streetAddress: "Bannerghatta Road", addressLocality: "Bengaluru", addressRegion: "Karnataka", postalCode: "560076", addressCountry: "IN" },
};

/** Home page graph: the site, its publisher, the product and the questions answered on the page. */
export const HOME_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: "TEMT", alternateName: "Transportation Emission Measurement Tool", description: SITE_DESCRIPTION, inLanguage: "en-IN", publisher: { "@id": ORGANIZATION["@id"] } },
    ORGANIZATION,
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "TEMT",
      alternateName: "Transportation Emission Measurement Tool",
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Freight emissions accounting",
      operatingSystem: "Any modern web browser",
      inLanguage: "en-IN",
      areaServed: { "@type": "Country", name: "India" },
      audience: { "@type": "BusinessAudience", audienceType: "Listed companies, shippers and logistics service providers reporting under BRSR" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      screenshot: `${SITE_URL}/og.png`,
      featureList: [
        "Well-to-wheel freight emissions for road, rail, air, sea and inland waterways",
        "India-specific emission factors for seven truck classes on diesel, petrol, CNG and electricity",
        "ISO 14083 transport chains with legs and hub operations",
        "Distances from Indian cities, PIN codes, airports and ports",
        "Bulk import of TEMT templates and GST e-way bills",
        "Mode comparison and reduction planning",
        "GHG Protocol Scope 3 Category 4 and 9 and BRSR Principle 6 reports in PDF, Excel, Word and Power BI",
        "A private Copilot that runs in the browser",
      ],
      publisher: { "@id": ORGANIZATION["@id"] },
      creator: { "@id": ORGANIZATION["@id"] },
    },
    { "@type": "FAQPage", "@id": `${SITE_URL}/#faq`, mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) },
  ],
};
