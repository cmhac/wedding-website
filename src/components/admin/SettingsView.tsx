"use client";

import type { StaffRow } from "@/lib/admin/data/settings";
import {
  saveSaveTheDate,
  saveSettings,
  saveSmsSwitch,
} from "@/lib/admin/actions/settings";
import { eventTitle, formatLongDate } from "@/lib/calendar/details";
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
    /** The couple's texting switch. */
    sms_enabled?: boolean;
  };
  /** True when the text provider is configured: only then is the switch shown. */
  smsConfigured?: boolean;
  /** Events to choose the wedding from. */
  events: { id: string; name: string }[];
  staff: Pick<StaffRow, "user_id" | "display_name" | "role">[];
  /** The card's facts as saved, for the save the date section; the section is left out without it. */
  saveTheDate?: {
    /** The wedding event's date (`YYYY-MM-DD`), or null while not set. */
    date: string | null;
    place: string;
    note: string;
    coupleNames: string | null;
    /** The save the date text as guests will get it, with a sample link; null when there is none. */
    textPreview: string | null;
    textSegments: number | null;
  };
};

export function SettingsView({
  role,
  currentUserId,
  settings,
  events,
  staff,
  smsConfigured = false,
  saveTheDate,
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
      {smsConfigured ? (
        <Card heading="Text messaging">
          <p className="muted">
            {settings.sms_enabled
              ? "Texting is on. Guests with a phone number are asked to opt in at their next sign-in, and only numbers that opted in are texted."
              : "Texting is off. No texts are sent and guests are not asked to opt in. Turn it on once the carriers have approved the registration."}
          </p>
          <ActionForm
            action={saveSmsSwitch as ActionFormProps["action"]}
            submitLabel="Save"
            successMessage={undefined}
          >
            {() => (
              <label className="check">
                <input
                  type="checkbox"
                  name="sms_enabled"
                  defaultChecked={settings.sms_enabled === true}
                  disabled={!isCouple}
                />{" "}
                <span>
                  <strong>Texting is on</strong>
                  <br />
                  <span className="muted">
                    {isCouple
                      ? "Turning this on texts nobody by itself."
                      : "Only the couple can change this."}
                  </span>
                </span>
              </label>
            )}
          </ActionForm>
        </Card>
      ) : null}
      {saveTheDate ? (
        <Card heading="Save the date">
          <p className="muted">
            What the printed card says, kept in one place. The page, the email,
            the text and the calendar entry all use it.
          </p>
          <p>
            <strong>Wedding date:</strong>{" "}
            {saveTheDate.date ? (
              <>
                {formatLongDate(saveTheDate.date)}{" "}
                <span className="muted">
                  (from the wedding event. Set the wedding event above to change
                  it.)
                </span>
              </>
            ) : (
              <span className="muted">
                The wedding date is not set. Choose the wedding event below and
                give it a date.
              </span>
            )}
          </p>
          <ActionForm
            action={saveSaveTheDate as ActionFormProps["action"]}
            submitLabel="Save details"
            successMessage="Save the date details saved."
          >
            {({ fieldErrors, values }) => {
              const refilled = Object.keys(values).length > 0;
              return (
                <>
                  <Field
                    id="save-the-date-place"
                    label="Place"
                    hint="Shown under the date, for example a city. Optional."
                    error={fieldErrors.save_the_date_place}
                  >
                    <input
                      id="save-the-date-place"
                      name="save_the_date_place"
                      type="text"
                      maxLength={200}
                      defaultValue={
                        refilled
                          ? String(values.save_the_date_place ?? "")
                          : saveTheDate.place
                      }
                    />
                  </Field>
                  <Field
                    id="save-the-date-note"
                    label="Note"
                    hint='A short line, for example "Invitation to follow". Optional.'
                    error={fieldErrors.save_the_date_note}
                  >
                    <input
                      id="save-the-date-note"
                      name="save_the_date_note"
                      type="text"
                      maxLength={300}
                      defaultValue={
                        refilled
                          ? String(values.save_the_date_note ?? "")
                          : saveTheDate.note
                      }
                    />
                  </Field>
                </>
              );
            }}
          </ActionForm>
          <div className="stack-sm">
            <p className="strong">How it will read</p>
            <p>
              <span className="muted">Calendar entry: </span>
              {eventTitle(saveTheDate.coupleNames)}
            </p>
            {saveTheDate.textPreview ? (
              <p>
                <span className="muted">
                  Text message
                  {saveTheDate.textSegments
                    ? ` (${saveTheDate.textSegments} ${saveTheDate.textSegments === 1 ? "segment" : "segments"})`
                    : ""}
                  :{" "}
                </span>
                {saveTheDate.textPreview}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}
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
                    id="rsvp-open"
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
