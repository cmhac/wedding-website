import type { AnswerRow, MealChoice } from "@/lib/admin/data/answers";
import { AnsweredByBadge } from "./AnsweredBy";
import { DataTable, type Column } from "./DataTable";
import { ResultForm, type ResultFormProps } from "./forms/ResultForm";
import { Alert, Badge, type BadgeVariant } from "./primitives";

type Saved = ResultFormProps<{ message: string }>["action"];

/** The three server actions the tab posts to (from `actions/answers.ts`). */
export type AnswersViewActions = {
  recordRsvp: Saved;
  recordMeal: Saved;
  inviteGuests: Saved;
};

export type AnswersViewProps = {
  /** From `loadHouseholdAnswers`. */
  rows: AnswerRow[];
  /** Every guest in the household, for "Invite to another event". */
  guestIds: string[];
  /** Events this household is not invited to yet, for the invite select. */
  otherEvents: { id: string; name: string }[];
  actions: AnswersViewActions;
};

const STATUS: Record<
  AnswerRow["status"],
  { label: string; variant: BadgeVariant }
> = {
  attending: { label: "Attending", variant: "ok" },
  pending: { label: "Pending", variant: "warn" },
  declined: { label: "Declined", variant: "default" },
};

const STATUS_ORDER: AnswerRow["status"][] = [
  "pending",
  "attending",
  "declined",
];

function MealControl({
  row,
  meal,
  action,
}: {
  row: AnswerRow;
  meal: MealChoice;
  action: Saved;
}) {
  const label = `${row.guestName}, ${row.eventName}, ${meal.courseName}`;
  const id = `meal-${row.guestId}-${row.eventId}-${meal.courseId}`;
  return (
    <div className="stack-sm">
      <div>
        <span>
          {meal.dishName
            ? `${meal.courseName}: ${meal.dishName}`
            : `${meal.courseName}: not chosen`}
        </span>
        {meal.dishName ? (
          <>
            {" "}
            <AnsweredByBadge answeredBy={meal.answeredBy} />
          </>
        ) : null}
      </div>
      <ResultForm
        action={action}
        inline
        submitLabel="Save"
        submitAriaLabel={`Save meal for ${label}`}
      >
        <input type="hidden" name="guest_id" value={row.guestId} />
        <input type="hidden" name="course_id" value={meal.courseId} />
        <select
          id={id}
          name="dish_id"
          aria-label={`Meal for ${label}`}
          defaultValue={meal.dishId ?? ""}
        >
          <option value="">No choice</option>
          {meal.options.map((dish) => (
            <option key={dish.id} value={dish.id}>
              {dish.name}
            </option>
          ))}
        </select>
      </ResultForm>
    </div>
  );
}

/**
 * The household's Answers tab: every invitation with its answer, who gave it,
 * the meals, and controls to record an answer or a meal on the household's
 * behalf. Staff are not bound by the deadline or the RSVPs-open setting.
 */
export function AnswersView({
  rows,
  guestIds,
  otherEvents,
  actions,
}: AnswersViewProps) {
  const columns: Column<AnswerRow>[] = [
    {
      key: "guest",
      header: "Guest and event",
      cell: (r) => (
        <>
          <strong>{r.guestName}</strong>
          <div className="table-sub">{r.eventName}</div>
        </>
      ),
    },
    {
      key: "answer",
      header: "Answer",
      cell: (r) => (
        <Badge variant={STATUS[r.status].variant}>
          {STATUS[r.status].label}
        </Badge>
      ),
    },
    {
      key: "by",
      header: "Answered by",
      cell: (r) => (
        <>
          <AnsweredByBadge answeredBy={r.answeredBy} />
          {r.answeredAt && r.answeredBy.kind !== "staff" ? (
            <div className="table-sub">{r.answeredAt}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "meals",
      header: "Meals",
      cell: (r) =>
        r.status === "declined" || r.meals.length === 0 ? (
          <span className="muted">No meals</span>
        ) : (
          <div className="stack">
            {r.meals.map((meal) => (
              <MealControl
                key={meal.courseId}
                row={r}
                meal={meal}
                action={actions.recordMeal}
              />
            ))}
          </div>
        ),
    },
    {
      key: "record",
      header: "Record on their behalf",
      cell: (r) => {
        const label = `${r.guestName}, ${r.eventName}`;
        return (
          <ResultForm
            action={actions.recordRsvp}
            inline
            submitLabel="Save"
            submitAriaLabel={`Save answer for ${label}`}
          >
            <input type="hidden" name="guest_id" value={r.guestId} />
            <input type="hidden" name="event_id" value={r.eventId} />
            <select
              name="status"
              aria-label={`Answer for ${label}`}
              defaultValue={r.status}
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS[status].label}
                </option>
              ))}
            </select>
          </ResultForm>
        );
      },
    },
  ];

  return (
    <section className="card">
      <div className="card-h">
        <h2 className="card-t">Invitations and answers</h2>
      </div>
      <div className="card-b">
        <Alert variant="info">
          Every answer shows who gave it. Answers entered by staff are marked
          Recorded by staff, with the staff member&apos;s name. Staff can record
          answers any time, even after the deadline.
        </Alert>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.guestId}:${r.eventId}`}
        empty="No invitations yet. Use Invite to another event below."
      />
      <div className="card-f card-f-split">
        <span className="muted small">
          Declining clears that guest&apos;s meal choices for the event. History
          keeps them.
        </span>
        {otherEvents.length === 0 ? (
          <span className="muted small">
            This household is invited to every event.
          </span>
        ) : (
          <ResultForm
            action={actions.inviteGuests}
            inline
            submitLabel="Invite"
            submitAriaLabel="Invite"
          >
            {guestIds.map((id) => (
              <input key={id} type="hidden" name="guest_ids" value={id} />
            ))}
            <select name="event_id" aria-label="Invite to another event">
              {otherEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  Invite to {event.name}
                </option>
              ))}
            </select>
          </ResultForm>
        )}
      </div>
    </section>
  );
}
