import Link from "next/link";
import { LegalPage } from "./LegalPage";
import {
  COUPLE_NAMES,
  SITE_DOMAIN,
  SITE_NAME,
  SUPPORT_EMAIL,
} from "@/lib/site/legal";

/** The public terms, including the SMS terms. First-draft wording for the couple to polish. */
export function TermsAndConditions() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These terms cover your use of {SITE_DOMAIN}, the wedding website of{" "}
        {COUPLE_NAMES}, and the text messages we send from it.
      </p>

      <h2>The website</h2>
      <p>
        The site is for guests we have personally invited. You sign in with a
        link we send by email or text, and you can view and answer your
        household&apos;s RSVP. Please keep your personal link to yourself:
        anyone who opens it can act for your household. If you lose control of
        it, tell us and we will cancel it.
      </p>

      <h2>SMS terms: {SITE_NAME} Texts</h2>
      <p>
        <strong>Program description.</strong> If you opt in, we send text
        messages to your mobile number about our wedding. We do not send
        marketing or promotional messages.
      </p>
      <p>
        <strong>Message frequency.</strong> About a dozen messages per number in
        total over roughly six months.
      </p>
      <p>
        <strong>Cost.</strong> Message and data rates may apply, according to
        your mobile plan.
      </p>
      <p>
        <strong>Opt out.</strong> Reply <strong>STOP</strong> to any message to
        stop receiving texts. You will get one confirmation and no more. Reply{" "}
        <strong>START</strong> to resubscribe.
      </p>
      <p>
        <strong>Help.</strong> Reply <strong>HELP</strong> to any message, or
        email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
      <p>
        <strong>Consent.</strong> You opt in by ticking an unticked box, either
        the first time you sign in to the website or when you ask for a sign-in
        link by text. Agreeing is optional and is not required to use the
        website: you can use email instead.
      </p>
      <p>
        <strong>Carriers.</strong> Wireless carriers are not liable for delayed
        or undelivered messages.
      </p>

      <h2>Privacy</h2>
      <p>
        How we handle your information is described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms before the wedding, and the date above will
        change when we do. Support:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
