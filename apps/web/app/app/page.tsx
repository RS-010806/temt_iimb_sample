import type { Metadata } from "next";
import { DashboardView } from "@/components/app/views/dashboard";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <DashboardView />;
}
