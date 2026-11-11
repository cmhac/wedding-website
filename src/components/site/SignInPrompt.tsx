"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createGuestApiClient } from "@/lib/guest-api/client";
import { looksLikePhone } from "@/lib/sms/phone";
import { LegalLinks } from "./LegalLinks";

// Shown for every answer except "too many attempts" and "could not reach the
// server", so the prompt never reveals whether an address is a guest or staff.
const NEUTRAL_MESSAGE =
  "If that address is on the guest list or belongs to a staff account, a link is on its way.";
// Once texting is available the answer covers both kinds, as the server's does.
const NEUTRAL_MESSAGE_BOTH =
  "If that email address or mobile number is on the guest list, or belongs to a staff account, a link is on its way.";

type Outcome =
  | { kind: "idle" }
  | { kind: "sent"; message: string }
  | { kind: "error"; message: string };

type Props = {
  /** True only when texting is available; otherwise the prompt is email-only. */
  smsAvailable?: boolean;
  client?: Pick<ReturnType<typeof createGuestApiClient>, "signIn">;
};

/**
 * The one sign-in prompt for guests and staff: type an address, get a link.
 * The server decides which kind of link to send. First-draft wording for the
 * couple to polish.
 */
export function SignInPrompt({
  smsAvailable = false,
  client = createGuestApiClient(),
}: Props) {
  const inputId = useId();
  const consentId = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const isPhone = smsAvailable && looksLikePhone(email);
  const neutral = smsAvailable ? NEUTRAL_MESSAGE_BOTH : NEUTRAL_MESSAGE;
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await client.signIn(
        smsAvailable
          ? isPhone
            ? { identifier: email.trim(), sms_consent: consent }
            : { identifier: email.trim() }
          : { email: email.trim() },
      );
      if (result.ok) {
        setOutcome({
          kind: "sent",
          message: result.data?.message || neutral,
        });
      } else if (result.error.code === "rate_limited") {
        setOutcome({
          kind: "error",
          message: "Too many attempts. Try again soon.",
        });
      } else {
        setOutcome({ kind: "sent", message: neutral });
      }
    } catch {
      setOutcome({
        kind: "error",
        message: "Could not reach the server. Try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="stage">
      <form className="prompt" onSubmit={onSubmit}>
        <div>
          <h1>Sign in to see what&apos;s coming</h1>
          <p>
            {smsAvailable
              ? "Enter the email address or mobile number we invited, and we'll send you a link."
              : "Enter the email address we invited, and we'll send you a link."}
          </p>
        </div>
        {outcome.kind === "sent" ? (
          <p role="status" className="status">
            {outcome.message}
          </p>
        ) : null}
        {outcome.kind === "error" ? (
          <p role="alert" className="status status-bad">
            {outcome.message}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor={inputId}>
            {smsAvailable ? "Email or mobile number" : "Email address"}
          </label>
          <input
            id={inputId}
            name="email"
            type={smsAvailable ? "text" : "email"}
            autoComplete={smsAvailable ? "username" : "email"}
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // A tick belongs to the number it was given for.
              setConsent(false);
            }}
          />
        </div>
        {isPhone ? (
          <div className="consent">
            <input
              id={consentId}
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <label htmlFor={consentId}>
              I agree to receive text messages from Chris &amp; Hannah&apos;s
              wedding about our wedding (reminders, essential updates and
              sign-in links), about a dozen messages over six months. Texts are
              optional. Msg &amp; data rates may apply. Reply HELP for help,
              STOP to opt out. See the{" "}
              <Link href="/privacy">Privacy Policy</Link> and{" "}
              <Link href="/terms">Terms</Link>.
            </label>
          </div>
        ) : null}
        <button
          type="submit"
          className="btn"
          disabled={pending || (isPhone && !consent)}
        >
          {smsAvailable ? "Send me a link" : "Email me a link"}
        </button>
      </form>
      <LegalLinks />
    </main>
  );
}
