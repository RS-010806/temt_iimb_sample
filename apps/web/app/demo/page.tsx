import type { Metadata } from "next";
import { Redirect } from "@/components/redirect";

export const metadata: Metadata = { title: "Opening TEMT", robots: { index: false, follow: true } };

/** The earlier preview lived at /demo/; keep old links working. */
export default function DemoRedirect() {
  return <Redirect to="/app/" />;
}
