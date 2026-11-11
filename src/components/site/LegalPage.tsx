import type { ReactNode } from "react";
import Link from "next/link";
import { LEGAL_LAST_UPDATED, SITE_DOMAIN, SITE_NAME } from "@/lib/site/legal";

/**
 * The frame shared by the privacy and terms pages: a title, the date the
 * wording was last changed, the text, and a footer linking to both pages.
 * Fixed text for every visitor, signed in or not. Plain on purpose.
 */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="legal">
        <p className="legal-meta">
          <Link href="/">{SITE_NAME}</Link> · {SITE_DOMAIN}
        </p>
        <h1>{title}</h1>
        <p className="legal-meta">Last updated: {LEGAL_LAST_UPDATED}</p>
        {children}
      </main>
      <footer className="legal-footer">
        <Link href="/privacy">Privacy Policy</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms">Terms</Link>
      </footer>
    </>
  );
}
