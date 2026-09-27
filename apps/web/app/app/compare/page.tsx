import type { Metadata } from "next";
import { CompareView } from "@/components/app/views/compare";

export const metadata: Metadata = { title: "Compare modes" };

export default function Page() {
  return <CompareView />;
}
