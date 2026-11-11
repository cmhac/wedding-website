import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/site/PrivacyPolicy";

export const metadata: Metadata = { title: "Privacy Policy" };

// Fixed text for everyone: no session, no data, so it is built once.
export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
