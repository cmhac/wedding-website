"use client";

import Link from "next/link";
import type { EventRow } from "@/lib/admin/data/events";
import { Field } from "./primitives";
import { ResultForm, type ResultFormProps } from "./forms/ResultForm";

export type EventFormProps = {
  action: ResultFormProps<{ message: string }>["action"];
  /** The event being edited; leave out to add a new one. */
  event?: EventRow;
  /** Suggested display order for a new event. */
  nextOrder?: number;
};

/** The Add or edit event tab. The short key can be set only when adding. */
export function EventForm({ action, event, nextOrder = 1 }: EventFormProps) {
  const editing = Boolean(event);
  return (
    <section className="card">
      <div className="card-h">
        <h2 className="card-t">{editing ? "Edit event" : "New event"}</h2>
      </div>
      <div className="card-b">
        <ResultForm
          action={action}
          submitLabel="Save event"
          secondary={
            <Link href="/admin/events" className="btn">
              Cancel
            </Link>
          }
        >
          {({ fieldErrors, values }) => {
            const value = (name: string, fallback: string) =>
              String(values[name] ?? fallback);
            return (
              <div className="stack">
                {event ? (
                  <input type="hidden" name="id" value={event.id} />
                ) : null}
                <div className="grid2">
                  <Field id="event-name" label="Name" error={fieldErrors.name}>
                    <input
                      id="event-name"
                      name="name"
                      type="text"
                      defaultValue={value("name", event?.name ?? "")}
                    />
                  </Field>
                  <Field
                    id="event-slug"
                    label="Short key"
                    hint={
                      editing
                        ? "Used by the site and by imports. Cannot change later."
                        : "Used by the site and by imports. Cannot change later. Lowercase letters, digits and hyphens only."
                    }
                    error={fieldErrors.slug}
                  >
                    <input
                      id="event-slug"
                      name="slug"
                      type="text"
                      placeholder="after-party"
                      readOnly={editing}
                      defaultValue={value("slug", event?.slug ?? "")}
                    />
                  </Field>
                  <Field
                    id="event-starts"
                    label="Starts (Pacific time)"
                    error={fieldErrors.starts_at}
                  >
                    <input
                      id="event-starts"
                      name="starts_at"
                      type="datetime-local"
                      defaultValue={value(
                        "starts_at",
                        event?.startsAtLocal ?? "",
                      )}
                    />
                  </Field>
                  <Field
                    id="event-venue"
                    label="Venue"
                    error={fieldErrors.venue_name}
                  >
                    <input
                      id="event-venue"
                      name="venue_name"
                      type="text"
                      defaultValue={value("venue_name", event?.venue ?? "")}
                    />
                  </Field>
                  <Field
                    id="event-group"
                    label="Group"
                    error={fieldErrors.group_key}
                  >
                    <input
                      id="event-group"
                      name="group_key"
                      type="text"
                      placeholder="wedding-weekend"
                      defaultValue={value("group_key", event?.groupKey ?? "")}
                    />
                  </Field>
                  <Field
                    id="event-order"
                    label="Display order"
                    error={fieldErrors.display_order}
                  >
                    <input
                      id="event-order"
                      name="display_order"
                      type="number"
                      step={1}
                      className="w-sm"
                      defaultValue={value(
                        "display_order",
                        String(event?.displayOrder ?? nextOrder),
                      )}
                    />
                  </Field>
                  <Field
                    id="event-deadline"
                    label="Own RSVP deadline (Pacific time)"
                    hint="Leave empty to use the default deadline."
                    error={fieldErrors.rsvp_deadline}
                  >
                    <input
                      id="event-deadline"
                      name="rsvp_deadline"
                      type="datetime-local"
                      defaultValue={value(
                        "rsvp_deadline",
                        event?.deadlineLocal ?? "",
                      )}
                    />
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    name="is_required"
                    defaultChecked={
                      "is_required" in values
                        ? true
                        : Object.keys(values).length > 0
                          ? false
                          : (event?.isRequired ?? false)
                    }
                  />
                  <span>Required event. Guests invited to it must answer.</span>
                </label>
              </div>
            );
          }}
        </ResultForm>
      </div>
    </section>
  );
}
