import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  addContact,
  getInviteLink,
  reissueInviteLink,
  removeContact,
  signOutHousehold,
  updateContact,
} from "@/lib/admin-api/client";
import { ContactsList } from "../ContactsList";
import { InviteLinkControls } from "../InviteLinkControls";
import { SignOutEverywhereForm } from "../forms/SignOutEverywhereForm";

jest.mock("@/lib/admin-api/client", () => ({
  addContact: jest.fn(),
  updateContact: jest.fn(),
  removeContact: jest.fn(),
  getInviteLink: jest.fn(),
  reissueInviteLink: jest.fn(),
  signOutHousehold: jest.fn(),
}));
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const add = addContact as jest.Mock;
const update = updateContact as jest.Mock;
const remove = removeContact as jest.Mock;
const getLink = getInviteLink as jest.Mock;
const reissue = reissueInviteLink as jest.Mock;
const signOut = signOutHousehold as jest.Mock;

const failure = (code: string) => ({
  ok: false,
  status: 409,
  error: { code, message: "raw text that must not be shown" },
});

beforeEach(() => {
  jest.resetAllMocks();
});

const two = [
  { id: "c1", value: "one@example.test", deliveryProblem: false },
  { id: "c2", value: "two@example.test", deliveryProblem: true },
];

describe("ContactsList", () => {
  it("lists every address with its delivery flag, or says the household is paper only", () => {
    const { rerender } = render(
      <ContactsList householdId="h1" contacts={two} />,
    );
    expect(screen.getByText("one@example.test")).toBeInTheDocument();
    expect(screen.getByText("two@example.test")).toBeInTheDocument();
    expect(screen.getAllByText("Delivery problem")).toHaveLength(1);
    rerender(<ContactsList householdId="h1" contacts={[]} />);
    expect(screen.getByText(/paper only/)).toBeInTheDocument();
  });

  it("adds an address, shows a notice and refreshes", async () => {
    add.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render(<ContactsList householdId="h1" contacts={two} />);
    await user.type(
      screen.getByLabelText("Add an email address"),
      "new@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Add address" }));
    expect(add).toHaveBeenCalledWith("h1", "new@example.test");
    expect(await screen.findByText("Address added.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Add an email address")).toHaveValue("");
  });

  it.each(["email_in_use", "staff_account"])(
    "shows the %s message in plain words and keeps what was typed",
    async (code) => {
      add.mockResolvedValue(failure(code));
      const user = userEvent.setup();
      render(<ContactsList householdId="h1" contacts={two} />);
      await user.type(
        screen.getByLabelText("Add an email address"),
        "x@example.test",
      );
      await user.click(screen.getByRole("button", { name: "Add address" }));
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent("raw text");
      expect(screen.getByLabelText("Add an email address")).toHaveValue(
        "x@example.test",
      );
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("changes an address, noting that its delivery flag clears", async () => {
    update.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render(<ContactsList householdId="h1" contacts={two} />);
    await user.click(
      screen.getByRole("button", { name: /Change two@example.test/ }),
    );
    const field = screen.getByLabelText("New address for two@example.test");
    expect(field).toHaveValue("two@example.test");
    await user.clear(field);
    await user.type(field, "fixed@example.test");
    await user.click(screen.getByRole("button", { name: "Save address" }));
    expect(update).toHaveBeenCalledWith("h1", "c2", "fixed@example.test");
    expect(
      await screen.findByText(/delivery problem flag is cleared/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    render(<ContactsList householdId="h1" contacts={two} />);
    await user.click(
      screen.getByRole("button", { name: /Change one@example.test/ }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("one@example.test")).toBeInTheDocument();
  });

  it("asks before removing, then removes", async () => {
    remove.mockResolvedValue({ ok: true, data: { paper_only: false } });
    const user = userEvent.setup();
    render(<ContactsList householdId="h1" contacts={two} />);
    await user.click(
      screen.getByRole("button", { name: /Remove one@example.test/ }),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByText(/becomes paper only/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove address" }));
    expect(remove).toHaveBeenCalledWith("h1", "c1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("warns that removing the last address makes the household paper only", async () => {
    const user = userEvent.setup();
    render(<ContactsList householdId="h1" contacts={[two[0]]} />);
    await user.click(
      screen.getByRole("button", { name: /Remove one@example.test/ }),
    );
    expect(
      screen.getByText(/last address, so the household becomes paper only/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("InviteLinkControls", () => {
  const link = {
    ok: true,
    data: {
      url: "https://x.example/i/abc.def",
      issued_at: "2027-01-01T00:00:00Z",
    },
  };
  let writeText: jest.Mock;
  beforeEach(() => {
    writeText = jest.fn().mockResolvedValue(undefined);
  });
  // user-event installs its own clipboard stub in setup(), so ours goes in after.
  const setup = () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return user;
  };

  it("copies the current link", async () => {
    getLink.mockResolvedValue(link);
    const user = setup();
    render(<InviteLinkControls householdId="h1" />);
    await user.click(
      screen.getByRole("button", { name: "Copy personal link" }),
    );
    expect(getLink).toHaveBeenCalledWith("h1");
    expect(writeText).toHaveBeenCalledWith("https://x.example/i/abc.def");
    expect(
      await screen.findByText("Personal link copied."),
    ).toBeInTheDocument();
  });

  it("shows the link to copy by hand when the browser refuses", async () => {
    getLink.mockResolvedValue(link);
    writeText.mockRejectedValue(new Error("denied"));
    const user = setup();
    render(<InviteLinkControls householdId="h1" />);
    await user.click(
      screen.getByRole("button", { name: "Copy personal link" }),
    );
    expect(await screen.findByLabelText("Personal link")).toHaveValue(
      "https://x.example/i/abc.def",
    );
  });

  it("asks first, saying the old link stops and the new one must be sent, then reissues", async () => {
    reissue.mockResolvedValue({
      ok: true,
      data: {
        url: "https://x.example/i/new",
        issued_at: "2027-02-01T00:00:00Z",
      },
    });
    const user = setup();
    render(<InviteLinkControls householdId="h1" />);
    await user.click(screen.getByRole("button", { name: "Reissue link" }));
    expect(reissue).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /old link stops working at once, and the new link must be sent/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reissue and copy" }));
    expect(reissue).toHaveBeenCalledWith("h1");
    expect(writeText).toHaveBeenCalledWith("https://x.example/i/new");
    expect(
      await screen.findByText(/old link no longer works/),
    ).toBeInTheDocument();
  });

  it("cancels a reissue", async () => {
    const user = userEvent.setup();
    render(<InviteLinkControls householdId="h1" />);
    await user.click(screen.getByRole("button", { name: "Reissue link" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(reissue).not.toHaveBeenCalled();
  });

  it("shows a plain message when the link cannot be read", async () => {
    getLink.mockResolvedValue(failure("not_found"));
    const user = userEvent.setup();
    render(<InviteLinkControls householdId="h1" />);
    await user.click(
      screen.getByRole("button", { name: "Copy personal link" }),
    );
    expect(await screen.findByRole("alert")).not.toHaveTextContent("raw text");
  });
});

describe("SignOutEverywhereForm", () => {
  it("asks for confirmation, then signs the household out", async () => {
    signOut.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<SignOutEverywhereForm householdId="h1" />);
    await user.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    expect(signOut).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Sign out on every device" }),
    );
    expect(signOut).toHaveBeenCalledWith("h1");
    expect(
      await screen.findByText(/Signed out everywhere/),
    ).toBeInTheDocument();
  });

  it("does nothing when cancelled, and shows a plain message on failure", async () => {
    const user = userEvent.setup();
    render(<SignOutEverywhereForm householdId="h1" />);
    await user.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signOut).not.toHaveBeenCalled();
    signOut.mockResolvedValue(failure("server_error"));
    await user.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sign out on every device" }),
    );
    expect(await screen.findByRole("alert")).not.toHaveTextContent("raw text");
  });
});
