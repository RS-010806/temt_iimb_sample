import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { TourPlayer } from "@/components/marketing/tour-player";
import { JsonLd, ORGANIZATION, SITE_URL, breadcrumbs, pageMetadata } from "@/components/seo";
import { TOUR_VIDEO } from "@/lib/tour-video";

const DESCRIPTION = "A narrated walkthrough of TEMT, end to end: the shipment calculator, mode comparisons, transport chains, bulk import, accounts and sync, reports and exports, the reduction planner and the Copilot.";
export const metadata: Metadata = pageMetadata({ title: "Video tour", description: DESCRIPTION, path: "/tour/" });

const iso = (seconds: number) => `PT${Math.floor(seconds / 60)}M${Math.round(seconds % 60)}S`;
const VIDEO = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "TEMT product tour",
  description: DESCRIPTION,
  thumbnailUrl: [`${SITE_URL}${TOUR_VIDEO.poster}`],
  uploadDate: TOUR_VIDEO.published,
  duration: iso(TOUR_VIDEO.durationSeconds),
  contentUrl: `${SITE_URL}${TOUR_VIDEO.src}`,
  embedUrl: `${SITE_URL}/tour/`,
  inLanguage: "en-IN",
  publisher: ORGANIZATION,
  hasPart: TOUR_VIDEO.chapters.map((chapter, index) => ({
    "@type": "Clip", name: chapter.title, startOffset: chapter.at, endOffset: TOUR_VIDEO.chapters[index + 1]?.at ?? TOUR_VIDEO.durationSeconds, url: `${SITE_URL}/tour/?t=${chapter.at}`,
  })),
};

export default function TourPage() {
  return (
    <>
      <JsonLd data={[VIDEO, breadcrumbs([["Home", "/"], ["Video tour", "/tour/"]])]} />
      <Header />
      <main id="main" className="bg-[radial-gradient(100%_80%_at_80%_0%,#8f1716_0%,#4c0808_45%,#2a0505_100%)] text-white">
        <section className="container-page py-14 md:py-20">
          <p className="eyebrow eyebrow-light">Video tour</p>
          <h1 className="display mt-3 max-w-3xl text-[40px] md:text-[54px]">TEMT, end to end, in under five minutes.</h1>
          <p className="mt-4 max-w-2xl text-[17px] text-maroon-100">From a single shipment to a board-ready report: the calculator, door-to-door comparisons, transport chains, bulk import, accounts and sync, reports and every export, the reduction planner and the Copilot. Narrated, with captions.</p>
          <div className="mt-10"><TourPlayer /></div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link prefetch={false} href="/app/" className="btn btn-light btn-lg">Open TEMT <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link prefetch={false} href="/app/help/" className="btn btn-outline-light btn-lg"><Compass size={18} aria-hidden="true" /> Take the in-app guided tour</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
