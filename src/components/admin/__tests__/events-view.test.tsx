import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow, InvitableGuest } from "@/lib/admin/data/events";
import { EventForm } from "../EventForm";
import { EventsListView } from "../EventsListView";
import { InviteView } from "../InviteView";

const events: EventRow[] = [
  {
    id: "e1",
    slug: "welcome-party",
    name: "Welcome party",
    venue: "Example Hall",
    isRequired: false,
    groupKey: "wedding-weekend",
    displayOrder: 1,
    invited: 96,
    startsAtText: "Fri, Jun 11, 6:00 PM PT",
    startsAtLocal: "2027-06-11T18:00",
    deadlineText: "Default",
    deadlineLocal: "",
  },
  {
    id: "e3",
    slug: "ceremony",
    name: "Ceremony and reception",
    venue: "",
    isRequired: true,
    groupKey: "",
    displayOrder: 3,
    invited: 142,
    startsAtText: "",
    startsAtLocal: "",
    deadlineText: "May 1, 11:59 PM PT",
    deadlineLocal: "2027-05-01T23:59",
  },
];

describe("EventsListView", () => {
  it("shows a table with the columns and each event's details", () => {
    render(<EventsListView events={events} />);
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Order",
      "Event",
      "Starts",
      "Venue",
      "Type",
      "Deadline",
      "Invited",
      "Actions",
    ]);
    const first = screen.getAllByRole("row")[1];
    expect(within(first).getByText("Welcome party")).toBeInTheDocument();
    expect(
      within(first).getByText("welcome-party · wedding-weekend"),
    ).toBeInTheDocument();
    expect(within(first).getByText("Fri, Jun 11, 6:00 PM PT")).toBeVisible();
    expect(within(first).getByText("Example Hall")).toBeVisible();
    expect(within(first).getByText("Optional")).toBeVisible();
    expect(within(first).getByText("Default")).toBeVisible();
    expect(within(first).getByText("96")).toBeVisible();
  });

  it("shows the key alone when there is no group, a Required badge, and plain not-set text", () => {
    render(<EventsListView events={events} />);
    const second = screen.getAllByRole("row")[2];
    expect(within(second).getByText("ceremony")).toBeInTheDocument();
    expect(within(second).getByText("Required")).toBeVisible();
    expect(within(second).getAllByText("Not set")).toHaveLength(2);
    expect(within(second).getByText("May 1, 11:59 PM PT")).toBeVisible();
  });

  it("links to the edit form and the menu for each event", () => {
    render(<EventsListView events={events} />);
    const first = screen.getAllByRole("row")[1];
    expect(within(first).getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/admin/events?tab=edit&id=e1",
    );
    expect(within(first).getByRole("link", { name: /menu/i })).toHaveAttribute(
      "href",
      "/admin/menus?event=welcome-party",
    );
  });

  it("says so when there are no events", () => {
    render(<EventsListView events={[]} />);
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
  });
});

