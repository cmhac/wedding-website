"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  confirmRemoveGuest,
  saveGuest,
  setGuestDietary,
} from "@/lib/admin/actions/guests";
import { updateHouseholdFields } from "@/lib/admin/actions/households";
import type { GuestDetail, HouseholdDetail } from "@/lib/admin/data/households";
import { formatPacific, isoToPacificLocal } from "@/lib/admin/time";
import { ConfirmPanel } from "./ConfirmPanel";
import { DataTable } from "./DataTable";
import { ActionForm, type ActionFormState } from "./forms/ActionForm";
import { ContactEmailForm } from "./forms/ContactEmailForm";
import { DeleteHouseholdForm } from "./forms/DeleteHouseholdForm";
import { Alert, Badge, Card, Field, PageHeader, TabLinks } from "./primitives";

/** A tab added by a later screen (for example the Answers tab). */
export type ExtraHouseholdTab = {
  value: string;
  label: string;
  /** The tab's content, shown when it is the selected tab. */
  body: ReactNode;
};

const NOTICES: Record<string, { variant: "ok" | "error"; text: string }> = {
  "guest-removed": { variant: "ok", text: "Guest removed." },
  "guest-not-removed": {
    variant: "error",
    text: "The guest was not removed. Please try again.",
  },
};

