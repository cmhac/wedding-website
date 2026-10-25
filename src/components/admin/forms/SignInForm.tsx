"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { requestStaffSignIn } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Field } from "../primitives";

const NEUTRAL_MESSAGE =
  "If that address belongs to a staff account, a sign-in link is on its way.";

type Outcome =
  { kind: "idle" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * Asks for a staff sign-in link. Every answer except "too many attempts" and
 * "could not reach the server" shows the same neutral message, so the page
 * never reveals whether an address belongs to a staff account.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await requestStaffSignIn(email);
    setPending(false);
    if (result.ok) {
      setOutcome({ kind: "sent" });
    } else if (result.error.code === "rate_limited") {
      setOutcome({ kind: "error", message: messageFor("rate_limited") });
    } else if (result.error.code === "network") {
      setOutcome({ kind: "error", message: messageFor("network") });
    } else {
      setOutcome({ kind: "sent" });
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {outcome.kind === "error" ? (
        <Alert variant="error">{outcome.message}</Alert>
      ) : null}
      {outcome.kind === "sent" ? (
        <Alert variant="ok">{NEUTRAL_MESSAGE}</Alert>
      ) : null}
      <Field id="email" label="Email address">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending}
        aria-disabled={pending}
      >
        Email me a sign-in link
      </button>
    </form>
  );
}
