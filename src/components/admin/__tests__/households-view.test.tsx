import { render, screen, within } from "@testing-library/react";
import type {
  DuplicatePair,
  HouseholdList,
  HouseholdQuery,
  HouseholdRow,
} from "@/lib/admin/data/households";
import { DuplicatesView } from "../DuplicatesView";
import { HouseholdsListView } from "../HouseholdsListView";

const row = (over: Partial<HouseholdRow> = {}): HouseholdRow => ({
  id: "h1",
  displayName: "The Examples",
  guestNames: ["Sam Example", "Alex Example"],
  unnamedSeats: 0,
  contactEmail: "household@example.test",
  plusOnesAllowed: 1,
  plusOnesNamed: 0,
  outstanding: { required: 2, optional: 2, meals: 2 },
  deliveryProblem: false,
  paperOnly: false,
  possibleDuplicate: false,
  ...over,
});

const list = (
  rows: HouseholdRow[],
  over: Partial<HouseholdList> = {},
): HouseholdList => ({
  rows,
  total: rows.length,
  totalAll: 118,
  totalGuests: 231,
  page: 1,
  pageCount: 1,
  pageSize: 25,
  ...over,
});

const query = {
  q: "",
  invited: "",
  show: "everyone" as HouseholdQuery["show"],
  page: 1,
};
const events = [
  { slug: "welcome-party", name: "Welcome party" },
  { slug: "wedding", name: "Wedding" },
];

function renderList(
  rows: HouseholdRow[],
  over: Partial<HouseholdList> = {},
  q: Partial<typeof query> = {},
  duplicateCount = 2,
) {
  return render(
    <HouseholdsListView
      list={list(rows, over)}
      query={{ ...query, ...q }}
      events={events}
      duplicateCount={duplicateCount}
    />,
  );
}

