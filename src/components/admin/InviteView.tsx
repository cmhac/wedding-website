"use client";

import { useState } from "react";
import type { InvitableGuest } from "@/lib/admin/data/events";
import { Alert, EmptyState, Field } from "./primitives";
import { ResultForm, type ResultFormProps } from "./forms/ResultForm";

export type InviteViewProps = {
  action: ResultFormProps<{ message: string }>["action"];
  events: { id: string; name: string }[];
  /** The chosen event's id. */
  eventId: string;
  /** The current guest search. */
  q: string;
  guests: InvitableGuest[];
};

/**
 * The Invite guests tab. Picking an event and searching are plain GET
 * requests (the page reloads with `id` and `q`); the invite itself posts the
 * ticked guests. Nothing is emailed.
 */
export function InviteView({
  action,
  events,
  eventId,
  q,
  guests,
}: InviteViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  if (events.length === 0) {
    return (
      <EmptyState>Add an event first, then invite guests to it.</EmptyState>
    );
  }

  const selectable = guests.filter((g) => !g.invitation);
  const count = selectable.filter((g) => selected.has(g.id)).length;
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className="card">
      <div className="card-h">
        <h2 className="card-t">Invite guests to an event</h2>
      </div>
      <div className="card-b stack">
        <Alert variant="info">
          Adds invitations only. Nothing is emailed. Existing invitations and
          answers are left alone.
        </Alert>
        <form method="get" action="/admin/events" className="grid2">
          <input type="hidden" name="tab" value="invite" />
          <Field id="invite-event" label="Event">
            <select id="invite-event" name="id" defaultValue={eventId}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="invite-search" label="Find guests">
            <input
              id="invite-search"
              name="q"
              type="search"
              placeholder="Search by name"
              defaultValue={q}
            />
          </Field>
          <div>
            <button type="submit" className="btn">
              Show guests
            </button>
          </div>
        </form>
        <ResultForm
          action={action}
          submitLabel={
            count === 0
              ? "Invite guests"
              : `Invite ${count} ${count === 1 ? "guest" : "guests"}`
          }
        >
          <input type="hidden" name="event_id" value={eventId} />
          <fieldset className="group">
            <legend>Guests ({count} selected)</legend>
            {guests.length === 0 ? (
              <p className="muted">No guests match.</p>
            ) : null}
            {guests.map((g) => (
              <label key={g.id} className="check">
                <input
                  type="checkbox"
                  name="guest_ids"
                  value={g.id}
                  disabled={Boolean(g.invitation)}
                  checked={!g.invitation && selected.has(g.id)}
                  onChange={(e) => toggle(g.id, e.target.checked)}
                />
                <span>
                  {g.name} <span className="muted">{g.householdName}</span>
                  {g.invitation ? (
                    <>
                      {" "}
                      <span className="muted">Already invited</span>
                    </>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        </ResultForm>
      </div>
    </section>
  );
}
