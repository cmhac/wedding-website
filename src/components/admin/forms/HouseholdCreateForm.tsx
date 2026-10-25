"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { createHousehold } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Alert, Field } from "../primitives";

const EMAIL_IN_USE = "That contact email already belongs to another household.";

type GuestRow = { key: number; first: string; last: string; email: string };

export type InviteEvent = { id: string; slug: string; name: string };

const blank = (key: number): GuestRow => ({
  key,
  first: "",
  last: "",
  email: "",
});

const orNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

/** Creates a household with its guests through the admin route handler. */
export function HouseholdCreateForm({ events }: { events: InviteEvent[] }) {
  const router = useRouter();
  const [guests, setGuests] = useState<GuestRow[]>([blank(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const change = (key: number, field: keyof GuestRow, value: string) =>
    setGuests((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found: Record<string, string> = {};

    const displayName = String(data.get("display_name") ?? "").trim();
    if (displayName === "") found.display_name = "This is required.";

    const allowanceText = String(data.get("plus_one_allowance") ?? "").trim();
    const allowance = Number(allowanceText);
    if (
      allowanceText === "" ||
      !Number.isInteger(allowance) ||
      allowance < 0 ||
      allowance > 20
    ) {
      found.plus_one_allowance = "Enter a whole number from 0 to 20.";
    }

    const named = guests
      .map((g) => ({
        first_name: g.first.trim(),
        last_name: g.last.trim(),
        email: g.email.trim() === "" ? null : g.email.trim(),
      }))
      .filter((g) => g.first_name !== "" || g.last_name !== "" || g.email);
    if (
      named.length === 0 ||
      named.some((g) => !g.first_name || !g.last_name)
    ) {
      found.guests = "Add at least one guest, each with a first and last name.";
    }

    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) return;

    const address = Object.fromEntries(
      (
        [
          ["street", orNull(data.get("street"))],
          ["city", orNull(data.get("city"))],
          ["region", orNull(data.get("region"))],
          ["postal_code", orNull(data.get("postal_code"))],
          ["country", orNull(data.get("country"))],
        ] as const
      ).filter(([, value]) => value !== null),
    );

    setPending(true);
    const result = await createHousehold({
      display_name: displayName,
      contact_email: orNull(data.get("contact_email")),
      plus_one_allowance: allowance,
      address: Object.keys(address).length > 0 ? address : null,
      notes: orNull(data.get("notes")),
      guests: named,
    });

    if (!result.ok) {
      setPending(false);
      setMessage(
        result.error.code === "email_in_use"
          ? EMAIL_IN_USE
          : messageFor(result.error.code),
      );
      return;
    }

    const householdId = result.data.household.id;
    const chosen = data.getAll("invite_event").map(String);
    let invitesFailed = false;
    if (chosen.length > 0) {
      const supabase = createBrowserSupabase();
      for (const eventId of chosen) {
        const invited = await supabase.rpc("invite", {
          guest_ids: result.data.guest_ids,
          event_id: eventId,
        });
        if (invited.error) invitesFailed = true;
      }
    }
    setPending(false);
    if (invitesFailed) {
      setCreatedId(householdId);
      setMessage(
        "The household was created, but inviting it to the chosen events did not work. You can invite its guests from the household page.",
      );
      return;
    }
    router.push(`/admin/households/${householdId}`);
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="card-b stack">
        {message ? <Alert variant="error">{message}</Alert> : null}
        {createdId ? (
          <Link href={`/admin/households/${createdId}`}>
            Open the household
          </Link>
        ) : null}
        <div className="grid2">
          <Field
            id="display-name"
            label="Display name"
            hint="Used for the greeting and the envelope."
            error={errors.display_name}
          >
            <input id="display-name" name="display_name" type="text" />
          </Field>
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
            />
          </Field>
          <Field
            id="plus-one-allowance"
            label="Plus-one allowance"
            error={errors.plus_one_allowance}
          >
            <input
              id="plus-one-allowance"
              name="plus_one_allowance"
              type="number"
              min={0}
              max={20}
              defaultValue={0}
              className="w-sm"
            />
          </Field>
          <Field
            id="staff-notes"
            label="Staff notes"
            hint="Never shown to guests."
          >
            <textarea id="staff-notes" name="notes" rows={3} />
          </Field>
        </div>

        <fieldset className="group">
          <legend>Mailing address</legend>
          <div className="grid2">
            <Field id="address-street" label="Street">
              <input id="address-street" name="street" type="text" />
            </Field>
            <Field id="address-city" label="City">
              <input id="address-city" name="city" type="text" />
            </Field>
            <Field id="address-region" label="State or region">
              <input id="address-region" name="region" type="text" />
            </Field>
            <Field id="address-postal" label="Postal code">
              <input id="address-postal" name="postal_code" type="text" />
            </Field>
            <Field id="address-country" label="Country">
              <input id="address-country" name="country" type="text" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>Guests</legend>
          {errors.guests ? (
            <p className="hint field-error" role="alert">
              {errors.guests}
            </p>
          ) : null}
          {guests.map((guest, index) => {
            const n = index + 1;
            return (
              <div className="grid2" key={guest.key}>
                <Field
                  id={`guest-${guest.key}-first`}
                  label={`Guest ${n} first name`}
                >
                  <input
                    id={`guest-${guest.key}-first`}
                    type="text"
                    value={guest.first}
                    onChange={(e) => change(guest.key, "first", e.target.value)}
                  />
                </Field>
                <Field
                  id={`guest-${guest.key}-last`}
                  label={`Guest ${n} last name`}
                >
                  <input
                    id={`guest-${guest.key}-last`}
                    type="text"
                    value={guest.last}
                    onChange={(e) => change(guest.key, "last", e.target.value)}
                  />
                </Field>
                <Field
                  id={`guest-${guest.key}-email`}
                  label={`Guest ${n} email`}
                >
                  <input
                    id={`guest-${guest.key}-email`}
                    type="email"
                    autoComplete="off"
                    value={guest.email}
                    onChange={(e) => change(guest.key, "email", e.target.value)}
                  />
                </Field>
                {guests.length > 1 ? (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() =>
                        setGuests((rows) =>
                          rows.filter((row) => row.key !== guest.key),
                        )
                      }
                    >
                      Remove guest {n}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setGuests((rows) => [...rows, blank(nextKey)]);
                setNextKey(nextKey + 1);
              }}
            >
              Add another guest
            </button>
          </div>
        </fieldset>

        {events.length > 0 ? (
          <fieldset className="group">
            <legend>Invite to</legend>
            {events.map((event) => (
              <label className="check" key={event.id}>
                <input type="checkbox" name="invite_event" value={event.id} />
                <span>{event.name}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
      </div>
      <div className="card-f">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          aria-disabled={pending}
        >
          Create household
        </button>
      </div>
    </form>
  );
}
