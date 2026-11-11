import { Home } from "@/components/site/Home";
import { getSession } from "@/lib/auth/session";
import { recordHouseholdOpened } from "@/lib/site/opened";
import { getConsentPrompt } from "@/lib/sms/consent";
import { getSmsState, type SmsState } from "@/lib/sms/state";

// Read per request: the answer depends on the visitor's session cookie.
export const dynamic = "force-dynamic";

async function readSession() {
  try {
    // Staff status is read on every call, so an expired session or a revoked
    // staff role counts as signed out rather than showing an error.
    return await getSession();
  } catch {
    return null;
  }
}

async function readSmsState(): Promise<SmsState> {
  try {
    return await getSmsState();
  } catch {
    return { configured: false, enabled: false, available: false };
  }
}

export default async function HomePage() {
  const session = await readSession();
  const state = await readSmsState();
  const available = state.available;
  // A guest's first load records that their household has opened the site.
  if (session) await recordHouseholdOpened(session);
  // Only a signed-in guest is asked, and only while texting is available.
  let consent: { id: string; masked: string }[] = [];
  if (session?.kind === "guest" && available) {
    try {
      consent = (await getConsentPrompt(session.supabase, state)).pending;
    } catch {
      consent = [];
    }
  }
  return (
    <Home
      signedIn={session !== null}
      smsAvailable={available}
      consent={consent}
    />
  );
}
