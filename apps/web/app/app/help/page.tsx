import type { Metadata } from "next";
import { HelpView } from "@/components/app/views/help";

export const metadata: Metadata = { title: "Help and guided tour" };

export default function Page() {
  return <HelpView />;
}
