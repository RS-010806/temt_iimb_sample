import type { Metadata } from "next";
import { SettingsView } from "@/components/app/views/settings";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsView />;
}
