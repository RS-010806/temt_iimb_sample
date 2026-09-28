import type { Metadata } from "next";
import { SignInPage } from "@/components/auth/signin-page";
import { pageMetadata } from "@/components/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to TEMT to keep a synced, secure copy of your freight emissions workspace and report history.",
  path: "/signin/",
  index: false,
});

export default function Page() {
  return <SignInPage />;
}