describe("HouseholdsListView", () => {
  it("has the page heading, counts and the Import and New household links", () => {
    renderList([row()]);
    expect(
      screen.getByRole("heading", { level: 1, name: "Households" }),
    ).toBeInTheDocument();
    expect(screen.getByText("118 households, 231 guests")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute(
      "href",
      "/admin/import",
    );
    expect(screen.getByRole("link", { name: "New household" })).toHaveAttribute(
      "href",
      "/admin/households/new",
    );
  });

  it("has a search form that submits by GET with labelled fields and an Apply button", () => {
    renderList(
      [row()],
      {},
      { q: "exam", show: "required", invited: "wedding" },
    );
    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(search).toHaveValue("exam");
    expect(search).toHaveAttribute("name", "q");
    const invited = screen.getByRole("combobox", { name: "Invited to" });
    expect(invited).toHaveAttribute("name", "invited");
    expect(invited).toHaveValue("wedding");
    expect(
      within(invited).getByRole("option", { name: "Any event" }),
    ).toHaveValue("");
    expect(
      within(invited).getByRole("option", { name: "Welcome party" }),
    ).toHaveValue("welcome-party");
    const show = screen.getByRole("combobox", { name: "Show" });
    expect(show).toHaveAttribute("name", "show");
    expect(show).toHaveValue("required");
    for (const label of [
      "Everyone",
      "Required answers outstanding",
      "Optional answers outstanding",
      "Meals outstanding",
      "Delivery problem",
      "Paper only (no email)",
    ]) {
      expect(
        within(show).getByRole("option", { name: label }),
      ).toBeInTheDocument();
    }
    const apply = screen.getByRole("button", { name: "Apply" });
    const form = apply.closest("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/admin/households");
  });

  it("shows a table with the five columns", () => {
    renderList([row()]);
    for (const name of [
      "Household",
      "Guests",
      "Contact email",
      "Outstanding",
      "Status",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("shows each household with its link, guests, email and outstanding counts", () => {
    renderList([row()]);
    const tableRow = screen.getByRole("row", { name: /The Examples/ });
    expect(
      within(tableRow).getByRole("link", { name: "The Examples" }),
    ).toHaveAttribute("href", "/admin/households/h1");
    expect(
      within(tableRow).getByText("1 plus-one allowed"),
    ).toBeInTheDocument();
    expect(within(tableRow).getByText("Sam Example")).toBeInTheDocument();
    expect(within(tableRow).getByText("Alex Example")).toBeInTheDocument();
    expect(
      within(tableRow).getByText("household@example.test"),
    ).toBeInTheDocument();
    expect(within(tableRow).getByText("2 required")).toBeInTheDocument();
    expect(
      within(tableRow).getByText("2 optional, 2 meals"),
    ).toBeInTheDocument();
    expect(
      within(tableRow).getByRole("link", { name: /Open/ }),
    ).toHaveAttribute("href", "/admin/households/h1");
  });

  it("says when everything is answered", () => {
    renderList([row({ outstanding: { required: 0, optional: 0, meals: 0 } })]);
    expect(screen.getByText("All answered")).toBeInTheDocument();
  });

  it("shows None for a household with no email, and its unnamed plus-one", () => {
    renderList([
      row({
        id: "h3",
        displayName: "Exampleton family",
        contactEmail: null,
        paperOnly: true,
        unnamedSeats: 1,
        possibleDuplicate: true,
      }),
    ]);
    const tableRow = screen.getByRole("row", { name: /Exampleton family/ });
    expect(within(tableRow).getByText("None")).toBeInTheDocument();
    expect(within(tableRow).getByText("Unnamed plus-one")).toBeInTheDocument();
  });

  it("labels delivery problem, paper only and possible duplicate with text", () => {
    renderList([
      row({
        deliveryProblem: true,
        paperOnly: true,
        possibleDuplicate: true,
      }),
    ]);
    const tableRow = screen.getByRole("row", { name: /The Examples/ });
    expect(within(tableRow).getByText("Delivery problem")).toBeInTheDocument();
    expect(within(tableRow).getByText("Paper only")).toBeInTheDocument();
    expect(
      within(tableRow).getByText("Possible duplicate"),
    ).toBeInTheDocument();
  });

  it("shows no badges for an ordinary household", () => {
    renderList([row()]);
    const tableRow = screen.getByRole("row", { name: /The Examples/ });
    expect(
      within(tableRow).queryByText("Delivery problem"),
    ).not.toBeInTheDocument();
    expect(within(tableRow).queryByText("Paper only")).not.toBeInTheDocument();
    expect(
      within(tableRow).queryByText("Possible duplicate"),
    ).not.toBeInTheDocument();
  });

  it("shows the match count and page position", () => {
    renderList(
      [row(), row({ id: "h2", displayName: "Other" }), row({ id: "h4" })],
      {
        total: 3,
      },
    );
    expect(screen.getByText("3 of 118 households match")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("links to the neighbouring pages and keeps the search", () => {
    renderList(
      [row()],
      { page: 2, pageCount: 3, total: 60 },
      { q: "exam", page: 2 },
    );
    const nav = screen.getByRole("navigation", { name: "Pages" });
    const previous = within(nav).getByRole("link", { name: "Previous" });
    const next = within(nav).getByRole("link", { name: "Next" });
    expect(previous.getAttribute("href")).toContain("q=exam");
    expect(previous.getAttribute("href")).toContain("page=1");
    expect(next.getAttribute("href")).toContain("q=exam");
    expect(next.getAttribute("href")).toContain("page=3");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("has no page links on the only page", () => {
    renderList([row()]);
    expect(
      screen.queryByRole("link", { name: "Previous" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Next" }),
    ).not.toBeInTheDocument();
  });

  it("says when nothing matches", () => {
    renderList([], { total: 0 });
    expect(screen.getByText("No households match.")).toBeInTheDocument();
    expect(screen.getByText("0 of 118 households match")).toBeInTheDocument();
  });

  it("has the tab links with the duplicate count; All households is current", () => {
    renderList([row()]);
    const tabs = screen.getByRole("navigation", { name: "Household views" });
    expect(
      within(tabs).getByRole("link", { name: "All households" }),
    ).toHaveAttribute("aria-current", "page");
    const duplicates = within(tabs).getByRole("link", {
      name: "Possible duplicates (2)",
    });
    expect(duplicates).not.toHaveAttribute("aria-current");
    expect(duplicates.getAttribute("href")).toContain("view=duplicates");
  });
});

describe("DuplicatesView", () => {
  const pairs: DuplicatePair[] = [
    {
      a: { id: "h3", displayName: "Exampleton family" },
      b: { id: "h5", displayName: "The Exampletons" },
      reason: "Same name once spacing and capitals are ignored",
    },
    {
      a: { id: "h6", displayName: "Sample Family" },
      b: { id: "h7", displayName: "Sample, Pat" },
      reason: "Same address",
    },
  ];

  it("has the tabs with Possible duplicates current", () => {
    render(<DuplicatesView pairs={pairs} />);
    const tabs = screen.getByRole("navigation", { name: "Household views" });
    expect(
      within(tabs).getByRole("link", { name: "Possible duplicates (2)" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: "All households" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("lists each pair with links to both households and the reason", () => {
    render(<DuplicatesView pairs={pairs} />);
    const first = screen.getByRole("row", { name: /Exampleton family/ });
    expect(
      within(first).getByRole("link", { name: "Exampleton family" }),
    ).toHaveAttribute("href", "/admin/households/h3");
    expect(
      within(first).getByRole("link", { name: "The Exampletons" }),
    ).toHaveAttribute("href", "/admin/households/h5");
    expect(
      within(first).getByText(
        "Same name once spacing and capitals are ignored",
      ),
    ).toBeInTheDocument();
    const second = screen.getByRole("row", { name: /Sample Family/ });
    expect(within(second).getByText("Same address")).toBeInTheDocument();
  });

  it("says that nothing is merged automatically", () => {
    render(<DuplicatesView pairs={pairs} />);
    expect(
      screen.getByText(/Nothing is merged automatically/),
    ).toBeInTheDocument();
  });

  it("says when there are none", () => {
    render(<DuplicatesView pairs={[]} />);
    expect(screen.getByText("No possible duplicates.")).toBeInTheDocument();
  });
});
