import type { Metadata } from "next";
import { CalculateView } from "@/components/app/views/calculate";

export const metadata: Metadata = { title: "Calculate a shipment" };

export default function CalculatePage() {
  return <CalculateView />;
}
