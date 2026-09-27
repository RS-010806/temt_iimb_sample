import type { Metadata } from "next";
import { ShipmentsView } from "@/components/app/views/shipments";

export const metadata: Metadata = { title: "Shipments" };

export default function Page() {
  return <ShipmentsView />;
}
