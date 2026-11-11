"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createGuestApiClient } from "@/lib/guest-api/client";

type Props = {
  /** The household's numbers not yet asked about, masked. */
  pending: { id: string; masked: string }[];
  client?: Pick<ReturnType<typeof createGuestApiClient>, "answerSmsConsent">;
};

/**
 * The one-time step after a guest's first sign-in: one unticked box per
 * number, and a single button that saves every answer. A ticked box opts the
 * number in; an unticked one records "no thanks" and the step does not come
 * back for it. Texts are optional and email always works. First-draft wording
 * for the couple to polish; the statement matches what is registered with the
 * carriers.
 */
export function ConsentStep({
  pending,
  client = createGuestApiClient(),
}: Props) {
  const groupId = useId();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    try {
      const result = await client.answerSmsConsent({
        answers: pending.map((n) => ({
          id: n.id,
          opt_in: ticked[n.id] === true,
        })),
      });
      setState(result.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <main className="stage">
        <div className="prompt">
          <h1>Thanks, your choice is saved</h1>
          <p>
            If you chose texts, we are sending one confirmation text now. Reply
            HELP for help, STOP to opt out. Msg &amp; data rates may apply. You
            can keep using this site by email at any time.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="stage">
      <form className="prompt" onSubmit={onSubmit}>
        <div>
          <h1>Would you like text updates?</h1>
          <p>
            We have a mobile number on file for your household. You can also use
            this site with email only, so this is optional. Tick only numbers
            that are yours.
          </p>
        </div>
        {state === "error" ? (
          <p role="alert" className="status status-bad">
            Could not save your choice. Try again.
          </p>
        ) : null}
        {pending.map((n) => (
          <div className="consent" key={n.id}>
            <input
              id={`${groupId}-${n.id}`}
              type="checkbox"
              checked={ticked[n.id] === true}
              onChange={(e) =>
                setTicked({ ...ticked, [n.id]: e.target.checked })
              }
            />
            <label htmlFor={`${groupId}-${n.id}`}>Text me at {n.masked}</label>
          </div>
        ))}
        <p className="consent-statement">
          By ticking a box you agree to receive text messages from Chris &amp;
          Hannah&apos;s wedding about our wedding (reminders, essential updates
          and sign-in links), about a dozen messages over six months. Msg &amp;
          data rates may apply. Reply HELP for help, STOP to opt out. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/terms">Terms</Link>.
        </p>
        <button type="submit" className="btn" disabled={state === "saving"}>
          Save my choice
        </button>
      </form>
    </main>
  );
}
