"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createGuestApiClient } from "@/lib/guest-api/client";

// Shown for every answer except "too many attempts" and "could not reach the
// server", so the prompt never reveals whether an address is a guest or staff.
const NEUTRAL_MESSAGE =
  "If that address is on the guest list or belongs to a staff account, a link is on its way.";

type Outcome =
  | { kind: "idle" }
  | { kind: "sent"; message: string }
  | { kind: "error"; message: string };

type Props = {
  client?: Pick<ReturnType<typeof createGuestApiClient>, "signIn">;
};

/**
 * The one sign-in prompt for guests and staff: type an address, get a link.
 * The server decides which kind of link to send. First-draft wording for the
 * couple to polish.
 */
export function SignInPrompt({ client = createGuestApiClient() }: Props) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await client.signIn({ email: email.trim() });
      if (result.ok) {
        setOutcome({
          kind: "sent",
          message: result.data?.message || NEUTRAL_MESSAGE,
        });
      } else if (result.error.code === "rate_limited") {
        setOutcome({
          kind: "error",
          message: "Too many attempts. Try again soon.",
        });
      } else {
        setOutcome({ kind: "sent", message: NEUTRAL_MESSAGE });
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
            Enter the email address we invited, and we&apos;ll send you a link.
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
          <label htmlFor={inputId}>Email address</label>
          <input
            id={inputId}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={pending}>
          Email me a link
        </button>
      </form>
    </main>
  );
}
