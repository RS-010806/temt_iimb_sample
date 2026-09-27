import type { Metadata } from "next";
import { ImportView } from "@/components/app/views/import";

export const metadata: Metadata = { title: "Bulk import" };

export default function Page() {
  return <ImportView />;
}
