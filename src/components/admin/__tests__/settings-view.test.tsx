import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
jest.mock("@/lib/admin/actions/settings", () => ({
  saveSettings: jest.fn(async () => ({ ok: true })),
}));
const grantStaff = jest.fn();
const revokeStaff = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  grantStaff: (...args: unknown[]) => grantStaff(...args),
  revokeStaff: (...args: unknown[]) => revokeStaff(...args),
}));

import { SettingsView } from "../SettingsView";
import { AddPlannerForm, RemoveAccessButton } from "../forms/StaffForms";

const staff = [
  { user_id: "u1", display_name: "Chris", role: "couple" as const },
  { user_id: "u2", display_name: "Hannah", role: "couple" as const },
  { user_id: "u3", display_name: "Pat Planner", role: "planner" as const },
];
const settings = { default_rsvp_deadline: "2027-05-01T23:59", rsvp_open: true };

beforeEach(() => {
  refresh.mockClear();
  grantStaff.mockReset();
  revokeStaff.mockReset();
});

describe("SettingsView for a couple member", () => {
  beforeEach(() => {
    render(
      <SettingsView
        role="couple"
        currentUserId="u1"
        settings={settings}
        staff={staff}
      />,
    );
  });

  it("shows the RSVP settings form with labelled fields", () => {
    expect(
      screen.getByLabelText("Default RSVP deadline (Pacific time)"),
    ).toHaveValue("2027-05-01T23:59");
    expect(screen.getByLabelText(/RSVPs are open/)).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeInTheDocument();
  });

  it("lists staff with Remove access on other people but not on yourself", () => {
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const own = rows.find((r) => within(r).queryByText("Chris"))!;
    expect(within(own).getByText("(you)")).toBeInTheDocument();
    expect(within(own).queryByRole("button")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Remove access/ }),
    ).toHaveLength(2);
    expect(within(rows[2]).getByText("Planner")).toBeInTheDocument();
  });

  it("shows the add-planner form", () => {
    expect(screen.getByLabelText("Planner name")).toBeInTheDocument();
    expect(screen.getByLabelText("Planner email")).toHaveAttribute(
      "type",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Give planner access" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("View only")).toBeNull();
  });
});

describe("SettingsView for a planner", () => {
  beforeEach(() => {
    render(
      <SettingsView
        role="planner"
        currentUserId="u3"
        settings={settings}
        staff={staff}
      />,
    );
  });

  it("shows the table view only, with the explanation", () => {
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.getByText("Pat Planner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove access/ })).toBeNull();
    expect(screen.queryByLabelText("Planner name")).toBeNull();
    expect(screen.queryByLabelText("Planner email")).toBeNull();
    expect(
      screen.getByText("Only the couple can add or remove staff."),
    ).toBeInTheDocument();
  });

  it("still shows the RSVP settings form", () => {
    expect(
      screen.getByLabelText("Default RSVP deadline (Pacific time)"),
    ).toBeInTheDocument();
  });
});

describe("AddPlannerForm", () => {
  async function fill() {
    await userEvent.type(screen.getByLabelText("Planner name"), "Pat Planner");
    await userEvent.type(
      screen.getByLabelText("Planner email"),
      "pat@example.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Give planner access" }),
    );
  }

  it("posts the details and names the new person in the message", async () => {
    grantStaff.mockResolvedValue({
      ok: true,
      data: {
        staff: { user_id: "u9", role: "planner", display_name: "Pat Planner" },
      },
    });
    render(<AddPlannerForm />);
    await fill();
    expect(grantStaff).toHaveBeenCalledWith({
      email: "pat@example.test",
      display_name: "Pat Planner",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pat Planner now has planner access.",
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Planner name")).toHaveValue("");
  });

  it("explains a refusal for a planner", async () => {
    grantStaff.mockResolvedValue({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "x" },
    });
    render(<AddPlannerForm />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are signed in as a planner. Only the couple can change staff access.",
    );
    expect(screen.getByLabelText("Planner name")).toHaveValue("Pat Planner");
  });

  it("explains an email that already has an account", async () => {
    grantStaff.mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: "email_in_use", message: "x" },
    });
    render(<AddPlannerForm />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email address already has an account.",
    );
  });

  it("shows field errors from a 422 as a plain message", async () => {
    grantStaff.mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: "invalid_payload", message: "bad" },
    });
    render(<AddPlannerForm />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of what you entered is not valid. Please check it.",
    );
  });
});

describe("RemoveAccessButton", () => {
  it("asks for confirmation before revoking, and can be cancelled", async () => {
    render(<RemoveAccessButton userId="u2" displayName="Hannah" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove access for Hannah" }),
    );
    expect(revokeStaff).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Hannah will no longer be able to sign in/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(revokeStaff).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Remove access for Hannah" }),
    ).toBeInTheDocument();
  });

  it("revokes after confirming and refreshes the page", async () => {
    revokeStaff.mockResolvedValue({ ok: true, data: null });
    render(<RemoveAccessButton userId="u2" displayName="Hannah" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove access for Hannah" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, remove access" }),
    );
    expect(revokeStaff).toHaveBeenCalledWith("u2");
    await screen.findByRole("status");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the last-couple message", async () => {
    revokeStaff.mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: "last_couple", message: "x" },
    });
    render(<RemoveAccessButton userId="u2" displayName="Hannah" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove access for Hannah" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, remove access" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The last couple member cannot be removed.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the planner message on a 403", async () => {
    revokeStaff.mockResolvedValue({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "x" },
    });
    render(<RemoveAccessButton userId="u2" displayName="Hannah" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove access for Hannah" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, remove access" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are signed in as a planner. Only the couple can change staff access.",
    );
  });
});
