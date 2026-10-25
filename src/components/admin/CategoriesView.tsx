import type { ActionResult } from "@/lib/admin/actions/shared";
import type { DietaryCategory } from "@/lib/admin/data/menus";
import { DataTable, type Column } from "./DataTable";
import { ActionForm } from "./forms/ActionForm";
import { Badge, Card, Field } from "./primitives";

const columns: Column<DietaryCategory>[] = [
  {
    key: "order",
    header: "Order",
    numeric: true,
    cell: (c) => c.displayOrder ?? "",
  },
  { key: "label", header: "Label", cell: (c) => <strong>{c.label}</strong> },
  {
    key: "kind",
    header: "Kind",
    cell: (c) => (
      <Badge variant={c.kind === "allergen" ? "bad" : "ok"}>
        {c.kind === "allergen" ? "Allergen" : "Diet"}
      </Badge>
    ),
  },
  {
    key: "meaning",
    header: "When tagged on a dish it means",
    cell: (c) => (c.kind === "allergen" ? "Contains" : "Suitable for"),
  },
];

export function CategoriesView({
  categories,
  action,
}: {
  categories: DietaryCategory[];
  action: (
    previous: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
}) {
  return (
    <div className="stack">
      <section className="card">
        <DataTable
          columns={columns}
          rows={categories}
          rowKey={(c) => c.key}
          empty="No dietary categories yet."
        />
      </section>
      <Card heading="Add a category">
        <ActionForm
          action={action}
          submitLabel="Add category"
          successMessage="Category added."
        >
          {({ fieldErrors, values }) => (
            <div className="row-end">
              <Field
                id="category-label"
                label="Label"
                error={fieldErrors.label}
              >
                <input
                  id="category-label"
                  type="text"
                  name="label"
                  defaultValue={
                    typeof values.label === "string" ? values.label : ""
                  }
                />
              </Field>
              <Field id="category-kind" label="Kind" error={fieldErrors.kind}>
                <select id="category-kind" name="kind" defaultValue="diet">
                  <option value="diet">Diet</option>
                  <option value="allergen">Allergen</option>
                </select>
              </Field>
            </div>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
