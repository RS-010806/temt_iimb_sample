import type { Metadata } from "next";
import { Footer, Header } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Privacy", description: "How this TEMT workspace handles your data." };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-paper">
        <section className="bg-gradient-to-br from-maroon-800 to-maroon-950 py-16 text-white">
          <div className="container-page max-w-4xl"><p className="eyebrow eyebrow-light">Privacy · updated 27 September 2026</p><h1 className="display mt-3 text-[40px] md:text-[52px]">Your data, under your control.</h1></div>
        </section>
        <article className="container-page prose-temt max-w-4xl py-14">
          <h2>Where your workspace lives</h2>
          <p>Shipments, settings and the activity log are stored in your own browser using IndexedDB (or local storage if IndexedDB is unavailable). You can use every feature without an account. There are no advertising or tracking scripts.</p>
          <h2>If you create an account</h2>
          <p>An account is optional. When you sign in, TEMT stores your name, email, organisation and job title, a scrypt hash of your password (never the password itself), your active sessions, a copy of your workspace (shipments and settings), a list of reports you generated (title, period, format and totals, not the files) and an account activity log. Sessions use secure, HttpOnly cookies. You can download all of it or delete the account from the Account page; deletion removes it from the database immediately.</p>
          <h2>When data leaves your browser</h2>
          <ul>
            <li><strong>Location lookups</strong> load public datasets (cities, PIN codes, airports) from this website. Your queries are not sent anywhere.</li>
            <li><strong>Server check</strong> (Settings) sends up to 200 shipment calculations to the TEMT API, which recalculates them in memory and returns the result without storing or logging the request body. The hosting provider processes standard request metadata such as IP address for rate limiting.</li>
            <li><strong>Account sync</strong> (only when signed in) uploads your workspace over HTTPS a few seconds after each change.</li>
            <li><strong>Exports and backups</strong> are generated in your browser and downloaded to your device.</li>
            <li><strong>Local model</strong> (optional): if you connect a model in Settings, messages go to the address you configure, normally a program on your own computer.</li>
          </ul>
          <h2>The Copilot</h2>
          <p>The built-in Copilot runs entirely in your browser. It reads your workspace to answer questions but does not send it to any AI service.</p>
          <h2>Keeping your data safe</h2>
          <p>Clearing your browser's site data deletes the workspace. Download a backup from Settings regularly. Do not enter personal data in shipment notes.</p>
          <h2>Production TEMT</h2>
          <p>The production platform at iimb.freightemissions.com operates under its own accounts, storage and ISO/IEC 27001:2022-certified information security management system.</p>
          <h2>Contact</h2>
          <p>TCI–IIMB Supply Chain Sustainability Lab, Indian Institute of Management Bangalore: <a href="mailto:aditya.gupta@iimb.ac.in">aditya.gupta@iimb.ac.in</a>.</p>
        </article>
      </main>
      <Footer />
    </>
  );
}
