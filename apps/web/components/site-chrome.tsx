"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./brand";
import { cx } from "./ui";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/tour/", label: "Video tour" },
  { href: "/why-temt/", label: "Why TEMT" },
  { href: "/methodology/", label: "Methodology" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="sticky top-0 z-50">
      <div className="bg-maroon-800 text-[12px] text-maroon-100">
        <div className="container-page flex h-8 items-center justify-between gap-4">
          <p className="truncate">TCI–IIMB Supply Chain Sustainability Lab · Indian Institute of Management Bangalore</p>
          <div className="hidden items-center gap-5 sm:flex">
            <a href="https://www.iimb.ac.in/node/11590" target="_blank" rel="noreferrer" className="hover:text-white">IIMB</a>
            <a href="https://iimb.freightemissions.com/login" className="hover:text-white">Production TEMT sign-in</a>
          </div>
        </div>
      </div>
      <div className={cx("border-b bg-white/95 backdrop-blur-md transition-shadow", scrolled ? "border-stone-200 shadow-[0_6px_24px_-16px_rgba(42,5,5,.35)]" : "border-transparent")}>
        <div className="container-page flex h-[70px] items-center gap-6">
          <Link href="/" aria-label="TEMT home"><Brand /></Link>
          <nav aria-label="Main" className="ml-auto hidden items-center gap-7 text-[14px] font-semibold text-grey-700 lg:flex">
            {LINKS.map((link) => <Link key={link.href} prefetch={false} href={link.href} className="transition hover:text-maroon-700">{link.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link prefetch={false} href="/app/" className="btn btn-primary">Open TEMT <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>{open ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {open && (
          <nav aria-label="Mobile" className="container-page grid gap-1 pb-4 lg:hidden animate-fade">
            {LINKS.map((link) => <Link key={link.href} prefetch={false} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-semibold text-grey-800 hover:bg-maroon-50">{link.label}</Link>)}
          </nav>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-maroon-800 text-maroon-100">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Brand tone="light" />
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed">The Transportation Emission Measurement Tool, from the TCI–IIMB Supply Chain Sustainability Lab at the Indian Institute of Management Bangalore.</p>
          <p className="mt-4 text-[13px] text-maroon-200">Bannerghatta Road, Bengaluru 560076</p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Product</p>
          <ul className="mt-4 grid gap-2.5 text-[14px]">
            {[["/app/", "Open TEMT"], ["/app/calculate/", "Calculator"], ["/app/import/", "Bulk import"], ["/app/reports/", "Reports and exports"], ["/tour/", "Video tour"]].map(([href, label]) => <li key={href}><Link prefetch={false} href={href!} className="hover:text-white">{label}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Trust</p>
          <ul className="mt-4 grid gap-2.5 text-[14px]">
            {[["/methodology/", "Methodology and factors"], ["/why-temt/", "Why TEMT"], ["/privacy/", "Privacy"], ["https://dpiit.freightemissions.com/certification.pdf", "ISO 14083 validation (SGS)"], ["https://www.iimb.ac.in/node/11590", "TEMT at IIMB"]].map(([href, label]) => <li key={href}>{href!.startsWith("http") ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">{label}<ArrowUpRight size={12} aria-hidden="true" /></a> : <Link prefetch={false} href={href!} className="hover:text-white">{label}</Link>}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Platforms</p>
          <ul className="mt-4 grid gap-2.5 text-[14px]">
            {[["https://iimb.freightemissions.com/", "Production TEMT"], ["https://dpiit.freightemissions.com/", "TEMT on DPIIT"], ["https://ems.freightemissions.com/", "Carbon Accounting Tool"], ["mailto:aditya.gupta@iimb.ac.in?subject=TEMT%20enquiry", "Contact the team"]].map(([href, label]) => <li key={href}><a href={href} className="inline-flex items-center gap-1 hover:text-white" {...(href!.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a></li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-5 text-[12px] text-maroon-200">
          <p>© {new Date().getFullYear()} TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore.</p>
          <p className="max-w-2xl">Certifications (ISO 14083 methodology validation, ISO/IEC 27001:2022) and DPIIT adoption apply to the production TEMT platform and their stated scope.</p>
        </div>
      </div>
    </footer>
  );
}
