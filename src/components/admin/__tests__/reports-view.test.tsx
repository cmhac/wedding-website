import { render, screen, within } from "@testing-library/react";
import { HistoryView } from "../HistoryView";
import { ReportsView } from "../ReportsView";

const events = [
  { slug: "ceremony", name: "Ceremony and reception" },
  { slug: "party", name: "Welcome party" },
];

const dish = [
  {
    courseId: "c1",
    courseName: "Main",
    dishName: "Grilled salmon",
    chosenCount: 41,
    notYetChosen: false,
  },
  {
    courseId: "c1",
    courseName: "Main",
    dishName: "Not yet chosen",
    chosenCount: 4,
    notYetChosen: true,
  },
];
const diet = [
  {
    guestId: "g2",
    guestName: "Sam Example",
    householdName: "The Examples",
    restriction: "Vegetarian",
    severity: "preference" as const,
    notes: null,
  },
  {
    guestId: "g1",
    guestName: "Alex Example",
    householdName: "The Examples",
    restriction: "Tree nuts",
    severity: "allergy" as const,
    notes: "Carries an EpiPen",
  },
];
const conflicts = [
  {
    key: "k1",
    guestId: "g1",
    guestName: "Alex Example",
    householdName: "The Examples",
    courseName: "Main",
    dishName: "Herb-crusted chicken",
    conflictsWith: "Tree nuts",
    severity: "allergy" as const,
    answeredBy: { kind: "guest" as const },
  },
];

function renderReports(tab: "dish" | "diet" | "conflicts" | "exports") {
  return render(
    <ReportsView
      tab={tab}
      eventSlug="ceremony"
      events={events}
      dish={dish}
      diet={diet}
      conflicts={conflicts}
    />,
  );
}

describe("ReportsView", () => {
  it("shows the four tabs with the conflict count", () => {
    renderReports("dish");
    const nav = screen.getByRole("navigation", { name: /reports/i });
    expect(within(nav).getByText("Dish totals")).toBeInTheDocument();
    expect(within(nav).getByText("Dietary list")).toBeInTheDocument();
    expect(within(nav).getByText("Meal conflicts (1)")).toBeInTheDocument();
    expect(within(nav).getByText("Exports")).toBeInTheDocument();
    expect(within(nav).getByText("Dish totals")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByText("Exports")).toHaveAttribute(
      "href",
      expect.stringContaining("event=ceremony"),
    );
  });

  it("lets the person pick an event", () => {
    renderReports("dish");
    const select = screen.getByLabelText("Event");
    expect(select).toHaveValue("ceremony");
    expect(within(select).getByText("Welcome party")).toBeInTheDocument();
  });

  it("shows the dish totals table", () => {
    renderReports("dish");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Grilled salmon")).toBeInTheDocument();
    expect(within(table).getByText("41")).toBeInTheDocument();
    expect(within(table).getByText("Not yet chosen")).toBeInTheDocument();
  });

  it("shows the dietary list with allergies first", () => {
    renderReports("diet");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Alex Example");
    expect(rows[0]).toHaveTextContent("Allergy");
    expect(rows[0]).toHaveTextContent("Carries an EpiPen");
    expect(rows[1]).toHaveTextContent("Sam Example");
    expect(rows[1]).toHaveTextContent("Preference");
  });

  it("shows conflicts with who made the choice and how to resolve", () => {
    renderReports("conflicts");
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveTextContent("Herb-crusted chicken");
    expect(row).toHaveTextContent("Tree nuts");
    expect(within(row).getByText("Guest")).toBeInTheDocument();
    expect(
      screen.getByText(/A change you make is recorded as staff/),
    ).toBeInTheDocument();
  });

  it("says so when there are no conflicts", () => {
    render(
      <ReportsView
        tab="conflicts"
        eventSlug="ceremony"
        events={events}
        dish={[]}
        diet={[]}
        conflicts={[]}
      />,
    );
    expect(screen.getByText(/no meal conflicts/i)).toBeInTheDocument();
  });

  it("lists the three exports as plain download links with a warning", () => {
    renderReports("exports");
    expect(screen.getByText(/contain personal data/i)).toBeInTheDocument();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/api/admin/exports/guests",
        "/api/admin/exports/responses",
        "/api/admin/exports/caterer",
      ]),
    );
    for (const a of screen.getAllByRole("link", { name: /Download/ })) {
      expect(a).toHaveAttribute("download");
    }
  });
});

