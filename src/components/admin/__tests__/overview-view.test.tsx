import { render, screen, within } from "@testing-library/react";
import type { OverviewData } from "@/lib/admin/data/overview";
import { OverviewView } from "../OverviewView";

const data: OverviewData = {
  householdCount: 118,
  ceremony: { attending: 98, invited: 142 },
  events: [
    {
      id: "e1",
      slug: "welcome-party",
      name: "Welcome party",
      isRequired: false,
      invited: 96,
      attending: 61,
      declined: 9,
      pending: 26,
    },
    {
      id: "e3",
      slug: "ceremony",
      name: "Ceremony",
      isRequired: true,
      invited: 142,
      attending: 98,
      declined: 14,
      pending: 30,
    },
  ],
  requiredOutstanding: 21,
  optionalOutstanding: 33,
  mealsOutstanding: 17,
  deliveryProblems: 3,
  paperOnly: 8,
  possibleDuplicates: 2,
  mostOutstanding: [
    {
      householdId: "h1",
      name: "The Examples",
      required: 2,
      optional: 2,
      meals: 2,
    },
    {
      householdId: "h2",
      name: "Sample Family",
      required: 0,
      optional: 1,
      meals: 3,
    },
  ],
  rsvpOpen: true,
  // 11:59 PM Pacific on Sep 1, 2027
  defaultDeadline: "2027-09-02T06:59:00Z",
};

describe("OverviewView", () => {
  it("shows the headline stat tiles", () => {
    render(<OverviewView data={data} />);
    expect(screen.getByText("Households").previousSibling).toHaveTextContent(
      "118",
    );
    const attending = screen.getByText("Attending the ceremony");
    expect(attending.previousSibling).toHaveTextContent("98");
    expect(attending.previousSibling).toHaveTextContent("of 142");
    expect(
      screen.getByText("Households owing a required answer").previousSibling,
    ).toHaveTextContent("21");
    expect(
      screen.getByText("Households with a delivery problem").previousSibling,
    ).toHaveTextContent("3");
  });

  it("shows Answers by event with Required or Optional badges", () => {
    render(<OverviewView data={data} />);
    const card = screen
      .getByRole("heading", { name: "Answers by event" })
      .closest("section")!;
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Welcome party")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Optional")).toBeInTheDocument();
    expect(
      within(rows[0])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["Welcome party", "Optional", "96", "61", "9", "26"]);
    expect(within(rows[1]).getByText("Required")).toBeInTheDocument();
  });

  it("shows Needs follow-up counts with links", () => {
    render(<OverviewView data={data} />);
    const card = screen
      .getByRole("heading", { name: "Needs follow-up" })
      .closest("section")!;
    const row = (label: string) => within(card).getByText(label).closest("tr")!;
    expect(row("Required answers outstanding")).toHaveTextContent("21");
    expect(
      within(row("Required answers outstanding")).getByRole("link", {
        name: "Remind",
      }),
    ).toHaveAttribute("href", "/admin/campaigns");
    expect(
      within(row("Optional answers outstanding")).getByRole("link", {
        name: "Remind",
      }),
    ).toHaveAttribute("href", "/admin/campaigns");
    expect(
      within(row("Meal choices outstanding")).getByRole("link", {
        name: "View",
      }),
    ).toHaveAttribute("href", "/admin/households?show=meals");
    expect(row("Delivery problems")).toHaveTextContent("3");
    expect(
      within(row("Delivery problems")).getByRole("link", { name: "View" }),
    ).toHaveAttribute("href", "/admin/households?show=delivery_problem");
    expect(
      within(row("Paper only (no email)")).getByRole("link", { name: "View" }),
    ).toHaveAttribute("href", "/admin/households?show=paper_only");
    expect(row("Possible duplicates")).toHaveTextContent("2");
    expect(
      within(row("Possible duplicates")).getByRole("link", { name: "Review" }),
    ).toHaveAttribute("href", "/admin/households?view=duplicates");
  });

  it("lists the most outstanding households, each linking to its page", () => {
    render(<OverviewView data={data} />);
    const card = screen
      .getByRole("heading", { name: "Most outstanding" })
      .closest("section")!;
    const link = within(card).getByRole("link", { name: "The Examples" });
    expect(link).toHaveAttribute("href", "/admin/households/h1");
    expect(link.closest("tr")).toHaveTextContent("222");
    expect(within(card).getByText(/Showing 2 of 118/)).toBeInTheDocument();
  });

  it("says RSVPs are open with the default deadline in Pacific time", () => {
    render(<OverviewView data={data} />);
    expect(screen.getByText(/RSVPs are open/)).toHaveTextContent(
      /Default deadline Sep 1, 11:59 PM PT/,
    );
  });

  it("says RSVPs are closed, and omits a missing deadline", () => {
    render(
      <OverviewView
        data={{ ...data, rsvpOpen: false, defaultDeadline: null }}
      />,
    );
    const text = screen.getByText(/RSVPs are closed/).textContent;
    expect(text).not.toMatch(/deadline/i);
  });

  it("shows an empty state when there are no events", () => {
    render(<OverviewView data={{ ...data, events: [], ceremony: null }} />);
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
    expect(
      screen.queryByText("Attending the ceremony"),
    ).not.toBeInTheDocument();
  });
});
