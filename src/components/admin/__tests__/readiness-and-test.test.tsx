import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReadinessList } from "../ReadinessList";
import { SendTestForm } from "../forms/SendTestForm";
import { CampaignsListView } from "../CampaignsListView";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const mockTest = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  sendTestCampaign: (...a: unknown[]) => mockTest(...a),
}));

describe("ReadinessList", () => {
  it("says ready, needs a look, or blocked, in plain words, with each reason", () => {
    render(
      <ReadinessList
        items={[
          {
            key: "date",
            label: "Wedding date",
            status: "ready",
            detail: "The wedding event has a date.",
          },
          {
            key: "rsvp",
            label: "RSVP",
            status: "warn",
            detail: "The RSVP is open.",
          },
          {
            key: "email_template",
            label: "Email template",
            status: "blocked",
            detail: "No save the date email is registered yet.",
          },
        ]}
      />,
    );
    expect(screen.getByText("Wedding date")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(
      screen.getByText("No save the date email is registered yet."),
    ).toBeInTheDocument();
  });

  it("says the real send is held back while anything is blocked", () => {
    const { rerender } = render(
      <ReadinessList
        items={[{ key: "a", label: "A", status: "blocked", detail: "x" }]}
      />,
    );
    expect(screen.getByText(/real send is held back/i)).toBeInTheDocument();
    rerender(
      <ReadinessList
        items={[{ key: "a", label: "A", status: "ready", detail: "x" }]}
      />,
    );
    expect(screen.queryByText(/real send is held back/i)).toBeNull();
  });
});

describe("SendTestForm", () => {
  const households = [
    { id: "h1", name: "Test household" },
    { id: "h2", name: "Other household" },
  ];
  const props = {
    messageTypeKey: "save_the_date",
    channel: "both" as const,
    households,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTest.mockResolvedValue({
      ok: true,
      data: {
        campaign_id: "c1",
        households: 1,
        addresses: 1,
        queued: 0,
        sent: 2,
        skipped: { no_email: 0, opted_out: 0, other: 0 },
        failed: 0,
      },
    });
  });

  it("sends nothing until a household is chosen", async () => {
    render(<SendTestForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(
      await screen.findByText("Choose a household for the test."),
    ).toBeInTheDocument();
    expect(mockTest).not.toHaveBeenCalled();
  });

  it("sends a test to the one household chosen, then says what happened and that it does not count", async () => {
    render(<SendTestForm {...props} />);
    fireEvent.change(screen.getByLabelText("Send the test to"), {
      target: { value: "h1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    await waitFor(() =>
      expect(mockTest).toHaveBeenCalledWith({
        message_type_key: "save_the_date",
        channel: "both",
        household_id: "h1",
      }),
    );
    expect(await screen.findByText(/Test sent: 2 sent/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /does not count as the real send/i,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a plain message when the test is refused", async () => {
    mockTest.mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: "template_missing", message: "x" },
    });
    render(<SendTestForm {...props} />);
    fireEvent.change(screen.getByLabelText("Send the test to"), {
      target: { value: "h1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(await screen.findByText(/No email template/i)).toBeInTheDocument();
  });
});

describe("CampaignsListView test label", () => {
  it("labels a test campaign", () => {
    render(
      <CampaignsListView
        campaigns={[
          {
            id: "c1",
            name: "Test: save_the_date",
            messageTypeKey: "save_the_date",
            messageTypeLabel: "Save the date",
            audience: "One household",
            status: "done",
            scheduledFor: null,
            lastError: null,
            isTest: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