const staffOptions = [
  { id: "u-chris", label: "Chris" },
  { id: "u-hannah", label: "Hannah" },
];
const filters = { from: "2026-10-01", to: "", by: "u-chris" };

describe("HistoryView", () => {
  it("shows the three tabs and the filter form", () => {
    render(
      <HistoryView
        tab="log"
        filters={filters}
        staffOptions={staffOptions}
        log={{ rows: [], page: 1, hasMore: false }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: /history/i });
    expect(within(nav).getByText("Change log")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByText("RSVP history")).toBeInTheDocument();
    expect(within(nav).getByText("Meal choices")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("Changed by")).toHaveValue("u-chris");
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(
      screen.getByText("Shows which fields changed, never their values"),
    ).toBeInTheDocument();
  });

  it("shows change log rows", () => {
    render(
      <HistoryView
        tab="log"
        filters={filters}
        staffOptions={staffOptions}
        log={{
          page: 1,
          hasMore: false,
          rows: [
            {
              id: 1,
              at: "2026-10-25T17:41:00Z",
              who: "Hannah (couple)",
              entity: "Household",
              action: "Update",
              fieldsChanged: "staff notes, plus-one allowance",
            },
          ],
        }}
      />,
    );
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveTextContent("Oct 25, 10:41 AM PT");
    expect(row).toHaveTextContent("Hannah (couple)");
    expect(row).toHaveTextContent("staff notes, plus-one allowance");
  });

  it("shows Removed guest and attribution in RSVP history", () => {
    render(
      <HistoryView
        tab="rsvp"
        filters={filters}
        staffOptions={staffOptions}
        rsvp={{
          page: 1,
          hasMore: false,
          rows: [
            {
              id: 1,
              at: "2026-09-20T01:30:00Z",
              guestName: "Removed guest",
              eventName: "Rehearsal",
              change: "Attending to Declined",
              answeredBy: { kind: "guest" },
            },
          ],
        }}
      />,
    );
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveTextContent("Removed guest");
    expect(row).toHaveTextContent("Attending to Declined");
    expect(within(row).getByText("Guest")).toBeInTheDocument();
  });

  it("shows meal choice rows", () => {
    render(
      <HistoryView
        tab="meals"
        filters={filters}
        staffOptions={staffOptions}
        meals={{
          page: 1,
          hasMore: false,
          rows: [
            {
              id: 1,
              at: "2026-10-03T22:15:00Z",
              guestName: "Sam Example",
              courseName: "Dessert",
              from: "None",
              to: "Lemon tart",
              reason: "Changed",
              answeredBy: { kind: "staff", name: "Hannah" },
            },
          ],
        }}
      />,
    );
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveTextContent("Lemon tart");
    expect(row).toHaveTextContent("Changed");
    expect(row).toHaveTextContent(/Recorded by staff/);
  });

  it("links to the next and previous pages keeping the filters", () => {
    render(
      <HistoryView
        tab="log"
        filters={filters}
        staffOptions={staffOptions}
        log={{ rows: [], page: 2, hasMore: true }}
      />,
    );
    const next = screen.getByRole("link", { name: "Next page" });
    expect(next.getAttribute("href")).toContain("page=3");
    expect(next.getAttribute("href")).toContain("by=u-chris");
    expect(next.getAttribute("href")).toContain("tab=log");
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href"),
    ).toContain("page=1");
  });
});
