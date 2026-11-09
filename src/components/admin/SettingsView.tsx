"use client";

import type { StaffRow } from "@/lib/admin/data/settings";
import { saveSettings } from "@/lib/admin/actions/settings";
import { savedSettingsMessage } from "@/lib/admin/settings-message";
import { pacificLocalToIso } from "@/lib/admin/time";
import type { StaffRole } from "@/lib/auth/session";
import { DataTable, type Column } from "./DataTable";
import { ActionForm, type ActionFormProps } from "./forms/ActionForm";
import { AddPlannerForm, RemoveAccessButton } from "./forms/StaffForms";
import { Badge, Card, Field, PageHeader } from "./primitives";

export type SettingsViewProps = {
  role: StaffRole;
  currentUserId: string;
  settings: {
    /** A Pacific datetime-local value, or "". */
    default_rsvp_deadline: string;
    rsvp_open: boolean;
    /** The event whose date closes personal links, or "" when none is chosen. */
    wedding_event_id: string;
    sign_in_limit_per_address: number;
    sign_in_window_minutes: number;
    sign_in_limit_global_per_hour: number;
  };
  /** Events to choose the wedding from. */
  events: { id: string; name: string }[];
  staff: Pick<StaffRow, "user_id" | "display_name" | "role">[];
};

export function SettingsView({
  role,
  currentUserId,
  settings,
  events,
  staff,
}: SettingsViewProps) {
  const isCouple = role === "couple";
  const stored = pacificLocalToIso(settings.default_rsvp_deadline);
  const successMessage = savedSettingsMessage(
    typeof stored === "string" ? stored : null,
  );

  const columns: Column<SettingsViewProps["staff"][number]>[] = [
    {
      key: "name",
      header: "Name",
      cell: (person) => (
        <>
          <strong>{person.display_name}</strong>
          {person.user_id === currentUserId ? (
            <>
              {" "}
              <span className="muted">(you)</span>
            </>
          ) : null}
        </>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (person) =>
        person.role === "couple" ? (
          <Badge variant="staff">Couple</Badge>
        ) : (
          <Badge>Planner</Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      hideHeader: true,
      cell: (person) =>
        isCouple && person.user_id !== currentUserId ? (
          <RemoveAccessButton
            userId={person.user_id}
            displayName={person.display_name}
          />
        ) : null,
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        description="RSVP rules and who can use this console."
      />
      <Card heading="RSVP settings">
        <ActionForm
          // The result also carries the message in `data`; the form shows the same
          // text from the refreshed page, so the narrower type is enough here.
          action={saveSettings as ActionFormProps["action"]}
          submitLabel="Save settings"
          successMessage={successMessage}
        >
          {({ fieldErrors, values }) => {
            const refilled = Object.keys(values).length > 0;
            return (
              <>
                <Field
                  id="default-rsvp-deadline"
                  label="Default RSVP deadline (Pacific time)"
                  hint="Used when neither the household nor the event sets its own."
                  error={fieldErrors.default_rsvp_deadline}
                >
                  <input
                    id="default-rsvp-deadline"
                    name="default_rsvp_deadline"
                    type="datetime-local"
                    className="w-md"
                    defaultValue={
                      refilled
                        ? String(values.default_rsvp_deadline ?? "")
                        : settings.default_rsvp_deadline
                    }
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    name="rsvp_open"
                    defaultChecked={
                      refilled ? "rsvp_open" in values : settings.rsvp_open
                    }
                  />{" "}
                  <span>
                    <strong>RSVPs are open</strong>
                    <br />
                    <span className="muted">
                      Turning this off stops guests changing answers. Staff can
                      still record answers.
                    </span>
                  </span>
                </label>
                <Field
                  id="wedding-event"
                  label="Wedding event"
                  hint="Personal invite links stop working on this event's date (Pacific time). Until one is chosen they never close."
                  error={fieldErrors.wedding_event_id}
                >
                  <select
                    id="wedding-event"
                    name="wedding_event_id"
                    defaultValue={
                      refilled
                        ? String(values.wedding_event_id ?? "")
                        : settings.wedding_event_id
                    }
                  >
                    <option value="">Not chosen</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <fieldset className="group">
                  <legend>Limits on sign-in emails</legend>
                  <p className="muted">
                    These stop anyone using the sign-in form to flood an address
                    with emails.
                  </p>
                  <div className="grid2">
                    <Field
                      id="sign-in-limit-per-address"
                      label="Sign-in links per address"
                      error={fieldErrors.sign_in_limit_per_address}
                    >
                      <input
                        id="sign-in-limit-per-address"
                        name="sign_in_limit_per_address"
                        type="number"
                        min={1}
                        className="w-sm"
                        defaultValue={
                          refilled
                            ? String(values.sign_in_limit_per_address ?? "")
                            : settings.sign_in_limit_per_address
                        }
                      />
                    </Field>
                    <Field
                      id="sign-in-window-minutes"
                      label="Window (minutes)"
                      hint="The limit above applies within this many minutes."
                      error={fieldErrors.sign_in_window_minutes}
                    >
                      <input
                        id="sign-in-window-minutes"
                        name="sign_in_window_minutes"
                        type="number"
                        min={1}
                        className="w-sm"
                        defaultValue={
                          refilled
                            ? String(values.sign_in_window_minutes ?? "")
                            : settings.sign_in_window_minutes
                        }
                      />
                    </Field>
                    <Field
                      id="sign-in-limit-global"
                      label="Sign-in links per hour, all addresses"
                      error={fieldErrors.sign_in_limit_global_per_hour}
                    >
                      <input
                        id="sign-in-limit-global"
                        name="sign_in_limit_global_per_hour"
                        type="number"
                        min={1}
                        className="w-sm"
                        defaultValue={
                          refilled
                            ? String(values.sign_in_limit_global_per_hour ?? "")
                            : settings.sign_in_limit_global_per_hour
                        }
                      />
                    </Field>
                  </div>
                </fieldset>
              </>
            );
          }}
        </ActionForm>
      </Card>
      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Staff access</h2>
          {isCouple ? null : <Badge>View only</Badge>}
        </div>
        <DataTable
          columns={columns}
          rows={staff}
          rowKey={(person) => person.user_id}
          empty="No staff yet."
        />
        {isCouple ? (
          <AddPlannerForm />
        ) : (
          <div className="card-f card-f-start">
            <span className="muted">
              Only the couple can add or remove staff.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
