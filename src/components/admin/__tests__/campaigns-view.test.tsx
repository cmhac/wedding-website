import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { messageFor } from "@/lib/admin/messages";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
const previewAudience = jest.fn();
const saveCampaign = jest.fn();
jest.mock("@/lib/admin/actions/campaigns", () => ({
  previewAudience: (...args: unknown[]) => previewAudience(...args),
  saveCampaign: (...args: unknown[]) => saveCampaign(...args),
}));
const sendCampaign = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  sendCampaign: (...args: unknown[]) => sendCampaign(...args),
}));

import type {
  CampaignDetail,
  CampaignListRow,
  DeliveryData,
} from "@/lib/admin/data/campaigns";
import { AudiencePreviewView } from "../AudiencePreviewView";
import { CampaignsListView } from "../CampaignsListView";
import { DeliveryView } from "../DeliveryView";
import { CampaignEditor } from "../forms/CampaignEditor";
import { SendCampaignForm } from "../forms/SendCampaignForm";

const ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD = "6f1d1f3e-2b0a-4c3a-9d55-0a7f6d8e9b10";

beforeEach(() => {
  refresh.mockClear();
  previewAudience.mockReset();
  saveCampaign.mockReset();
  sendCampaign.mockReset();
});

const row = (over: Partial<CampaignListRow>): CampaignListRow => ({
  id: ID,
  name: "Required RSVP reminder",
  messageTypeKey: "rsvp_reminder",
  messageTypeLabel: "RSVP reminder",
  audience: "Required answers outstanding",
  status: "draft",
  scheduledFor: null,
  lastError: null,
  ...over,
});