describe("EventForm", () => {
  const action = jest.fn(async () => ({
    ok: true as const,
    data: { message: "Event saved." },
  }));
  beforeEach(() => action.mockClear());

  it("has labelled fields for a new event, with the key editable", () => {
    render(<EventForm action={action} nextOrder={4} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    const key = screen.getByLabelText("Short key");
    expect(key).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Starts (Pacific time)")).toHaveAttribute(
      "type",
      "datetime-local",
    );
    expect(screen.getByLabelText("Venue")).toBeInTheDocument();
    expect(screen.getByLabelText("Group")).toBeInTheDocument();
    expect(screen.getByLabelText("Display order")).toHaveValue(4);
    expect(
      screen.getByLabelText("Own RSVP deadline (Pacific time)"),
    ).toHaveAttribute("type", "datetime-local");
    expect(
      screen.getByRole("checkbox", { name: /required event/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save event" }),
    ).toBeInTheDocument();
    expect(document.querySelector("input[name=id]")).toBeNull();
  });

  it("fills an existing event, makes the key read-only with a hint, and posts the id", () => {
    render(<EventForm action={action} event={events[1]} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Ceremony and reception");
    const key = screen.getByLabelText("Short key");
    expect(key).toHaveValue("ceremony");
    expect(key).toHaveAttribute("readonly");
    expect(screen.getByText(/cannot change later/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Own RSVP deadline (Pacific time)"),
    ).toHaveValue("2027-05-01T23:59");
    expect(
      screen.getByRole("checkbox", { name: /required event/i }),
    ).toBeChecked();
    expect(document.querySelector("input[name=id]")).toHaveValue("e3");
  });

  it("submits the form to the action and shows its message", async () => {
    render(<EventForm action={action} nextOrder={4} />);
    await userEvent.type(screen.getByLabelText("Name"), "After party");
    await userEvent.type(screen.getByLabelText("Short key"), "after-party");
    await userEvent.click(screen.getByRole("button", { name: "Save event" }));
    expect(action).toHaveBeenCalledTimes(1);
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("slug")).toBe("after-party");
    expect(sent.get("name")).toBe("After party");
    expect(await screen.findByText("Event saved.")).toBeInTheDocument();
  });

  it("shows a field error and keeps what was typed after a failure", async () => {
    const failing = jest.fn(async (_p: unknown, fd: FormData) => ({
      ok: false as const,
      message: "Some of what you entered is not valid. Please check it.",
      fieldErrors: { slug: "Enter a short key." },
      values: { name: String(fd.get("name")) },
    }));
    render(<EventForm action={failing} nextOrder={4} />);
    await userEvent.type(screen.getByLabelText("Name"), "After party");
    await userEvent.click(screen.getByRole("button", { name: "Save event" }));
    expect(await screen.findByText("Enter a short key.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("After party");
  });

  it("has a way back to the list", () => {
    render(<EventForm action={action} nextOrder={4} />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/admin/events",
    );
  });
});

describe("InviteView", () => {
  const guests: InvitableGuest[] = [
    {
      id: "g1",
      name: "Sam Example",
      householdName: "The Examples",
      invitation: null,
    },
    {
      id: "g2",
      name: "Alex Example",
      householdName: "The Examples",
      invitation: null,
    },
    {
      id: "g3",
      name: "Jordan Example",
      householdName: "Example, Jordan",
      invitation: null,
    },
    {
      id: "g4",
      name: "Casey Exampleton",
      householdName: "Exampleton family",
      invitation: { status: "attending" },
    },
  ];
  const eventList = [
    { id: "e1", name: "Welcome party" },
    { id: "e3", name: "Ceremony and reception" },
  ];
  const action = jest.fn(async () => ({
    ok: true as const,
    data: { message: "2 added, 1 already invited, 0 not found" },
  }));
  beforeEach(() => action.mockClear());

  const renderView = () =>
    render(
      <InviteView
        action={action}
        events={eventList}
        eventId="e3"
        q=""
        guests={guests}
      />,
    );

  it("has an event select, a guest search, and a fieldset of guest checkboxes with household names", () => {
    renderView();
    const select = screen.getByLabelText("Event");
    expect(select).toHaveValue("e3");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Welcome party", "Ceremony and reception"]);
    expect(screen.getByLabelText("Find guests")).toHaveAttribute(
      "type",
      "search",
    );
    const group = screen.getByRole("group", { name: /guests/i });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(4);
    expect(
      within(group).getByRole("checkbox", { name: /sam example/i }),
    ).toBeInTheDocument();
    expect(within(group).getAllByText("The Examples")).toHaveLength(2);
  });

  it("searches and picks the event with a plain GET form", () => {
    renderView();
    const form = screen.getByLabelText("Find guests").closest("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form.querySelector("input[name=tab]")).toHaveValue("invite");
    expect(screen.getByLabelText("Event")).toHaveAttribute("name", "id");
    expect(screen.getByLabelText("Find guests")).toHaveAttribute("name", "q");
  });

  it("counts the selected guests in the legend and the button", async () => {
    renderView();
    expect(screen.getByText("Guests (0 selected)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invite guests" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /sam example/i }),
    );
    expect(
      screen.getByRole("button", { name: "Invite 1 guest" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /alex example/i }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /jordan example/i }),
    );
    expect(screen.getByText("Guests (3 selected)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invite 3 guests" }),
    ).toBeInTheDocument();
  });

  it("shows guests already invited as disabled with the words 'already invited'", () => {
    renderView();
    const casey = screen.getByRole("checkbox", { name: /casey exampleton/i });
    expect(casey).toBeDisabled();
    expect(
      screen.getByText(/already invited/i, { selector: "span" }),
    ).toBeVisible();
  });

  it("posts the event and the chosen guests, then shows the result sentence", async () => {
    renderView();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /sam example/i }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /alex example/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Invite 2 guests" }),
    );
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("event_id")).toBe("e3");
    expect(sent.getAll("guest_ids")).toEqual(["g1", "g2"]);
    expect(
      await screen.findByText("2 added, 1 already invited, 0 not found"),
    ).toBeInTheDocument();
  });

  it("explains that nothing is emailed", () => {
    renderView();
    expect(screen.getByText(/nothing is emailed/i)).toBeInTheDocument();
  });

  it("asks for an event first when there are none", () => {
    render(
      <InviteView action={action} events={[]} eventId="" q="" guests={[]} />,
    );
    expect(screen.getByText(/add an event first/i)).toBeInTheDocument();
  });
});
