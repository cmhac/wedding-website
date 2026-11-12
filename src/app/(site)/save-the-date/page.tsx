import { redirect } from "next/navigation";
import { SaveTheDate } from "@/components/site/SaveTheDate";
import { shapeSaveTheDate } from "@/lib/calendar/details";
import { loadSaveTheDate } from "@/lib/calendar/load";
import { getSession } from "@/lib/auth/session";
import { recordHouseholdOpened } from "@/lib/site/opened";
import { getConsentPrompt } from "@/lib/sms/consent";
import { getSmsState } from "@/lib/sms/state";

// Read per request: the answer depends on the visitor's session cookie.
export const dynamic = "force-dynamic";

async function readSession() {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

async function readConsent(
  session: NonNullable<Awaited<ReturnType<typeof readSession>>>,
) {
  if (session.kind !== "guest") return [];
  try {
    const state = await getSmsState();
    if (!state.available) return [];
    return (await getConsentPrompt(session.supabase, state)).pending;
  } catch {
    return [];
  }
}

/**
 * The barebones placeholder save the date page (the couple's narrow exception
 * of 2026-11-11). A visitor who is not signed in is sent to the sign-in prompt
 * and sees nothing. A guest's first load records that their household has
 * opened the site; a staff preview does not.
 */
export default async function SaveTheDatePage() {
  const session = await readSession();
  if (!session) redirect("/");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // Independent reads and the open record run together.
  const [details, consent] = await Promise.all([
    loadSaveTheDate(session.supabase, siteUrl).catch(() => null),
    readConsent(session),
    recordHouseholdOpened(session),
  ]);

  return (
    <SaveTheDate
      details={details ?? shapeSaveTheDate(null, siteUrl)}
      consent={consent}
    />
  );
}
