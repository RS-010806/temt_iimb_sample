import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Footer, Header } from "@/components/site-chrome";
import { TourPlayer } from "@/components/marketing/tour-player";

export const metadata: Metadata = { title: "Video tour", description: "A two-and-a-half-minute walkthrough of TEMT: calculator, comparisons, transport chains, bulk import, reports, reduction planner and the Copilot." };

export default function TourPage() {
  return (
    <>
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
