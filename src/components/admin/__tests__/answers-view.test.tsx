import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnswerRow } from "@/lib/admin/data/answers";
import { AnswersView } from "../AnswersView";

const rows: AnswerRow[] = [
  {
    guestId: "g1",
    guestName: "Sam Example",
    eventId: "e1",
    eventName: "Ceremony and reception",
    status: "attending",
    answeredBy: { kind: "staff", name: "Hannah", at: "2026-10-03T21:14:00Z" },
    answeredAt: "Oct 3, 2:14 PM PT",
    meals: [
      {
        courseId: "c-main",
        courseName: "Main",
        dishId: "d-risotto",
        dishName: "Mushroom risotto",
        answeredBy: { kind: "guest", at: "2026-09-28T16:00:00Z" },
        options: [
          { id: "d-risotto", name: "Mushroom risotto" },
          { id: "d-salmon", name: "Grilled salmon" },
        ],
      },
      {
        courseId: "c-dessert",
        courseName: "Dessert",
        dishId: "d-tart",
        dishName: "Lemon tart",
        answeredBy: {
          kind: "staff",
          name: "Hannah",
          at: "2026-10-03T21:15:00Z",
        },
        options: [{ id: "d-tart", name: "Lemon tart" }],
      },
    ],
  },
  {
    guestId: "g2",
    guestName: "Alex Example",
    eventId: "e1",
    eventName: "Ceremony and reception",
    status: "attending",
    answeredBy: { kind: "guest", at: "2026-09-28T16:02:00Z" },
    answeredAt: "Sep 28, 9:02 AM PT",
    meals: [
      {
        courseId: "c-main",
        courseName: "Main",
        dishId: null,
        dishName: null,
        answeredBy: { kind: "not_answered" },
        options: [{ id: "d-salmon", name: "Grilled salmon" }],
      },
    ],
  },
  {
    guestId: "g2",
    guestName: "Alex Example",
    eventId: "e2",
    eventName: "Welcome party",
    status: "declined",
    answeredBy: { kind: "guest", at: "2026-09-28T16:03:00Z" },
    answeredAt: "Sep 28, 9:03 AM PT",
    meals: [
      {
        courseId: "c-canape",
        courseName: "Canapes",
        dishId: null,
        dishName: null,
        answeredBy: { kind: "not_answered" },
        options: [{ id: "d-c", name: "Canape" }],
      },
    ],
  },
  {
    guestId: "g1",
    guestName: "Sam Example",
    eventId: "e2",
    eventName: "Welcome party",
    status: "pending",
    answeredBy: { kind: "not_answered" },
    answeredAt: null,
    meals: [],
  },
];

const ok = (message: string) =>
  jest.fn(async () => ({ ok: true as const, data: { message } }));

function setup(props: Partial<React.ComponentProps<typeof AnswersView>> = {}) {
  const actions = {
    recordRsvp: ok("Answer saved."),
    recordMeal: ok("Meal choice saved."),
    inviteGuests: ok("1 added, 0 already invited, 0 not found"),
  };
  render(
    <AnswersView
      rows={rows}
      guestIds={["g1", "g2"]}
      otherEvents={[{ id: "e9", name: "Rehearsal" }]}
      actions={actions}
      {...props}
    />,
  );
  return actions;
}

const rowFor = (guest: string, event: string) =>
  screen
    .getAllByRole("row")
    .find(
      (r) =>
        within(r).queryByText(guest, { selector: "strong" }) &&
        within(r).queryByText(event),
    )!;