function guestName(guest: GuestDetail): string {
  return guest.isPlaceholder
    ? "Unnamed plus-one"
    : `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim();
}

/** What a field held when the last save failed, else its saved value. */
function typed(state: ActionFormState, name: string, saved: string): string {
  const value = state.values[name];
  return typeof value === "string" ? value : saved;
}

function plusOnes(count: number): string {
  return count === 1 ? "1 plus-one allowed" : `${count} plus-ones allowed`;
}

export function HouseholdDetailView({
  household,
  tab,
  guest,
  confirm,
  notice,
  extraTabs = [],
}: {
  household: HouseholdDetail;
  /** The `tab` query value. */
  tab: string;
  /** The `guest` query value: a guest id, or "new". */
  guest?: string;
  /** The `confirm` query value. */
  confirm?: string;
  /** The `notice` query value. */
  notice?: string;
  extraTabs?: ExtraHouseholdTab[];
}) {
  const basePath = `/admin/households/${household.id}`;
  const tabs = [
    { value: "details", label: "Details" },
    { value: "guests", label: `Guests (${household.guests.length})` },
    ...extraTabs.map(({ value, label }) => ({ value, label })),
    { value: "remove", label: "Remove" },
  ];
  const extra = extraTabs.find((candidate) => candidate.value === tab);
  const current = extra
    ? extra.value
    : tab === "guests" || tab === "remove"
      ? tab
      : "details";
  const shownNotice = notice ? NOTICES[notice] : undefined;

  return (
    <>
      <p className="crumbs">
        <Link href="/admin/households">Households</Link> /{" "}
        {household.displayName}
      </p>
      <PageHeader
        title={household.displayName}
        description={`${household.contactEmail ?? "No email"} · ${household.guests.length} ${household.guests.length === 1 ? "guest" : "guests"} · ${plusOnes(household.plusOneAllowance)}`}
        actions={
          <>
            {household.deliveryProblem ? (
              <Badge variant="bad">Delivery problem</Badge>
            ) : null}
            {household.contactEmail === null ? (
              <Badge variant="warn">Paper only</Badge>
            ) : !household.deliveryProblem ? (
              <Badge variant="ok">Email deliverable</Badge>
            ) : null}
          </>
        }
      />
      <TabLinks
        label="Household sections"
        basePath={basePath}
        param="tab"
        tabs={tabs}
        current={current}
      />
      {shownNotice ? (
        <Alert variant={shownNotice.variant}>{shownNotice.text}</Alert>
      ) : null}
      {current === "details" ? <DetailsTab household={household} /> : null}
      {current === "guests" ? (
        <GuestsTab household={household} guest={guest} confirm={confirm} />
      ) : null}
      {extra ? extra.body : null}
      {current === "remove" ? (
        <RemoveTab household={household} confirm={confirm} />
      ) : null}
    </>
  );
}

function DetailsTab({ household }: { household: HouseholdDetail }) {
  const namedPlusOnes = household.guests.filter(
    (g) => g.isPlusOne && !g.isPlaceholder,
  ).length;
  const effectiveDeadline =
    household.rsvpDeadlineOverride ?? household.defaultDeadline;
  const address = household.address ?? {};
  return (
    <div className="stack">
      <Card heading="Contact email">
        <ContactEmailForm
          householdId={household.id}
          email={household.contactEmail}
        />
      </Card>
      <Card heading="Household details">
        <ActionForm
          action={updateHouseholdFields}
          submitLabel="Save household"
          successMessage="Household saved."
        >
          {(state) => (
            <>
              <input type="hidden" name="id" value={household.id} />
              <div className="grid2">
                <Field
                  id="display-name"
                  label="Display name"
                  hint="Used for the greeting and the envelope."
                  error={state.fieldErrors.display_name}
                >
                  <input
                    id="display-name"
                    name="display_name"
                    type="text"
                    defaultValue={typed(
                      state,
                      "display_name",
                      household.displayName,
                    )}
                  />
                </Field>
                <Field
                  id="plus-one-allowance"
                  label="Plus-one allowance"
                  hint={`Cannot go below the plus-ones already named (${namedPlusOnes}).`}
                  error={state.fieldErrors.plus_one_allowance}
                >
                  <input
                    id="plus-one-allowance"
                    name="plus_one_allowance"
                    type="number"
                    min={0}
                    max={20}
                    className="w-sm"
                    defaultValue={typed(
                      state,
                      "plus_one_allowance",
                      String(household.plusOneAllowance),
                    )}
                  />
                </Field>
                <Field
                  id="rsvp-deadline-override"
                  label="RSVP deadline override (Pacific time)"
                  hint={
                    effectiveDeadline
                      ? `Currently using ${formatPacific(effectiveDeadline)}. Leave empty to use the default.`
                      : "No deadline is set. Leave empty to use the default."
                  }
                  error={state.fieldErrors.rsvp_deadline_override}
                >
                  <input
                    id="rsvp-deadline-override"
                    name="rsvp_deadline_override"
                    type="datetime-local"
                    defaultValue={typed(
                      state,
                      "rsvp_deadline_override",
                      isoToPacificLocal(household.rsvpDeadlineOverride),
                    )}
                  />
                </Field>
              </div>
              <fieldset className="group">
                <legend>Mailing address</legend>
                <div className="grid2">
                  {(
                    [
                      ["address_street", "Street", address.street],
                      ["address_city", "City", address.city],
                      ["address_region", "State or region", address.region],
                      [
                        "address_postal_code",
                        "Postal code",
                        address.postal_code,
                      ],
                      ["address_country", "Country", address.country],
                    ] as const
                  ).map(([name, label, saved]) => (
                    <Field
                      key={name}
                      id={name}
                      label={label}
                      error={state.fieldErrors[name]}
                    >
                      <input
                        id={name}
                        name={name}
                        type="text"
                        defaultValue={typed(state, name, saved ?? "")}
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
              <div className="grid2">
                <Field
                  id="message-to-couple"
                  label="Message from the household"
                  hint="Read only."
                >
                  <textarea
                    id="message-to-couple"
                    rows={3}
                    readOnly
                    defaultValue={household.messageToCouple ?? ""}
                  />
                </Field>
                <Field
                  id="staff-notes"
                  label="Staff notes"
                  hint="Never shown to guests."
                  error={state.fieldErrors.notes}
                >
                  <textarea
                    id="staff-notes"
                    name="notes"
                    rows={3}
                    defaultValue={typed(state, "notes", household.notes ?? "")}
                  />
                </Field>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  name="reminders_opt_out"
                  value="on"
                  defaultChecked={
                    Object.keys(state.values).length > 0
                      ? "reminders_opt_out" in state.values
                      : household.remindersOptOut
                  }
                />
                <span>
                  Household turned off reminders. Essential messages still go
                  out.
                </span>
              </label>
              <p className="muted">
                Delivery problem:{" "}
                <strong>{household.deliveryProblem ? "Yes" : "No"}</strong>. Set
                automatically when an email bounces and cleared when the contact
                email changes.
              </p>
            </>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}

function GuestsTab({
  household,
  guest,
  confirm,
}: {
  household: HouseholdDetail;
  guest?: string;
  confirm?: string;
}) {
  const base = `/admin/households/${household.id}?tab=guests`;
  const chosen = household.guests.find((g) => g.id === guest);

  return (
    <div className="stack">
      {chosen && confirm === "remove-guest" ? (
        <ConfirmPanel
          heading={`Remove ${guestName(chosen)}?`}
          consequence="This removes the guest, along with their invitations, answers and meal choices. It cannot be undone."
          action={confirmRemoveGuest}
          confirmLabel="Remove guest"
          cancelHref={base}
          hiddenFields={{
            household_id: household.id,
            guest_id: chosen.id,
            confirm: "remove-guest",
          }}
        />
      ) : null}
      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Guests</h2>
          <Link href={`${base}&guest=new`} className="btn btn-sm btn-primary">
            Add guest
          </Link>
        </div>
        <DataTable
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (g) => (
                <>
                  {g.isPlaceholder ? (
                    <em className="muted">Unnamed plus-one</em>
                  ) : (
                    <strong>{guestName(g)}</strong>
                  )}{" "}
                  {g.isPlusOne ? <Badge>Plus-one</Badge> : null}
                  {g.email ? <div className="table-sub">{g.email}</div> : null}
                </>
              ),
            },
            {
              key: "dietary",
              header: "Dietary needs",
              cell: (g) => (
                <ul className="plain-list">
                  {g.dietary.map((entry) => (
                    <li key={entry.categoryKey}>
                      {entry.label}{" "}
                      <Badge
                        variant={
                          entry.severity === "allergy" ? "bad" : "default"
                        }
                      >
                        {entry.severity === "allergy"
                          ? "Allergy"
                          : "Preference"}
                      </Badge>
                      {entry.details ? (
                        <div className="table-sub">{entry.details}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: "notes",
              header: "Notes",
              cell: (g) => (
                <>
                  {g.dietaryNotes ? <div>{g.dietaryNotes}</div> : null}
                  {g.notes ? <div>{g.notes}</div> : null}
                </>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              hideHeader: true,
              cell: (g) => (
                <div className="row">
                  <Link href={`${base}&guest=${g.id}`} className="btn btn-sm">
                    {g.isPlaceholder ? "Name this guest" : "Edit"}
                    <span className="sr-only"> {guestName(g)}</span>
                  </Link>
                  <Link
                    href={`${base}&guest=${g.id}&confirm=remove-guest`}
                    className="btn btn-sm btn-quiet"
                  >
                    Remove<span className="sr-only"> {guestName(g)}</span>
                  </Link>
                </div>
              ),
            },
          ]}
          rows={household.guests}
          rowKey={(g) => g.id}
          empty="This household has no guests yet."
        />
      </section>
      {guest === "new" ? (
        <GuestForm household={household} guest={null} cancelHref={base} />
      ) : null}
      {chosen && confirm !== "remove-guest" ? (
        <>
          <GuestForm household={household} guest={chosen} cancelHref={base} />
          {!chosen.isPlaceholder ? (
            <DietarySection household={household} guest={chosen} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function GuestForm({
  household,
  guest,
  cancelHref,
}: {
  household: HouseholdDetail;
  guest: GuestDetail | null;
  cancelHref: string;
}) {
  const heading = !guest
    ? "Add guest"
    : guest.isPlaceholder
      ? "Name this guest"
      : `Edit ${guestName(guest)}`;
  return (
    <Card heading={heading}>
      <ActionForm
        action={saveGuest}
        submitLabel="Save guest"
        successMessage="Guest saved."
      >
        {(state) => (
          <>
            <input type="hidden" name="household_id" value={household.id} />
            {guest ? (
              <input type="hidden" name="guest_id" value={guest.id} />
            ) : null}
            {guest?.isPlaceholder ? (
              <input type="hidden" name="is_placeholder" value="true" />
            ) : null}
            {!guest ? (
              <>
                <label className="check">
                  <input type="checkbox" name="is_placeholder" value="true" />
                  <span>
                    Unnamed plus-one seat. Name it later; no names are needed
                    now.
                  </span>
                </label>
                <label className="check">
                  <input type="checkbox" name="is_plus_one" value="on" />
                  <span>This guest is a plus-one.</span>
                </label>
              </>
            ) : null}
            <div className="grid2">
              <Field
                id="guest-first-name"
                label="First name"
                error={state.fieldErrors.first_name}
              >
                <input
                  id="guest-first-name"
                  name="first_name"
                  type="text"
                  defaultValue={typed(
                    state,
                    "first_name",
                    guest?.firstName ?? "",
                  )}
                />
              </Field>
              <Field
                id="guest-last-name"
                label="Last name"
                error={state.fieldErrors.last_name}
              >
                <input
                  id="guest-last-name"
                  name="last_name"
                  type="text"
                  defaultValue={typed(
                    state,
                    "last_name",
                    guest?.lastName ?? "",
                  )}
                />
              </Field>
              <Field
                id="guest-email"
                label="Email"
                error={state.fieldErrors.email}
              >
                <input
                  id="guest-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  defaultValue={typed(state, "email", guest?.email ?? "")}
                />
              </Field>
              <Field id="guest-dietary-notes" label="Dietary notes">
                <textarea
                  id="guest-dietary-notes"
                  name="dietary_notes"
                  rows={2}
                  defaultValue={typed(
                    state,
                    "dietary_notes",
                    guest?.dietaryNotes ?? "",
                  )}
                />
              </Field>
              <Field id="guest-notes" label="Staff notes">
                <textarea
                  id="guest-notes"
                  name="notes"
                  rows={2}
                  defaultValue={typed(state, "notes", guest?.notes ?? "")}
                />
              </Field>
            </div>
            <div className="row">
              <Link href={cancelHref} className="btn">
                Cancel
              </Link>
            </div>
          </>
        )}
      </ActionForm>
    </Card>
  );
}

function DietarySection({
  household,
  guest,
}: {
  household: HouseholdDetail;
  guest: GuestDetail;
}) {
  return (
    <Card heading={`Dietary needs for ${guestName(guest)}`}>
      <div className="stack">
        {guest.dietary.map((entry) => (
          <ActionForm
            key={entry.categoryKey}
            action={setGuestDietary}
            submitLabel={`Remove ${entry.label}`}
          >
            <input type="hidden" name="household_id" value={household.id} />
            <input type="hidden" name="guest_id" value={guest.id} />
            <input type="hidden" name="op" value="remove" />
            <input
              type="hidden"
              name="category_key"
              value={entry.categoryKey}
            />
            <p>
              {entry.label}{" "}
              <Badge variant={entry.severity === "allergy" ? "bad" : "default"}>
                {entry.severity === "allergy" ? "Allergy" : "Preference"}
              </Badge>
            </p>
          </ActionForm>
        ))}
        <ActionForm
          action={setGuestDietary}
          submitLabel="Add dietary need"
          successMessage="Dietary need saved."
        >
          {(state) => (
            <>
              <input type="hidden" name="household_id" value={household.id} />
              <input type="hidden" name="guest_id" value={guest.id} />
              <input type="hidden" name="op" value="add" />
              <div className="grid2">
                <Field
                  id="dietary-category"
                  label="Dietary category"
                  error={state.fieldErrors.category_key}
                >
                  <select
                    id="dietary-category"
                    name="category_key"
                    defaultValue={typed(state, "category_key", "")}
                  >
                    <option value="">Choose a category</option>
                    {household.dietaryCategories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="dietary-severity"
                  label="Severity"
                  error={state.fieldErrors.severity}
                >
                  <select
                    id="dietary-severity"
                    name="severity"
                    defaultValue={typed(state, "severity", "preference")}
                  >
                    <option value="preference">Preference</option>
                    <option value="allergy">Allergy</option>
                  </select>
                </Field>
                <Field id="dietary-details" label="Details (optional)">
                  <input
                    id="dietary-details"
                    name="details"
                    type="text"
                    defaultValue={typed(state, "details", "")}
                  />
                </Field>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </Card>
  );
}

function RemoveTab({
  household,
  confirm,
}: {
  household: HouseholdDetail;
  confirm?: string;
}) {
  const base = `/admin/households/${household.id}?tab=remove`;
  return (
    <section className="danger-zone">
      <div className="card-b stack">
        <div>
          <h2 className="card-t">Delete this household</h2>
          <p className="muted">
            Deletes the household, its guests, all answers and meal choices, and
            its sign-in account. History keeps the change without names. This
            cannot be undone.
          </p>
        </div>
        {confirm === "delete" ? (
          <DeleteHouseholdForm
            householdId={household.id}
            householdName={household.displayName}
            cancelHref={base}
          />
        ) : (
          <div>
            <Link href={`${base}&confirm=delete`} className="btn btn-danger">
              Delete {household.displayName}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
