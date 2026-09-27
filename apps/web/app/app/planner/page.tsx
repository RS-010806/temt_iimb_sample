import type { Metadata } from "next";
import { PlannerView } from "@/components/app/views/planner";

export const metadata: Metadata = { title: "Reduction planner" };

export default function Page() {
  return <PlannerView />;
}
