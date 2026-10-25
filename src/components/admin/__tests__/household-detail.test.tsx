import { render, screen, within } from "@testing-library/react";
import type { HouseholdDetail } from "@/lib/admin/data/households";
import { HouseholdDetailView } from "../HouseholdDetailView";

jest.mock("@/lib/admin/actions/households", () => ({
  updateHouseholdFields: jest.fn(),
}));
jest.mock("@/lib/admin/actions/guests", () => ({
  saveGuest: jest.fn(),
  removeGuest: jest.fn(),
  confirmRemoveGuest: jest.fn(),
  setGuestDietary: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/lib/admin-api/client", () => ({
  updateHousehold: jest.fn(),
  deleteHousehold: jest.fn(),
}));

const household = (over: Partial<HouseholdDetail> = {}): HouseholdDetail => ({
  id: "h1",
  displayName: "The Examples",
  contactEmail: "household@example.test",
  plusOneAllowance: 1,
  address: { street: "123 Sample Street", city: "Exampleville", region: "CA" },
  notes: "Friends of Hannah",
  messageToCouple: "Looking forward to it.",
  rsvpDeadlineOverride: "2027-09-02T06:59:00Z",
  remindersOptOut: true,
  deliveryProblem: false,
  defaultDeadline: "2027-10-02T06:59:00Z",
  guests: [
    {
      id: "g1",
      firstName: "Sam",
      lastName: "Example",
      email: "sam@example.test",
      isPlaceholder: false,
      isPlusOne: false,
      dietaryNotes: null,
      notes: null,
      dietary: [
        {
          categoryKey: "vegetarian",
          label: "Vegetarian",
          severity: "preference",
          details: null,
        },
      ],
    },
    {
      id: "g2",
      firstName: "Alex",
      lastName: "Example",
      email: null,
      isPlaceholder: false,
      isPlusOne: false,
      dietaryNotes: "Carries an EpiPen",
      notes: null,
      dietary: [
        {
          categoryKey: "tree-nuts",
          label: "Tree nuts",
          severity: "allergy",
          details: null,
        },
      ],
    },
    {
      id: "g3",
      firstName: null,
      lastName: null,
      email: null,
      isPlaceholder: true,
      isPlusOne: true,
      dietaryNotes: null,
      notes: null,
      dietary: [],
    },
  ],
  dietaryCategories: [
    { key: "vegetarian", label: "Vegetarian" },
    { key: "tree-nuts", label: "Tree nuts" },
  ],
  ...over,
});

function view(
  tab: string,
  over: Partial<HouseholdDetail> = {},
  extra: Partial<Parameters<typeof HouseholdDetailView>[0]> = {},
) {
  return render(
    <HouseholdDetailView household={household(over)} tab={tab} {...extra} />,
  );
}

