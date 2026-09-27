import type { Metadata } from "next";
import { FactorsView } from "@/components/app/views/factors";

export const metadata: Metadata = { title: "Factor library" };

export default function Page() {
  return <FactorsView />;
}
