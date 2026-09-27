import { Footer, Header } from "@/components/site-chrome";
import { Hero } from "@/components/marketing/hero";
import { ComparisonTeaser, CopilotShowcase, Credentials, Faq, FinalCta, HowItWorks, ProblemStats, ProductModules, ReportsSection, ScopesSection, VideoSection } from "@/components/marketing/sections";

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <Credentials />
        <ProblemStats />
        <ProductModules />
        <HowItWorks />
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
