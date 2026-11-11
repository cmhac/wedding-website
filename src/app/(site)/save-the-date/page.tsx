import { redirect } from "next/navigation";
import { SaveTheDate } from "@/components/site/SaveTheDate";
import { shapeSaveTheDate } from "@/lib/calendar/details";
import { loadSaveTheDate } from "@/lib/calendar/load";
import { getSession } from "@/lib/auth/session";
import { callRpc } from "@/lib/guest-api/request";
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
  const details =
    (await loadSaveTheDate(session.supabase, siteUrl).catch(() => null)) ??
    shapeSaveTheDate(null, siteUrl);

  let consent: { id: string; masked: string }[] = [];
  if (session.kind === "guest") {
    try {
      await callRpc(session.supabase, "record_household_opened");
    } catch {
      // Recording an open never breaks the page.
    }
    try {
      const state = await getSmsState();
      if (state.available) {
        consent = (await getConsentPrompt(session.supabase, state)).pending;
      }
    } catch {
      consent = [];
    }
  }

  return <SaveTheDate details={details} consent={consent} />;
}
