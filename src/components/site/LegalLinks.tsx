import Link from "next/link";

/** Two small plain links to the public privacy and terms pages, shown whether or not texting is available. */
export function LegalLinks() {
  return (
    <p className="legal-links">
      <Link href="/privacy">Privacy Policy</Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms">Terms</Link>
    </p>
  );
}
