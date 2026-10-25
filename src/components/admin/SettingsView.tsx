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
  };
  staff: Pick<StaffRow, "user_id" | "display_name" | "role">[];
};

export function SettingsView({
  role,
  currentUserId,
  settings,
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
