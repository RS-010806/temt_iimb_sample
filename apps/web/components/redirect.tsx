"use client";

import Link from "next/link";
import { useEffect } from "react";

export function Redirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-paper p-6 text-center">
      <p className="text-grey-700">Opening TEMT… <Link href={to} className="font-semibold text-maroon-700 underline">Continue</Link></p>
    </main>
  );
}
