import { render, screen, within } from "@testing-library/react";
import { MenuViewBody } from "../MenuViewBody";
import { AddMenuItemForms } from "../AddMenuItemForms";
import { CategoriesView } from "../CategoriesView";
import type {
  DietaryCategory,
  MenuEvent,
  MenuView,
} from "@/lib/admin/data/menus";

const noop = jest.fn(async () => ({ ok: true as const }));
const formAction = jest.fn();

const events: MenuEvent[] = [
  { id: "e1", slug: "wedding", name: "Ceremony and reception" },
  { id: "e2", slug: "welcome", name: "Welcome party" },
];

const menu: MenuView = {
  id: "m1",
  status: "published",
  courses: [
    {
      id: "c1",
      name: "Main",
      displayOrder: 1,
      requiresChoice: true,
      dishes: [
        {
          id: "d1",
          name: "Herb-crusted chicken",
          description: "Roasted vegetables",
          archivedAt: null,
          chosenCount: 24,
          tags: [
            {
              key: "nuts",
              label: "Tree nuts",
              kind: "allergen",
              meaning: "contains",
            },
            {
              key: "vegetarian",
              label: "Vegetarian",
              kind: "diet",
              meaning: "suitable for",
            },
          ],
        },
        {
          id: "d2",
          name: "Beef short rib",
          description: null,
          archivedAt: "2026-10-01T00:00:00Z",
          chosenCount: 0,
          tags: [],
        },
      ],
    },
    {
      id: "c2",
      name: "Dessert",
      displayOrder: 2,
      requiresChoice: false,
      dishes: [],
    },
  ],
};

const actions = {
  setMenuStatus: noop,
  archiveDish: formAction,
  restoreDish: formAction,
};

function renderBody(extra: Partial<Parameters<typeof MenuViewBody>[0]> = {}) {
  return render(
    <MenuViewBody
      events={events}
      event={events[0]}
      menu={menu}
      actions={actions}
      {...extra}
    />,
  );
}

describe("MenuViewBody", () => {
  it("has an event select with the current event chosen", () => {
    renderBody();
    const select = screen.getByLabelText("Event") as HTMLSelectElement;
    expect(select.value).toBe("wedding");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Ceremony and reception", "Welcome party"]);
  });

  it("has a menu status select with the plain-English options", () => {
    renderBody();
    const select = screen.getByLabelText("Menu status") as HTMLSelectElement;
    expect(select.value).toBe("published");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Draft (staff only)",
      "Published (guests can choose)",
      "Closed (guests can view only)",
    ]);
  });

  it("shows each course with its choice rule", () => {
    renderBody();
    expect(screen.getByRole("heading", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByText("Guests must choose one")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dessert" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Choice is optional")).toBeInTheDocument();
    expect(
      screen.getByText("No dishes in this course yet."),
    ).toBeInTheDocument();
  });

  it("shows dish rows with description, tag badges, chosen count, Edit and Archive", () => {
    renderBody();
    const row = screen
      .getByText("Herb-crusted chicken")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("Roasted vegetables")).toBeInTheDocument();
    expect(within(row).getByText("Contains tree nuts")).toBeInTheDocument();
    expect(within(row).getByText("Vegetarian")).toBeInTheDocument();
    expect(within(row).getByText("24")).toBeInTheDocument();
    expect(
      within(row).getByRole("link", { name: "Edit Herb-crusted chicken" }),
    ).toHaveAttribute("href", "/admin/menus?event=wedding&tab=add&dish=d1");
    expect(
      within(row).getByRole("link", { name: "Archive Herb-crusted chicken" }),
    ).toHaveAttribute(
      "href",
      "/admin/menus?event=wedding&tab=menu&confirm=archive&dish=d1",
    );
  });

  it("strikes through an archived dish, badges it and offers Restore only", () => {
    renderBody();
    const row = screen.getByText("Beef short rib").closest("tr") as HTMLElement;
    expect(screen.getByText("Beef short rib").closest("s")).not.toBeNull();
    expect(within(row).getByText("Archived")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Restore Beef short rib" }),
    ).toBeInTheDocument();
    expect(within(row).queryByRole("link", { name: /Archive/ })).toBeNull();
    expect(within(row).queryByRole("link", { name: /Edit/ })).toBeNull();
  });

  it("asks to confirm an archive using the real chosen count", () => {
    renderBody({ confirmArchiveDishId: "d1" });
    const dialog = screen.getByRole("alertdialog", {
      name: "Archive Herb-crusted chicken?",
    });
    expect(dialog).toHaveTextContent(
      "clears 24 guests' choices (kept in history)",
    );
    expect(
      within(dialog).getByRole("button", { name: "Archive dish" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Cancel" }),
    ).toHaveAttribute("href", "/admin/menus?event=wedding&tab=menu");
  });

  it("uses the singular for one guest", () => {
    const one: MenuView = {
      ...menu,
      courses: [
        {
          ...menu.courses[0],
          dishes: [{ ...menu.courses[0].dishes[0], chosenCount: 1 }],
        },
      ],
    };
    renderBody({ menu: one, confirmArchiveDishId: "d1" });
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "clears 1 guest's choice (kept in history)",
    );
  });

  it("shows the result after an archive with a link to the households", () => {
    renderBody({ archiveResult: { guests: 24, households: 15 } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "24 guests in 15 households need to choose again.",
    );
    expect(
      screen.getByRole("link", { name: "Open those households" }),
    ).toHaveAttribute("href", "/admin/households");
  });

  it("says nobody needs to choose again when nobody was affected", () => {
    renderBody({ archiveResult: { guests: 0, households: 0 } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nobody needs to choose again.",
    );
  });

  it("shows a refusal in an alert", () => {
    renderBody({ errorMessage: "That could not be found." });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That could not be found.",
    );
  });

  it("offers to create the menu when the event has none", () => {
    renderBody({ event: events[1], menu: null });
    expect(screen.getByText(/does not have a menu yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create menu" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Menu status")).toBeNull();
  });
});

