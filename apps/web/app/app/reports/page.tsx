import type { Metadata } from "next";
import { ReportsView } from "@/components/app/views/reports";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsView />;
}
