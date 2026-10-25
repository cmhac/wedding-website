import type { ActionResult } from "@/lib/admin/actions/shared";
import type { DietaryCategory } from "@/lib/admin/data/menus";
import { ActionForm } from "./forms/ActionForm";
import { Card, EmptyState, Field } from "./primitives";

type SaveAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export type EditingDish = {
  id: string;
  courseId: string;
  name: string;
  description: string | null;
  tagKeys: string[];
};

export type AddMenuItemFormsProps = {
  eventId: string;
  menuId: string;
  courses: { id: string; name: string }[];
  categories: DietaryCategory[];
  /** Suggested order for a new course. */
  nextCourseOrder: number;
  /** When set, the dish form edits this dish instead of adding one. */
  editingDish?: EditingDish;
  actions: { saveCourse: SaveAction; saveDish: SaveAction };
};

const asText = (value: string | string[] | undefined, fallback = "") =>
  Array.isArray(value) ? (value[0] ?? fallback) : (value ?? fallback);

export function AddMenuItemForms({
  eventId,
  menuId,
  courses,
  categories,
  nextCourseOrder,
  editingDish,
  actions,
}: AddMenuItemFormsProps) {
  return (
    <div className="grid2">
      <Card heading="Add a course">
        <ActionForm
          action={actions.saveCourse}
          submitLabel="Add course"
          successMessage="Course added."
        >
          {({ fieldErrors, values }) => (
            <>
              <input type="hidden" name="menu_id" value={menuId} />
              <Field
                id="course-name"
                label="Course name"
                error={fieldErrors.name}
              >
                <input
                  id="course-name"
                  type="text"
                  name="name"
                  defaultValue={asText(values.name)}
                />
              </Field>
              <Field
                id="course-order"
                label="Order"
                error={fieldErrors.display_order}
              >
                <input
                  id="course-order"
                  type="number"
                  name="display_order"
                  className="w-sm"
                  defaultValue={asText(
                    values.display_order,
                    String(nextCourseOrder),
                  )}
                />
              </Field>
              <input type="hidden" name="requires_choice" value="false" />
              <label className="check">
                <input
                  type="checkbox"
                  name="requires_choice"
                  value="true"
                  defaultChecked={
                    !values.requires_choice ||
                    [values.requires_choice].flat().includes("true")
                  }
                />{" "}
                <span>Guests must choose a dish</span>
              </label>
            </>
          )}
        </ActionForm>
      </Card>

      <Card heading={editingDish ? "Edit dish" : "Add a dish"}>
        {courses.length === 0 ? (
          <EmptyState>Add a course before adding dishes.</EmptyState>
        ) : (
          <ActionForm
            key={editingDish?.id ?? "new"}
            action={actions.saveDish}
            submitLabel={editingDish ? "Save dish" : "Add dish"}
            successMessage={editingDish ? "Dish saved." : "Dish added."}
          >
            {({ fieldErrors, values }) => {
              const submitted = Object.keys(values).length > 0;
              const checked = submitted
                ? new Set([values.tags ?? []].flat())
                : new Set(editingDish?.tagKeys ?? []);
              return (
                <>
                  <input type="hidden" name="event_id" value={eventId} />
                  {editingDish ? (
                    <input type="hidden" name="id" value={editingDish.id} />
                  ) : null}
                  <Field
                    id="dish-course"
                    label="Course"
                    error={fieldErrors.course_id}
                  >
                    <select
                      id="dish-course"
                      name="course_id"
                      defaultValue={asText(
                        values.course_id,
                        editingDish?.courseId ?? courses[0].id,
                      )}
                    >
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    id="dish-name"
                    label="Dish name"
                    error={fieldErrors.name}
                  >
                    <input
                      id="dish-name"
                      type="text"
                      name="name"
                      defaultValue={asText(values.name, editingDish?.name)}
                    />
                  </Field>
                  <Field
                    id="dish-description"
                    label="Description"
                    error={fieldErrors.description}
                  >
                    <textarea
                      id="dish-description"
                      name="description"
                      rows={2}
                      defaultValue={asText(
                        values.description,
                        editingDish?.description ?? "",
                      )}
                    />
                  </Field>
                  <fieldset className="group">
                    <legend>Dietary tags</legend>
                    {categories.map((category) => (
                      <label key={category.key} className="check">
                        <input
                          type="checkbox"
                          name="tags"
                          value={category.key}
                          defaultChecked={checked.has(category.key)}
                        />{" "}
                        <span>
                          {category.label}{" "}
                          <span className="muted">
                            {category.kind === "diet"
                              ? "(suitable for)"
                              : "(contains)"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </>
              );
            }}
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