const categories: DietaryCategory[] = [
  { key: "vegetarian", label: "Vegetarian", kind: "diet", displayOrder: 1 },
  { key: "nuts", label: "Tree nuts", kind: "allergen", displayOrder: 10 },
];

describe("AddMenuItemForms", () => {
  function renderForms(
    extra: Partial<Parameters<typeof AddMenuItemForms>[0]> = {},
  ) {
    return render(
      <AddMenuItemForms
        eventId="e1"
        menuId="m1"
        courses={menu.courses.map((c) => ({ id: c.id, name: c.name }))}
        categories={categories}
        nextCourseOrder={3}
        actions={{ saveCourse: noop, saveDish: noop }}
        {...extra}
      />,
    );
  }

  it("has a course form", () => {
    renderForms();
    const form = screen
      .getByRole("heading", { name: "Add a course" })
      .closest("section") as HTMLElement;
    expect(within(form).getByLabelText("Course name")).toBeInTheDocument();
    expect(
      (within(form).getByLabelText("Order") as HTMLInputElement).value,
    ).toBe("3");
    expect(
      (
        within(form).getByLabelText(
          "Guests must choose a dish",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      within(form).getByRole("button", { name: "Add course" }),
    ).toBeInTheDocument();
  });

  it("has a dish form with tag checkboxes labelled by meaning", () => {
    renderForms();
    const form = screen
      .getByRole("heading", { name: "Add a dish" })
      .closest("section") as HTMLElement;
    expect(within(form).getByLabelText("Course")).toBeInTheDocument();
    expect(within(form).getByLabelText("Dish name")).toBeInTheDocument();
    expect(within(form).getByLabelText("Description")).toBeInTheDocument();
    expect(
      within(form).getByRole("checkbox", { name: "Vegetarian (suitable for)" }),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole("checkbox", { name: "Tree nuts (contains)" }),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole("button", { name: "Add dish" }),
    ).toBeInTheDocument();
  });

  it("fills the dish form when editing", () => {
    renderForms({
      editingDish: {
        id: "d1",
        courseId: "c2",
        name: "Herb-crusted chicken",
        description: "Roasted vegetables",
        tagKeys: ["nuts"],
      },
    });
    expect(
      screen.getByRole("heading", { name: "Edit dish" }),
    ).toBeInTheDocument();
    expect((screen.getByLabelText("Dish name") as HTMLInputElement).value).toBe(
      "Herb-crusted chicken",
    );
    expect((screen.getByLabelText("Course") as HTMLSelectElement).value).toBe(
      "c2",
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Tree nuts (contains)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Vegetarian (suitable for)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Save dish" }),
    ).toBeInTheDocument();
  });

  it("explains that a course is needed first", () => {
    renderForms({ courses: [] });
    expect(
      screen.getByText("Add a course before adding dishes."),
    ).toBeInTheDocument();
  });
});

describe("CategoriesView", () => {
  it("shows a table of categories and what a tag means", () => {
    render(<CategoriesView categories={categories} action={noop} />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Vegetarian")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Diet")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Suitable for")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Allergen")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Contains")).toBeInTheDocument();
  });

  it("has the add form", () => {
    render(<CategoriesView categories={categories} action={noop} />);
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
    const kind = screen.getByLabelText("Kind") as HTMLSelectElement;
    expect(
      within(kind)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Diet", "Allergen"]);
    expect(
      screen.getByRole("button", { name: "Add category" }),
    ).toBeInTheDocument();
  });
});
