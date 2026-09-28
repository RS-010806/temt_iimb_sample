import type { Metadata } from "next";
import { Footer, Header } from "@/components/site-chrome";
import { HOME_GRAPH, JsonLd, SITE_DESCRIPTION, pageMetadata } from "@/components/seo";
import { Hero } from "@/components/marketing/hero";
import { TryIt } from "@/components/marketing/try-it";
import { ComparisonTeaser, CopilotShowcase, Credentials, Faq, FinalCta, HowItWorks, ProblemStats, ProductModules, ReportsSection, ScopesSection, VideoSection } from "@/components/marketing/sections";

export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

export default function HomePage() {
  return (
    <>
      <JsonLd data={HOME_GRAPH} />
      <Header />
      <main id="main">
        <Hero />
        <Credentials />
        <ProblemStats />
        <ProductModules />
        <HowItWorks />
        <TryIt />
        <CopilotShowcase />
        <ReportsSection />
        <VideoSection />
        <ScopesSection />
        <ComparisonTeaser />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
