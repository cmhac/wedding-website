import { Home } from "@/components/site/Home";
import { getSession } from "@/lib/auth/session";

// Read per request: the answer depends on the visitor's session cookie.
export const dynamic = "force-dynamic";

async function isSignedIn(): Promise<boolean> {
  try {
    // Staff status is read on every call, so an expired session or a revoked
    // staff role counts as signed out rather than showing an error.
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  return <Home signedIn={await isSignedIn()} />;
}