describe("AnswersView", () => {
  it("explains that staff-recorded answers are marked", () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent(/recorded by staff/i);
  });

  it("has the table columns", () => {
    setup();
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual([
      "Guest and event",
      "Answer",
      "Answered by",
      "Meals",
      "Record on their behalf",
    ]);
  });

  it("shows the answer as a badge and who gave it, so staff rows read differently from guest rows", () => {
    setup();
    const staffRow = rowFor("Sam Example", "Ceremony and reception");
    expect(
      within(staffRow).getByText("Attending", { selector: ".badge" }),
    ).toBeVisible();
    expect(
      within(staffRow).getByText(
        "Recorded by staff (Hannah, Oct 3, 2:14 PM PT)",
      ),
    ).toBeVisible();
    const guestRow = rowFor("Alex Example", "Ceremony and reception");
    expect(within(guestRow).getByText("Guest")).toBeVisible();
    expect(within(guestRow).getByText("Sep 28, 9:02 AM PT")).toBeVisible();
    expect(within(guestRow).queryByText(/recorded by staff/i)).toBeNull();
    const pending = rowFor("Sam Example", "Welcome party");
    expect(
      within(pending).getByText("Pending", { selector: ".badge" }),
    ).toBeVisible();
    expect(within(pending).getAllByText("Not answered").length).toBeGreaterThan(
      0,
    );
  });

  it("shows each course with its choice and that choice's own source", () => {
    setup();
    const row = rowFor("Sam Example", "Ceremony and reception");
    expect(within(row).getByText("Main: Mushroom risotto")).toBeVisible();
    expect(within(row).getByText("Dessert: Lemon tart")).toBeVisible();
    expect(within(row).getByText("Guest")).toBeVisible();
    expect(
      within(row).getAllByText(
        /Recorded by staff \(Hannah, Oct 3, 2:15 PM PT\)/,
      ),
    ).toHaveLength(1);
    const alex = rowFor("Alex Example", "Ceremony and reception");
    expect(within(alex).getByText("Main: not chosen")).toBeVisible();
  });

  it("gives every row a uniquely labelled answer select and Save button", async () => {
    const actions = setup();
    const select = screen.getByLabelText(
      "Answer for Sam Example, Ceremony and reception",
    );
    expect(select).toHaveValue("attending");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Pending", "Attending", "Declined"]);
    expect(
      screen.getAllByRole("button", { name: /^Save answer for / }),
    ).toHaveLength(4);

    await userEvent.selectOptions(select, "declined");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Save answer for Sam Example, Ceremony and reception",
      }),
    );
    expect(actions.recordRsvp).toHaveBeenCalledTimes(1);
    const sent = (
      actions.recordRsvp.mock.calls[0] as unknown as [unknown, FormData]
    )[1];
    expect(sent.get("guest_id")).toBe("g1");
    expect(sent.get("event_id")).toBe("e1");
    expect(sent.get("status")).toBe("declined");
    expect(await screen.findByText("Answer saved.")).toBeInTheDocument();
  });

  it("lets staff pick a dish or no choice for each course, and posts it", async () => {
    const actions = setup();
    const select = screen.getByLabelText(
      "Meal for Alex Example, Ceremony and reception, Main",
    );
    expect(select).toHaveValue("");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["No choice", "Grilled salmon"]);
    await userEvent.selectOptions(select, "d-salmon");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Save meal for Alex Example, Ceremony and reception, Main",
      }),
    );
    const sent = (
      actions.recordMeal.mock.calls[0] as unknown as [unknown, FormData]
    )[1];
    expect(sent.get("guest_id")).toBe("g2");
    expect(sent.get("course_id")).toBe("c-main");
    expect(sent.get("dish_id")).toBe("d-salmon");
    expect(await screen.findByText("Meal choice saved.")).toBeInTheDocument();
  });

  it("shows no meal controls on a declined row", () => {
    setup();
    const declined = rowFor("Alex Example", "Welcome party");
    expect(
      within(declined).getByText("Declined", { selector: ".badge" }),
    ).toBeVisible();
    expect(within(declined).getByText("No meals")).toBeVisible();
    expect(within(declined).queryByLabelText(/^Meal for/)).toBeNull();
    expect(
      within(declined).queryByRole("button", { name: /meal/i }),
    ).toBeNull();
    // The answer control is still there.
    expect(
      within(declined).getByLabelText("Answer for Alex Example, Welcome party"),
    ).toBeVisible();
  });

  it("says 'No meals' when the event has no menu to choose from", () => {
    setup();
    const pending = rowFor("Sam Example", "Welcome party");
    expect(within(pending).getByText("No meals")).toBeVisible();
  });

  it("explains what declining does to meals", () => {
    setup();
    expect(
      screen.getByText(
        "Declining clears that guest's meal choices for the event. History keeps them.",
      ),
    ).toBeVisible();
  });

  it("invites the whole household to another event", async () => {
    const actions = setup();
    const select = screen.getByLabelText("Invite to another event");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Invite to Rehearsal"]);
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    const sent = (
      actions.inviteGuests.mock.calls[0] as unknown as [unknown, FormData]
    )[1];
    expect(sent.get("event_id")).toBe("e9");
    expect(sent.getAll("guest_ids")).toEqual(["g1", "g2"]);
    expect(
      await screen.findByText("1 added, 0 already invited, 0 not found"),
    ).toBeInTheDocument();
  });

  it("says so instead of offering an invite when every event is already invited", () => {
    setup({ otherEvents: [] });
    expect(screen.queryByLabelText("Invite to another event")).toBeNull();
    expect(screen.getByText(/invited to every event/i)).toBeVisible();
  });

  it("shows an empty message when there are no invitations", () => {
    setup({ rows: [] });
    expect(screen.getByText(/no invitations yet/i)).toBeVisible();
  });
});
