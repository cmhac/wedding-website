"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { updateHousehold } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Field } from "../primitives";

type Outcome =
  { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Changes a household's contact email through the admin route handler (it
 * also moves the household's sign-in account). An empty address makes the
 * household paper-only.
 */
export function ContactEmailForm({
  householdId,
  email,
}: {
  householdId: string;
  email: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(email ?? "");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setOutcome({ kind: "idle" });
    const trimmed = value.trim();
    const result = await updateHousehold(householdId, {
      contact_email: trimmed === "" ? null : trimmed,
    });
    setPending(false);
    if (result.ok) {
      setOutcome({ kind: "saved" });
      router.refresh();
    } else {
      setOutcome({ kind: "error", message: messageFor(result.error.code) });
    }
  }

  return (
    <form className="stack-sm" onSubmit={onSubmit} noValidate>
      {outcome.kind === "error" ? (
        <Alert variant="error">{outcome.message}</Alert>
      ) : null}
      {outcome.kind === "saved" ? (
        <Alert variant="ok">Contact email saved.</Alert>
      ) : null}
      <Field
        id="contact-email"
        label="Contact email"
        hint="Also their sign-in address. Leave empty for a paper-only household."
      >
        <input
          id="contact-email"
          name="contact_email"
          type="email"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <div className="row">
        <button
          type="submit"
          className="btn"
          disabled={pending}
          aria-disabled={pending}
        >
          Save contact email
        </button>
      </div>
    </form>
  );
}
