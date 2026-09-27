import type { Metadata } from "next";
import { ChainView } from "@/components/app/views/chain";

export const metadata: Metadata = { title: "Transport chain" };

export default function Page() {
  return <ChainView />;
}
