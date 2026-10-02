"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { loadAccount, useAccount } from "@/lib/account";
import { Brand } from "../brand";
import { AuthPanel } from "../app/views/account";

/** Only same-site paths are accepted as a return address, so the page cannot be used to redirect elsewhere. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/app/";
}

export function SignInPage() {
  const router = useRouter();
  const status = useAccount((value) => value.status);
  const [next, setNext] = useState("/app/");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(safeNext(params.get("next")));
    if (params.get("mode") === "signup") setMode("signup");
    void loadAccount();
  }, []);
  useEffect(() => { if (status === "signed-in") router.replace(next); }, [status, next, router]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-stone-200 bg-white">
        <div className="container-page flex h-[70px] items-center justify-between gap-4">
          <Link href="/" aria-label="TEMT home"><Brand /></Link>
          <Link prefetch={false} href="/" className="btn btn-ghost btn-sm"><ArrowLeft size={15} aria-hidden="true" /> <span className="hidden sm:inline">Back to the website</span><span className="sm:hidden">Back</span></Link>
        </div>
      </header>
      <main id="main" className="container-page flex-1 py-10 md:py-14">
        <div className="mx-auto max-w-5xl">
          <h1 className="display text-[32px] md:text-[40px]">{mode === "signup" ? "Create your TEMT account" : "Sign in to TEMT"}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-grey-700">An account is optional. Everything in TEMT works in your browser without one.</p>
          <div className="mt-8">
            {status === "loading" || status === "signed-in" ? (
              <div className="grid min-h-[320px] place-items-center text-grey-600"><LoaderCircle className="animate-spin" aria-label={status === "signed-in" ? "Opening TEMT" : "Checking your session"} /></div>
            ) : status === "unavailable" ? (
              <div className="card card-pad max-w-2xl">
                <p className="font-bold">Sign-in is unavailable right now</p>
                <p className="mt-1 text-[14px] text-grey-700">TEMT's server could not be reached. Your workspace is saved in this browser, so you can keep working and sign in later.</p>
                <Link prefetch={false} href={next} className="btn btn-primary mt-4">Continue to TEMT <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            ) : (
              <AuthPanel initialMode={mode} onModeChange={setMode} onSignedIn={() => router.replace(next)} />
            )}
          </div>
          <p className="mt-8 text-[13.5px] text-grey-600">Prefer not to sign in? <Link prefetch={false} href={next} className="font-semibold text-maroon-700 hover:underline">Continue without an account</Link>.</p>
        </div>
      </main>
      <footer className="border-t border-stone-200 bg-white py-5 text-[12.5px] text-grey-600">
        <div className="container-page flex flex-wrap items-center justify-between gap-3">
          <p>TCI–IIMB Supply Chain Sustainability Lab, IIM Bangalore</p>
          <nav aria-label="Legal" className="flex gap-4"><Link prefetch={false} href="/privacy/" className="hover:text-maroon-700">Privacy</Link><Link prefetch={false} href="/methodology/" className="hover:text-maroon-700">Methodology</Link></nav>
        </div>
      </footer>
    </div>
  );
}
