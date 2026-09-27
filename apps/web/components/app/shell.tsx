"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight, BarChart3, BookOpen, Calculator, CircleHelp, Database, FileText, GitBranch, LayoutDashboard, Menu, Settings2, ShieldCheck, Sparkles, Target, Upload, X } from "lucide-react";
import { FACTOR_SETS } from "@temt/calculator";
import { hydrate, useStore } from "@/lib/store";
import { ToastProvider, cx } from "../ui";
import { Brand } from "../brand";
import { openCopilot } from "../copilot/copilot";
import { Onboarding } from "./onboarding";
import { AccountMenu, SyncConflictDialog } from "./account-menu";

export const NAV = [
  { href: "/app/", label: "Overview", icon: LayoutDashboard, tour: "nav-overview" },
  { href: "/app/calculate/", label: "Calculate", icon: Calculator, tour: "nav-calculate" },
  { href: "/app/compare/", label: "Compare modes", icon: ArrowLeftRight, tour: "nav-compare" },
  { href: "/app/chain/", label: "Transport chain", icon: GitBranch, tour: "nav-chain" },
  { href: "/app/import/", label: "Bulk import", icon: Upload, tour: "nav-import" },
  { href: "/app/shipments/", label: "Shipments", icon: Database, tour: "nav-shipments" },
  { href: "/app/reports/", label: "Reports", icon: FileText, tour: "nav-reports" },
  { href: "/app/planner/", label: "Reduction planner", icon: Target, tour: "nav-planner" },
  { href: "/app/factors/", label: "Factor library", icon: BookOpen, tour: "nav-factors" },
  { href: "/app/settings/", label: "Settings", icon: Settings2, tour: "nav-settings" },
  { href: "/app/help/", label: "Help and tour", icon: CircleHelp, tour: "nav-help" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/app/" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(href.replace(/\/$/, ""));
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const count = useStore((state) => state.shipments.length);
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-maroon-900 via-maroon-950 to-[#1d0303] text-white">
      <div className="px-5 pb-4 pt-5">
        <Link href="/" className="inline-flex" aria-label="TEMT home" onClick={onNavigate}><Brand tone="light" /></Link>
        <p className="mt-2 text-[11px] leading-snug text-maroon-200">Transportation Emission Measurement Tool · TCI–IIMB Supply Chain Sustainability Lab</p>
      </div>
      <nav aria-label="Workspace" className="scroll-thin flex-1 overflow-y-auto px-3" data-tour="sidebar">
        <ul className="grid gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link prefetch={false} href={item.href} data-tour={item.tour} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cx("group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-semibold transition", active ? "bg-white text-maroon-800 shadow-sm" : "text-maroon-100 hover:bg-white/8 hover:text-white")}>
                  <Icon size={17} aria-hidden="true" className={active ? "text-maroon-600" : "text-maroon-300 group-hover:text-white"} />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/app/shipments/" && count > 0 && <span className={cx("num rounded-full px-2 text-[11px]", active ? "bg-maroon-100 text-maroon-700" : "bg-white/10 text-maroon-100")}>{count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
        <p className="flex items-center gap-2 text-[12px] font-bold"><ShieldCheck size={15} className="text-maroon-200" aria-hidden="true" /> ISO 14083-aligned method</p>
        <p className="mt-1 text-[11px] leading-relaxed text-maroon-200">Production TEMT was the first digital platform in India certified to ISO 14083 and holds ISO/IEC 27001:2022.</p>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const settings = useStore((state) => state.settings);
  const storage = useStore((state) => state.storage);
  const hydrated = useStore((state) => state.hydrated);
  const samples = useStore((state) => state.shipments.some((row) => row.source === "sample"));
  // The dashboard carries its own sample-data banner, so the pill would repeat it there.
  const onDashboard = (usePathname() ?? "").replace(/\/$/, "") === "/app";
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-stone-200 bg-paper/85 px-4 backdrop-blur-md md:px-8">
      <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-grey-800">{settings.organisation.name || "Your organisation"}</p>
        <p className="hidden text-xs text-grey-500 sm:block">{hydrated ? (storage === "memory" ? "Session only" : "Saved privately in this browser") : "Loading workspace…"}</p>
      </div>
      {samples && !onDashboard && <Link prefetch={false} href="/app/settings/#data" className="hidden rounded-full bg-[#fdf6e8] px-3 py-1.5 text-xs font-bold text-[#6b4a06] ring-1 ring-[#f0dfb5] sm:inline-flex" title="This workspace includes synthetic sample shipments">Sample data</Link>}
      <Link prefetch={false} href="/app/settings/#factors" data-tour="factor-set" className="hidden items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-grey-700 transition hover:border-maroon-300 md:inline-flex" title="Change the factor set">
        <BarChart3 size={14} className="text-maroon-600" aria-hidden="true" /> {FACTOR_SETS[settings.factorSet].short}
      </Link>
      <AccountMenu />
      <button type="button" data-tour="copilot-button" className="btn btn-primary btn-sm" onClick={() => openCopilot()}>
        <Sparkles size={15} aria-hidden="true" /> <span className="hidden sm:inline">Ask Copilot</span><kbd className="ml-1 hidden rounded bg-white/15 px-1.5 text-[10px] font-semibold md:inline">⌘K</kbd>
      </button>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { hydrate(); }, []);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCopilot(); }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper">
        <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[264px] lg:block">
          <Sidebar />
        </aside>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-maroon-950/40 animate-fade" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[280px] animate-rise">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
              <button type="button" className="absolute right-3 top-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={18} /></button>
            </div>
          </div>
        )}
        <div className="app-content lg:pl-[264px]">
          <TopBar onMenu={() => setMenuOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-6 md:px-8 md:pt-8"><div key={pathname} className="page-enter">{children}</div></main>
        </div>
        <Onboarding />
        <SyncConflictDialog />
      </div>
    </ToastProvider>
  );
}
