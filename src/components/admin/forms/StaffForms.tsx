"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { grantStaff, revokeStaff } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Field } from "../primitives";

// Small client forms for the staff-access route handlers. They only call the
// typed wrappers; the handlers still refuse anyone but the couple.

const PLANNER_MESSAGE =
  "You are signed in as a planner. Only the couple can change staff access.";

type Failure = { status: number; error: { code: string } };

function failureMessage(failure: Failure): string {
  if (failure.status === 403) return PLANNER_MESSAGE;
  if (failure.error.code === "email_in_use") {
    return "That email address already has an account.";
  }
  return messageFor(failure.error.code);
}

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeAlert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <Alert variant={notice.kind === "ok" ? "ok" : "error"}>{notice.text}</Alert>
  );
}

export function AddPlannerForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setNotice(null);
    const result = await grantStaff({
      email: String(data.get("email") ?? "").trim(),
      display_name: String(data.get("display_name") ?? "").trim(),
    });
    setPending(false);
    if (result.ok && result.data) {
      setNotice({
        kind: "ok",
        text: `${result.data.staff.display_name} now has planner access.`,
      });
      formRef.current?.reset();
      router.refresh();
    } else if (!result.ok) {
      setNotice({ kind: "error", text: failureMessage(result) });
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="card-b stack-sm card-b-divided"
    >
      <NoticeAlert notice={notice} />
      <div className="row-end">
        <Field id="planner-name" label="Planner name">
          <input id="planner-name" name="display_name" type="text" required />
        </Field>
        <Field id="planner-email" label="Planner email">
          <input id="planner-email" name="email" type="email" required />
        </Field>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          aria-disabled={pending}
        >
          Give planner access
        </button>
      </div>
    </form>
  );
}

export function RemoveAccessButton({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function remove() {
    setPending(true);
    const result = await revokeStaff(userId);
    setPending(false);
    setConfirming(false);
    if (result.ok) {
      setNotice({ kind: "ok", text: `${displayName}'s access was removed.` });
      router.refresh();
    } else {
      setNotice({ kind: "error", text: failureMessage(result) });
    }
  }

  if (confirming) {
    return (
      <div className="stack-sm">
        <p>{`${displayName} will no longer be able to sign in to this console.`}</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={remove}
            disabled={pending}
            aria-disabled={pending}
          >
            Yes, remove access
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <NoticeAlert notice={notice} />
      <button
        type="button"
        className="btn btn-sm btn-quiet"
        aria-label={`Remove access for ${displayName}`}
        onClick={() => {
          setNotice(null);
          setConfirming(true);
        }}
      >
        Remove access
      </button>
    </div>
  );
}
