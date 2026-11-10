import Link from "next/link";
import { Card, PageHeader } from "./primitives";

/** Shown when a sign-in link is unusable. Neutral; the designer may replace it. Links to the home page, whose
 * one sign-in prompt serves guests and staff. */
export function AuthError() {
  return (
    <div className="stack">
      <PageHeader title="Sign-in link problem" />
      <Card>
        <div className="stack">
          <p>That sign-in link did not work or has already been used.</p>
          <p>
            <Link href="/">Back to sign in</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