describe("HouseholdDetailView: frame", () => {
  it("shows the name, a crumb, a summary line and the section tabs", () => {
    view("details");
    expect(
      screen.getByRole("heading", { level: 1, name: "The Examples" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Households" })).toHaveAttribute(
      "href",
      "/admin/households",
    );
    expect(
      screen.getByText(
        /household@example\.test · 3 guests · 1 plus-one allowed/,
      ),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Household sections" });
    expect(within(tabs).getByRole("link", { name: "Details" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(tabs).getByRole("link", { name: "Guests (3)" }),
    ).toHaveAttribute("href", "/admin/households/h1?tab=guests");
    expect(within(tabs).getByRole("link", { name: "Remove" })).toHaveAttribute(
      "href",
      "/admin/households/h1?tab=remove",
    );
  });

  it("shows the delivery problem and paper-only flags", () => {
    view("details", { deliveryProblem: true, contactEmail: null });
    expect(screen.getAllByText("Delivery problem").length).toBeGreaterThan(0);
    expect(screen.getByText("Paper only")).toBeInTheDocument();
  });

  it("treats an unknown tab as Details", () => {
    view("bogus");
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  });

  it("puts extra tabs before Remove and shows their body when selected", () => {
    view(
      "answers",
      {},
      {
        extraTabs: [
          {
            value: "answers",
            label: "Invitations and answers",
            body: <p>Answers go here</p>,
          },
        ],
      },
    );
    const tabs = screen.getByRole("navigation", { name: "Household sections" });
    const labels = within(tabs)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels).toEqual([
      "Details",
      "Guests (3)",
      "Invitations and answers",
      "Remove",
    ]);
    expect(screen.getByText("Answers go here")).toBeInTheDocument();
  });

  it("shows a notice after a guest was removed", () => {
    view("guests", {}, { notice: "guest-removed" });
    expect(screen.getByRole("status")).toHaveTextContent("Guest removed.");
  });
});

describe("HouseholdDetailView: Details tab", () => {
  it("has the labelled fields filled from the household", () => {
    view("details");
    expect(screen.getByLabelText("Display name")).toHaveValue("The Examples");
    expect(screen.getByLabelText("Contact email")).toHaveValue(
      "household@example.test",
    );
    expect(screen.getByLabelText("Plus-one allowance")).toHaveValue(1);
    expect(
      screen.getByLabelText("RSVP deadline override (Pacific time)"),
    ).toHaveValue("2027-09-01T23:59");
    const address = screen.getByRole("group", { name: "Mailing address" });
    expect(within(address).getByLabelText("Street")).toHaveValue(
      "123 Sample Street",
    );
    expect(within(address).getByLabelText("City")).toHaveValue("Exampleville");
    expect(within(address).getByLabelText("State or region")).toHaveValue("CA");
    expect(screen.getByLabelText("Staff notes")).toHaveValue(
      "Friends of Hannah",
    );
  });

  it("shows the household's message read only", () => {
    view("details");
    const message = screen.getByLabelText("Message from the household");
    expect(message).toHaveValue("Looking forward to it.");
    expect(message).toHaveAttribute("readonly");
  });

  it("has the reminders checkbox ticked from the household", () => {
    view("details");
    expect(
      screen.getByRole("checkbox", { name: /Household turned off reminders/ }),
    ).toBeChecked();
  });

  it("leaves the reminders checkbox clear when reminders are on", () => {
    view("details", { remindersOptOut: false });
    expect(
      screen.getByRole("checkbox", { name: /Household turned off reminders/ }),
    ).not.toBeChecked();
  });

  it("states the delivery-problem flag", () => {
    view("details", { deliveryProblem: true });
    expect(
      screen.getByText(/Delivery problem:/).closest("p"),
    ).toHaveTextContent("Delivery problem: Yes");
  });

  it("explains the allowance floor and the deadline in use", () => {
    view("details", { rsvpDeadlineOverride: null });
    expect(
      screen.getByText(/Cannot go below the plus-ones already named \(0\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Currently using Oct 1, 11:59 PM PT/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("RSVP deadline override (Pacific time)"),
    ).toHaveValue("");
  });

  it("has a Save household button", () => {
    view("details");
    expect(
      screen.getByRole("button", { name: "Save household" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save contact email" }),
    ).toBeInTheDocument();
  });

  it("carries the household id to the action", () => {
    const { container } = view("details");
    expect(
      container.querySelector('input[type="hidden"][name="id"]'),
    ).toHaveValue("h1");
  });
});

describe("HouseholdDetailView: Guests tab", () => {
  it("lists each guest with email, dietary needs, badges and actions", () => {
    view("guests");
    const sam = screen.getByRole("row", { name: /Sam Example/ });
    expect(within(sam).getByText("sam@example.test")).toBeInTheDocument();
    expect(within(sam).getByText("Vegetarian")).toBeInTheDocument();
    expect(within(sam).getByText("Preference")).toBeInTheDocument();
    expect(within(sam).getByRole("link", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/admin/households/h1?tab=guests&guest=g1",
    );
    expect(within(sam).getByRole("link", { name: /Remove/ })).toHaveAttribute(
      "href",
      "/admin/households/h1?tab=guests&guest=g1&confirm=remove-guest",
    );
    const alex = screen.getByRole("row", { name: /Alex Example/ });
    expect(within(alex).getByText("Tree nuts")).toBeInTheDocument();
    expect(within(alex).getByText("Allergy")).toBeInTheDocument();
    expect(within(alex).getByText("Carries an EpiPen")).toBeInTheDocument();
  });

  it("shows an unnamed plus-one seat with a Name this guest link", () => {
    view("guests");
    const seat = screen.getByRole("row", { name: /Unnamed plus-one/ });
    expect(within(seat).getByText("Plus-one")).toBeInTheDocument();
    expect(
      within(seat).getByRole("link", { name: /Name this guest/ }),
    ).toHaveAttribute("href", "/admin/households/h1?tab=guests&guest=g3");
  });

  it("has an Add guest link and no form until it is chosen", () => {
    view("guests");
    expect(screen.getByRole("link", { name: "Add guest" })).toHaveAttribute(
      "href",
      "/admin/households/h1?tab=guests&guest=new",
    );
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("shows the add form for guest=new", () => {
    view("guests", {}, { guest: "new" });
    expect(screen.getByLabelText("First name")).toHaveValue("");
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Unnamed plus-one seat/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /This guest is a plus-one/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save guest" }),
    ).toBeInTheDocument();
  });

  it("opens the edit form for the chosen guest, with their dietary entries", () => {
    view("guests", {}, { guest: "g2" });
    expect(screen.getByLabelText("First name")).toHaveValue("Alex");
    expect(screen.getByLabelText("Last name")).toHaveValue("Example");
    expect(screen.getByLabelText("Dietary notes")).toHaveValue(
      "Carries an EpiPen",
    );
    expect(
      screen.getByRole("button", { name: "Remove Tree nuts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Dietary category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Severity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add dietary need" }),
    ).toBeInTheDocument();
  });

  it("names an unnamed seat from the edit form", () => {
    const { container } = view("guests", {}, { guest: "g3" });
    expect(
      screen.getByRole("heading", { name: "Name this guest" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="is_placeholder"]'),
    ).toHaveValue("true");
    expect(
      container.querySelector('input[type="hidden"][name="guest_id"]'),
    ).toHaveValue("g3");
  });

  it("asks for confirmation before removing a guest", () => {
    view("guests", {}, { guest: "g1", confirm: "remove-guest" });
    const dialog = screen.getByRole("alertdialog", {
      name: /Remove Sam Example/,
    });
    expect(
      within(dialog).getByRole("button", { name: "Remove guest" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Cancel" }),
    ).toHaveAttribute("href", "/admin/households/h1?tab=guests");
    expect(
      dialog.querySelector('input[type="hidden"][name="guest_id"]'),
    ).toHaveValue("g1");
    expect(
      dialog.querySelector('input[type="hidden"][name="confirm"]'),
    ).toHaveValue("remove-guest");
  });

  it("says so when there are no guests", () => {
    view("guests", { guests: [] });
    expect(
      screen.getByText("This household has no guests yet."),
    ).toBeInTheDocument();
  });
});

describe("HouseholdDetailView: Remove tab", () => {
  it("explains what deleting does and offers a first step", () => {
    view("remove");
    expect(
      screen.getByRole("heading", { name: "Delete this household" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Delete The Examples" }),
    ).toHaveAttribute("href", "/admin/households/h1?tab=remove&confirm=delete");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows the type-the-name confirmation on the confirm step", () => {
    view("remove", {}, { confirm: "delete" });
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete The Examples?",
    });
    expect(
      within(dialog).getByLabelText("Type the household name to confirm"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("link", { name: "Cancel" }),
    ).toHaveAttribute("href", "/admin/households/h1?tab=remove");
  });
});
