import Link from "next/link";
import { LegalPage } from "./LegalPage";
import {
  COUPLE_NAMES,
  KEEP_DAYS_AFTER_WEDDING,
  SITE_DOMAIN,
  SITE_NAME,
  SUPPORT_EMAIL,
} from "@/lib/site/legal";

/** The public privacy policy. First-draft wording for the couple to polish. */
export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what {COUPLE_NAMES} (&ldquo;we&rdquo;) collect from
        guests of our wedding website, {SITE_DOMAIN} (&ldquo;{SITE_NAME}
        &rdquo;), and what we do with it. This is a personal website for our
        wedding. It is not a business.
      </p>

      <h2>What we collect</h2>
      <p>
        We collect the details you give us or that we already had from you: your
        name and your household&apos;s names, email addresses and mobile phone
        numbers, whether you chose to receive text messages, your RSVP answers,
        meal choices and dietary needs, and any message you leave for us. We
        also record which of our messages (emails and texts) were delivered to
        you.
      </p>

      <h2>How we use it</h2>
      <p>
        We use it only to plan and run our wedding: to send your invitation by
        email, to send RSVP reminders, sign-in links and essential wedding
        updates by email or, if you opt in, by text message, to record your
        RSVP, and to arrange food, seating and logistics with our venue and
        caterers.
      </p>

      <h2>Text messages</h2>
      <p>
        We send your first invitation by email. We text a mobile number only
        after you opt in by ticking a box on this site, and only about the
        wedding. We do not use your number for marketing.{" "}
        <strong>
          We do not sell or share your SMS opt-in data or personal information
          with third parties for marketing purposes.
        </strong>{" "}
        Text messaging consent is not shared with anyone and is not a condition
        of using this site: you can always use email instead. Reply STOP to any
        text to opt out, or HELP for help.
      </p>

      <h2>Who handles it for us</h2>
      <p>
        We use a small number of services to run the site and deliver messages:
        a database and sign-in provider, an email delivery provider and a
        text-message delivery provider. They process your information only on
        our behalf, to provide those services. We share the details a venue or
        caterer needs (for example meal choices and allergies) and nothing else.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep guest information only until shortly after the wedding. Within{" "}
        {KEEP_DAYS_AFTER_WEDDING} days after the wedding we delete all guest
        data and take down the database that holds it.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to correct or delete your information, or to stop
        contacting you, at any time by emailing{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. You can stop
        text messages by replying STOP.
      </p>

      <h2>Security</h2>
      <p>
        Access to the guest list is limited to the two of us and our wedding
        planner, and guests can see only their own household&apos;s information.
        No system is perfectly secure, but we take care to protect what you
        share with us.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also our{" "}
        <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
    </LegalPage>
  );
}
