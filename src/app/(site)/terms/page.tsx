import type { Metadata } from "next";
import { TermsAndConditions } from "@/components/site/TermsAndConditions";

export const metadata: Metadata = { title: "Terms & Conditions" };

// Fixed text for everyone: no session, no data, so it is built once.
export default function TermsPage() {
  return <TermsAndConditions />;
}
