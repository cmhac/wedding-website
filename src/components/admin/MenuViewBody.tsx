import Link from "next/link";
import type {
  CourseView,
  DishView,
  MenuEvent,
  MenuStatus,
  MenuView,
} from "@/lib/admin/data/menus";
import type { ActionResult } from "@/lib/admin/actions/shared";
import { ConfirmPanel } from "./ConfirmPanel";
import { DataTable, type Column } from "./DataTable";
import { ActionForm } from "./forms/ActionForm";
import { Alert, Badge, Field } from "./primitives";

export const STATUS_OPTIONS: { value: MenuStatus; label: string }[] = [
  { value: "draft", label: "Draft (staff only)" },
  { value: "published", label: "Published (guests can choose)" },
  { value: "closed", label: "Closed (guests can view only)" },
];

export type MenuViewActions = {
  setMenuStatus: (
    previous: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  archiveDish: (formData: FormData) => void | Promise<void>;
  restoreDish: (formData: FormData) => void | Promise<void>;
};

export type MenuViewBodyProps = {
  events: MenuEvent[];
  event: MenuEvent;
  /** Null when the event has no menu yet. */
  menu: MenuView | null;
  /** Show the archive confirmation for this dish. */
  confirmArchiveDishId?: string;
  /** What the last archive affected, for the result sentence. */
  archiveResult?: { guests: number; households: number };
  /** A plain-English refusal from the last archive or restore. */
  errorMessage?: string;
  actions: MenuViewActions;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function menuHref(slug: string, params: Record<string, string> = {}): string {
  return `/admin/menus?${new URLSearchParams({ event: slug, ...params }).toString()}`;
}

function tagLabel(tag: DishView["tags"][number]): string {
  return tag.kind === "allergen"
    ? `Contains ${tag.label.toLowerCase()}`
    : tag.label;
}

export function MenuViewBody({
  events,
  event,
  menu,
  confirmArchiveDishId,
  archiveResult,
  errorMessage,
  actions,
}: MenuViewBodyProps) {
  const dishToArchive = menu?.courses
    .flatMap((course) => course.dishes)
    .find((dish) => dish.id === confirmArchiveDishId && !dish.archivedAt);

  return (
    <div className="stack">
      <div className="row-end">
        <form method="get" action="/admin/menus" className="row-end">
          <div className="field">
            <label htmlFor="menu-event">Event</label>
            <select id="menu-event" name="event" defaultValue={event.slug}>
              {events.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            Show menu
          </button>
        </form>
        {menu ? (
          <ActionForm
            action={actions.setMenuStatus}
            submitLabel="Update status"
            successMessage="Menu status updated."
          >
            {({ fieldErrors }) => (
              <>
                <input type="hidden" name="event_id" value={event.id} />
                <Field
                  id="menu-status"
                  label="Menu status"
                  error={fieldErrors.status}
                >
                  <select
                    id="menu-status"
                    name="status"
                    defaultValue={menu.status}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </ActionForm>
        ) : null}
      </div>

      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      {archiveResult ? (
        <Alert variant="ok">
          {archiveResult.guests === 0
            ? "Archived. Nobody needs to choose again."
            : `Archived. ${plural(archiveResult.guests, "guest", "guests")} in ${plural(archiveResult.households, "household", "households")} ${archiveResult.guests === 1 ? "needs" : "need"} to choose again.`}{" "}
          {archiveResult.guests > 0 ? (
            <Link href="/admin/households">Open those households</Link>
          ) : null}
        </Alert>
      ) : null}

      {dishToArchive ? (
        <ConfirmPanel
          heading={`Archive ${dishToArchive.name}?`}
          consequence={
            dishToArchive.chosenCount === 0
              ? "It leaves the menu. Nobody has chosen it, so nobody will need to choose again."
              : `It leaves the menu and clears ${dishToArchive.chosenCount} ${dishToArchive.chosenCount === 1 ? "guest's choice" : "guests' choices"} (kept in history). Those guests will need to choose again.`
          }
          action={actions.archiveDish}
          confirmLabel="Archive dish"
          cancelHref={menuHref(event.slug, { tab: "menu" })}
          hiddenFields={{ event: event.slug, dish_id: dishToArchive.id }}
        />
      ) : null}

      {menu ? (
        menu.courses.length === 0 ? (
          <Alert variant="info">
            This menu has no courses yet. Add one on the Add course or dish tab.
          </Alert>
        ) : (
          menu.courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              eventSlug={event.slug}
              restoreDish={actions.restoreDish}
            />
          ))
        )
      ) : (
        <div className="card">
          <div className="card-b stack-sm">
            <p>{event.name} does not have a menu yet.</p>
            <ActionForm
              action={actions.setMenuStatus}
              submitLabel="Create menu"
            >
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="status" value="draft" />
            </ActionForm>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  eventSlug,
  restoreDish,
}: {
  course: CourseView;
  eventSlug: string;
  restoreDish: MenuViewActions["restoreDish"];
}) {
  const columns: Column<DishView>[] = [
    {
      key: "dish",
      header: "Dish",
      cell: (dish) =>
        dish.archivedAt ? (
          <>
            <span className="muted">
              <s>{dish.name}</s>
            </span>{" "}
            <Badge>Archived</Badge>
          </>
        ) : (
          <>
            <strong>{dish.name}</strong>
            {dish.description ? (
              <div className="table-sub">{dish.description}</div>
            ) : null}
          </>
        ),
    },
    {
      key: "tags",
      header: "Dietary tags",
      cell: (dish) =>
        dish.archivedAt
          ? null
          : dish.tags.map((tag) => (
              <span key={tag.key}>
                <Badge variant={tag.kind === "allergen" ? "bad" : "ok"}>
                  {tagLabel(tag)}
                </Badge>{" "}
              </span>
            )),
    },
    {
      key: "chosen",
      header: "Chosen by",
      numeric: true,
      cell: (dish) => dish.chosenCount,
    },
    {
      key: "actions",
      header: "Actions",
      hideHeader: true,
      cell: (dish) =>
        dish.archivedAt ? (
          <form action={restoreDish}>
            <input type="hidden" name="event" value={eventSlug} />
            <input type="hidden" name="dish_id" value={dish.id} />
            <button
              type="submit"
              className="btn btn-sm btn-quiet"
              aria-label={`Restore ${dish.name}`}
            >
              Restore
            </button>
          </form>
        ) : (
          <div className="row">
            <Link
              className="btn btn-sm"
              href={menuHref(eventSlug, { tab: "add", dish: dish.id })}
              aria-label={`Edit ${dish.name}`}
            >
              Edit
            </Link>
            <Link
              className="btn btn-sm btn-quiet"
              href={menuHref(eventSlug, {
                tab: "menu",
                confirm: "archive",
                dish: dish.id,
              })}
              aria-label={`Archive ${dish.name}`}
            >
              Archive
            </Link>
          </div>
        ),
    },
  ];

  return (
    <section className="card">
      <div className="card-h">
        <div>
          <h2 className="card-t">{course.name}</h2>
          <span className="muted small">
            {course.requiresChoice
              ? "Guests must choose one"
              : "Choice is optional"}
          </span>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={course.dishes}
        rowKey={(dish) => dish.id}
        empty="No dishes in this course yet."
      />
    </section>
  );
}