describe("CampaignsListView", () => {
  const rows = [
    row({
      id: "a",
      name: "Save the date",
      messageTypeLabel: "Save the date",
      audience: "All households",
      status: "done",
      scheduledFor: "Aug 2, 9:00 AM PT",
    }),
    row({ id: "b" }),
    row({
      id: "c",
      name: "Rehearsal invitations",
      messageTypeLabel: "Invitation",
      audience: "Invited to Rehearsal",
      status: "scheduled",
      scheduledFor: "Oct 30, 10:00 AM PT",
    }),
    row({ id: "d", name: "Old one", status: "cancelled" }),
  ];

  it("shows name with message type, audience words, status and send time", () => {
    render(<CampaignsListView campaigns={rows} />);
    const done = screen.getByRole("row", { name: /Save the date/ });
    expect(within(done).getByText("All households")).toBeInTheDocument();
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(within(done).getByText("Aug 2, 9:00 AM PT")).toBeInTheDocument();
    const draft = screen.getByRole("row", { name: /Required RSVP reminder/ });
    expect(within(draft).getByText("RSVP reminder")).toBeInTheDocument();
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
    expect(within(draft).getByText("Not scheduled")).toBeInTheDocument();
  });

  it("offers Edit, Cancel or View delivery by status", () => {
    render(<CampaignsListView campaigns={rows} />);
    const done = screen.getByRole("row", { name: /Save the date/ });
    expect(
      within(done).getByRole("link", { name: "View delivery" }),
    ).toHaveAttribute("href", "/admin/campaigns?tab=delivery&id=a");
    expect(within(done).queryByRole("link", { name: "Edit" })).toBeNull();

    const draft = screen.getByRole("row", { name: /Required RSVP reminder/ });
    expect(within(draft).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/admin/campaigns?tab=edit&id=b",
    );
    expect(within(draft).queryByRole("link", { name: "Cancel" })).toBeNull();

    const scheduled = screen.getByRole("row", { name: /Rehearsal/ });
    expect(
      within(scheduled).getByRole("link", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      within(scheduled).getByRole("link", { name: "Cancel" }),
    ).toHaveAttribute("href", "/admin/campaigns?tab=edit&id=c&confirm=cancel");

    const cancelled = screen.getByRole("row", { name: /Old one/ });
    expect(within(cancelled).queryByRole("link")).toBeNull();
  });

  it("shows the last error in plain words and an empty state", () => {
    const { rerender } = render(
      <CampaignsListView
        campaigns={[
          row({
            lastError:
              "No email template is registered for this message type yet.",
          }),
        ]}
      />,
    );
    expect(
      screen.getByText(/No email template is registered/),
    ).toBeInTheDocument();
    rerender(<CampaignsListView campaigns={[]} />);
    expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument();
  });
});

const messageTypes = [
  { key: "rsvp_reminder", label: "RSVP reminder", isEssential: false },
  { key: "invitation", label: "Invitation", isEssential: true },
];
const events = [
  { slug: "rehearsal", name: "Rehearsal" },
  { slug: "ceremony", name: "Ceremony" },
];
const households = [{ id: HOUSEHOLD, name: "The Examples" }];

function renderEditor(campaign?: CampaignDetail, notice?: string) {
  return render(
    <CampaignEditor
      campaign={campaign}
      messageTypes={messageTypes}
      events={events}
      households={households}
      notice={notice}
    />,
  );
}

const detail = (over: Partial<CampaignDetail> = {}): CampaignDetail => ({
  id: ID,
  name: "Rehearsal invitations",
  messageTypeKey: "invitation",
  audience: { scope: "filter", filters: { invited_to_event: "rehearsal" } },
  status: "draft",
  scheduledLocal: "",
  ...over,
});

describe("CampaignEditor", () => {
  it("has the labelled fields", () => {
    renderEditor();
    expect(screen.getByLabelText("Campaign name")).toBeInTheDocument();
    const type = screen.getByLabelText("Message type");
    expect(
      within(type).getByRole("option", {
        name: "RSVP reminder (non-essential)",
      }),
    ).toBeInTheDocument();
    expect(
      within(type).getByRole("option", { name: "Invitation" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Who receives it")).toBeInTheDocument();
    expect(screen.getByLabelText("Send at (Pacific time)")).toHaveAttribute(
      "type",
      "datetime-local",
    );
  });

  it("has a filters fieldset with six labelled checkboxes", () => {
    renderEditor();
    const filters = screen.getByRole("group", { name: /Filters/ });
    expect(within(filters).getAllByRole("checkbox")).toHaveLength(6);
    for (const label of [
      "Has unanswered required events",
      "Has an unanswered optional event",
      "Invited to a specific event",
      "Attending guests with meals not chosen",
      "Has not already received this message type",
      "Delivery problem only",
    ]) {
      expect(within(filters).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("has the action buttons for a new campaign and no Cancel campaign", () => {
    renderEditor();
    for (const name of ["Preview audience", "Save draft", "Schedule"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Cancel campaign" })).toBeNull();
  });

  it("refills a saved campaign and links to the cancel step", () => {
    renderEditor(detail({ scheduledLocal: "2026-10-30T10:00" }));
    expect(screen.getByLabelText("Campaign name")).toHaveValue(
      "Rehearsal invitations",
    );
    expect(screen.getByLabelText("Message type")).toHaveValue("invitation");
    expect(screen.getByLabelText("Who receives it")).toHaveValue("filter");
    expect(screen.getByLabelText("Invited to a specific event")).toBeChecked();
    expect(screen.getByLabelText("Send at (Pacific time)")).toHaveValue(
      "2026-10-30T10:00",
    );
    expect(
      screen.getByRole("link", { name: "Cancel campaign" }),
    ).toHaveAttribute(
      "href",
      "/admin/campaigns?tab=edit&id=" + ID + "&confirm=cancel",
    );
  });

  it("has no Save draft for a scheduled campaign", () => {
    renderEditor(
      detail({ status: "scheduled", scheduledLocal: "2026-10-30T10:00" }),
    );
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Schedule" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["sending", /being sent/],
    ["done", /has been sent/],
    ["cancelled", /was cancelled/],
  ] as const)("shows a read-only note for a %s campaign", (status, note) => {
    renderEditor(detail({ status }));
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryByLabelText("Campaign name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });

  it("shows the preview when Preview audience is pressed", async () => {
    previewAudience.mockResolvedValue({
      ok: true,
      data: {
        willSend: [{ householdId: "h1", name: "The Examples" }],
        skipped: [],
      },
    });
    renderEditor();
    await userEvent.type(screen.getByLabelText("Campaign name"), "Reminder");
    await userEvent.click(
      screen.getByRole("button", { name: "Preview audience" }),
    );
    expect(
      await screen.findByText("1 household will be emailed"),
    ).toBeInTheDocument();
    expect(previewAudience).toHaveBeenCalledTimes(1);
    expect(saveCampaign).not.toHaveBeenCalled();
  });

  it("shows a refusal from save and keeps what was typed", async () => {
    saveCampaign.mockImplementation(async (_prev, fd: FormData) => ({
      ok: false,
      message:
        "Choose at least one filter, or send to everyone or one household.",
      fieldErrors: { audience: "Choose at least one filter." },
      values: Object.fromEntries(fd.entries()),
    }));
    renderEditor();
    await userEvent.type(screen.getByLabelText("Campaign name"), "Reminder");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose at least one filter, or send to everyone or one household.",
    );
    expect(screen.getByLabelText("Campaign name")).toHaveValue("Reminder");
    const fd = saveCampaign.mock.calls[0][1] as FormData;
    expect(fd.get("intent")).toBe("draft");
  });

  it("sends intent=schedule from the Schedule button", async () => {
    saveCampaign.mockResolvedValue({
      ok: true,
      data: { id: ID, message: "Scheduled for Oct 30, 10:00 AM PT." },
    });
    renderEditor();
    await userEvent.type(screen.getByLabelText("Campaign name"), "Reminder");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(
      await screen.findByText("Scheduled for Oct 30, 10:00 AM PT."),
    ).toBeInTheDocument();
    expect((saveCampaign.mock.calls[0][1] as FormData).get("intent")).toBe(
      "schedule",
    );
  });

  it("shows a notice passed by the page", () => {
    renderEditor(detail(), "Saved.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });
});

describe("AudiencePreviewView", () => {
  const preview = {
    willSend: Array.from({ length: 21 }, (_, i) => ({
      householdId: `w${i}`,
      name: `Family ${i}`,
    })),
    skipped: [
      { householdId: "s1", name: "Exampleton family", reason: "no_email" },
      { householdId: "s2", name: "Sample Family", reason: "no_email" },
      { householdId: "s3", name: "Test, Pat and Lee", reason: "opted_out" },
    ],
  };

  it("counts who will be emailed and who is skipped", () => {
    render(<AudiencePreviewView preview={preview} />);
    expect(
      screen.getByText("21 households will be emailed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "3 are skipped: 2 with no email (need a paper invite), 1 opted out",
      ),
    ).toBeInTheDocument();
  });

  it("lists each household with a badge and a link", () => {
    render(<AudiencePreviewView preview={preview} />);
    const will = screen.getByRole("row", { name: /Family 0/ });
    expect(within(will).getByText("Will send")).toBeInTheDocument();
    expect(
      within(will).getByRole("link", { name: "Family 0" }),
    ).toHaveAttribute("href", "/admin/households/w0");
    const none = screen.getByRole("row", { name: /Exampleton family/ });
    expect(within(none).getByText("No email")).toBeInTheDocument();
    const out = screen.getByRole("row", { name: /Test, Pat and Lee/ });
    expect(within(out).getByText("Opted out")).toBeInTheDocument();
  });

  it("handles singular counts and nobody skipped", () => {
    render(
      <AudiencePreviewView
        preview={{
          willSend: [{ householdId: "w", name: "One" }],
          skipped: [],
        }}
      />,
    );
    expect(screen.getByText("1 household will be emailed")).toBeInTheDocument();
    expect(screen.queryByText(/skipped/)).toBeNull();
  });

  it("says so when nobody matches", () => {
    render(<AudiencePreviewView preview={{ willSend: [], skipped: [] }} />);
    expect(screen.getByText(/no households match/i)).toBeInTheDocument();
  });
});

describe("SendCampaignForm", () => {
  const props = {
    campaignId: ID,
    backHref: "/admin/campaigns?tab=edit&id=" + ID,
  };

  it("shows the confirm step first and sends nothing yet", async () => {
    render(<SendCampaignForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      /emails go out straight away and cannot be unsent/i,
    );
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("starts at the confirm step when asked to", () => {
    render(<SendCampaignForm {...props} startConfirmed />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("calls the wrapper on confirming and shows the outcome", async () => {
    sendCampaign.mockResolvedValue({
      ok: true,
      data: {
        campaign_id: ID,
        queued: 0,
        sent: 18,
        skipped: { no_email: 2, opted_out: 1, other: 0 },
        failed: 0,
      },
    });
    render(<SendCampaignForm {...props} startConfirmed />);
    await userEvent.click(screen.getByRole("button", { name: /^Send/ }));
    expect(sendCampaign).toHaveBeenCalledWith(ID);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Done. 18 sent, 0 still queued, 3 skipped, 0 failed.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ["template_missing", 409],
    ["campaign_not_sendable", 409],
    ["invalid_audience", 409],
    ["not_found", 404],
  ])("shows the plain message for %s", async (code, status) => {
    sendCampaign.mockResolvedValue({
      ok: false,
      status,
      error: { code, message: "raw text" },
    });
    render(<SendCampaignForm {...props} startConfirmed />);
    await userEvent.click(screen.getByRole("button", { name: /^Send/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(messageFor(code));
    expect(alert).not.toHaveTextContent("raw text");
    expect(alert).toHaveTextContent(/nothing was sent/i);
  });
});

describe("DeliveryView", () => {
  const delivery: DeliveryData = {
    campaign: { id: ID, name: "Save the date", status: "done" },
    counts: { delivered: 18, skipped: 3, bounced: 1 },
    rows: [
      {
        id: "m1",
        householdId: "h1",
        householdName: "The Examples",
        status: "delivered",
        detail: "",
        at: "Aug 2, 9:02 AM PT",
      },
      {
        id: "m2",
        householdId: "h2",
        householdName: "Exampleton family",
        status: "skipped",
        detail: "No email on file",
        at: "Aug 2, 9:00 AM PT",
      },
      {
        id: "m3",
        householdId: null,
        householdName: "Deleted household",
        status: "bounced",
        detail: "Household flagged with a delivery problem",
        at: "Aug 2, 9:03 AM PT",
      },
    ],
  };

  it("shows counts per status", () => {
    render(<DeliveryView delivery={delivery} />);
    expect(screen.getByText("18")).toBeInTheDocument();
    for (const label of ["Delivered", "Skipped", "Bounced"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Queued")).toBeNull();
  });

  it("shows rows with household link, status, detail and time", () => {
    render(<DeliveryView delivery={delivery} />);
    const row = screen.getByRole("row", { name: /Exampleton family/ });
    expect(
      within(row).getByRole("link", { name: "Exampleton family" }),
    ).toHaveAttribute("href", "/admin/households/h2");
    expect(within(row).getByText("Skipped")).toBeInTheDocument();
    expect(within(row).getByText("No email on file")).toBeInTheDocument();
    expect(within(row).getByText("Aug 2, 9:00 AM PT")).toBeInTheDocument();
    const gone = screen.getByRole("row", { name: /Deleted household/ });
    expect(within(gone).queryByRole("link")).toBeNull();
  });

  it("says so when nothing was sent yet", () => {
    render(<DeliveryView delivery={{ ...delivery, rows: [], counts: {} }} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });
});
