import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createHousehold,
  deleteHousehold,
  updateHousehold,
} from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { ContactEmailForm } from "../forms/ContactEmailForm";
import { DeleteHouseholdForm } from "../forms/DeleteHouseholdForm";
import { HouseholdCreateForm } from "../forms/HouseholdCreateForm";

jest.mock("@/lib/admin-api/client", () => ({
  createHousehold: jest.fn(),
  updateHousehold: jest.fn(),
  deleteHousehold: jest.fn(),
}));

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const rpc = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ rpc }),
}));

const create = createHousehold as jest.Mock;
const update = updateHousehold as jest.Mock;
const remove = deleteHousehold as jest.Mock;

const events = [
  { id: "e-party", slug: "welcome-party", name: "Welcome party" },
  { id: "e-wedding", slug: "wedding", name: "Wedding" },
];

const created = {
  ok: true,
  data: {
    household: {
      id: "new-1",
      display_name: "The Examples",
      contact_email: null,
      plus_one_allowance: 1,
      paper_only: true,
    },
    guest_ids: ["g-1", "g-2"],
  },
};

const failure = (code: string) => ({
  ok: false,
  status: 409,
  error: { code, message: "raw text that must not be shown" },
});

beforeEach(() => {
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  push.mockReset();
  refresh.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
});

describe("HouseholdCreateForm", () => {
  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Display name"), "The Examples");
    await user.type(screen.getByLabelText("Guest 1 first name"), "Sam");
    await user.type(screen.getByLabelText("Guest 1 last name"), "Example");
  }

  it("sends the household with the guests added", async () => {
    create.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.clear(screen.getByLabelText("Plus-one allowance"));
    await user.type(screen.getByLabelText("Plus-one allowance"), "1");
    await user.click(screen.getByRole("button", { name: "Add another guest" }));
    await user.type(screen.getByLabelText("Guest 2 first name"), "Alex");
    await user.type(screen.getByLabelText("Guest 2 last name"), "Example");
    await user.type(
      screen.getByLabelText("Guest 2 email"),
      "alex@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Create household" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      display_name: "The Examples",
      contact_email: null,
      plus_one_allowance: 1,
      address: null,
      notes: null,
      guests: [
        { first_name: "Sam", last_name: "Example", email: null },
        {
          first_name: "Alex",
          last_name: "Example",
          email: "alex@example.test",
        },
      ],
    });
  });

  it("sends a contact email and address when given, then opens the household", async () => {
    create.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.type(
      screen.getByLabelText("Contact email"),
      "household@example.test",
    );
    await user.type(screen.getByLabelText("Street"), "1 Sample Street");
    await user.type(screen.getByLabelText("City"), "Exampleville");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: "household@example.test",
        address: { street: "1 Sample Street", city: "Exampleville" },
      }),
    );
    await screen.findByRole("button", { name: "Create household" });
    expect(push).toHaveBeenCalledWith("/admin/households/new-1");
  });

  it("invites the new guests to each ticked event", async () => {
    create.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.click(screen.getByRole("checkbox", { name: "Wedding" }));
    await user.click(screen.getByRole("button", { name: "Create household" }));
    await screen.findByRole("button", { name: "Create household" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("invite", {
      guest_ids: ["g-1", "g-2"],
      event_id: "e-wedding",
    });
    expect(push).toHaveBeenCalledWith("/admin/households/new-1");
  });

  it("does not invite anyone when no event is ticked", async () => {
    create.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: "Create household" }));
    await screen.findByRole("button", { name: "Create household" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says so, with a link, when the household exists but inviting failed", async () => {
    create.mockResolvedValue(created);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.click(screen.getByRole("checkbox", { name: "Wedding" }));
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /household was created/i,
    );
    expect(
      screen.getByRole("link", { name: /Open the household/ }),
    ).toHaveAttribute("href", "/admin/households/new-1");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows email_in_use in plain words and keeps every typed value", async () => {
    create.mockResolvedValue(failure("email_in_use"));
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.type(
      screen.getByLabelText("Contact email"),
      "taken@example.test",
    );
    await user.type(screen.getByLabelText("Staff notes"), "Friends of Hannah");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That contact email already belongs to another household.",
    );
    expect(screen.queryByText(/raw text/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("The Examples");
    expect(screen.getByLabelText("Contact email")).toHaveValue(
      "taken@example.test",
    );
    expect(screen.getByLabelText("Guest 1 first name")).toHaveValue("Sam");
    expect(screen.getByLabelText("Staff notes")).toHaveValue(
      "Friends of Hannah",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows other refusals from messages.ts", async () => {
    create.mockResolvedValue(failure("invalid_request"));
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messageFor("invalid_request"),
    );
  });

  it("asks for a display name and one named guest before sending", async () => {
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getByLabelText("Display name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("can remove an extra guest row", async () => {
    const user = userEvent.setup();
    render(<HouseholdCreateForm events={events} />);
    expect(
      screen.queryByRole("button", { name: /Remove guest/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add another guest" }));
    await user.click(screen.getByRole("button", { name: "Remove guest 2" }));
    expect(
      screen.queryByLabelText("Guest 2 first name"),
    ).not.toBeInTheDocument();
  });
});

describe("ContactEmailForm", () => {
  const okResponse = {
    ok: true,
    data: { household: { id: "h1", paper_only: false } },
  };

  it("starts with the current address", () => {
    render(<ContactEmailForm householdId="h1" email="old@example.test" />);
    expect(screen.getByLabelText("Contact email")).toHaveValue(
      "old@example.test",
    );
  });

  it("sends the new email and refreshes the page", async () => {
    update.mockResolvedValue(okResponse);
    const user = userEvent.setup();
    render(<ContactEmailForm householdId="h1" email="old@example.test" />);
    const field = screen.getByLabelText("Contact email");
    await user.clear(field);
    await user.type(field, "new@example.test");
    await user.click(
      screen.getByRole("button", { name: "Save contact email" }),
    );
    expect(update).toHaveBeenCalledWith("h1", {
      contact_email: "new@example.test",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Contact email saved.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("sends null for an empty field, which makes the household paper-only", async () => {
    update.mockResolvedValue(okResponse);
    const user = userEvent.setup();
    render(<ContactEmailForm householdId="h1" email="old@example.test" />);
    await user.clear(screen.getByLabelText("Contact email"));
    await user.click(
      screen.getByRole("button", { name: "Save contact email" }),
    );
    expect(update).toHaveBeenCalledWith("h1", { contact_email: null });
  });

  it.each(["email_in_use", "staff_account"])(
    "shows the %s message from messages.ts and keeps the typed email",
    async (code) => {
      update.mockResolvedValue(failure(code));
      const user = userEvent.setup();
      render(<ContactEmailForm householdId="h1" email={null} />);
      await user.type(
        screen.getByLabelText("Contact email"),
        "other@example.test",
      );
      await user.click(
        screen.getByRole("button", { name: "Save contact email" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        messageFor(code),
      );
      expect(screen.getByLabelText("Contact email")).toHaveValue(
        "other@example.test",
      );
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});

describe("DeleteHouseholdForm", () => {
  function renderForm() {
    return render(
      <DeleteHouseholdForm
        householdId="h1"
        householdName="The Examples"
        cancelHref="/admin/households/h1?tab=remove"
      />,
    );
  }

  it("enables the delete button only when the typed name matches exactly", async () => {
    const user = userEvent.setup();
    renderForm();
    const button = screen.getByRole("button", { name: "Delete permanently" });
    const input = screen.getByLabelText("Type the household name to confirm");
    expect(button).toBeDisabled();
    await user.type(input, "the examples");
    expect(button).toBeDisabled();
    await user.clear(input);
    await user.type(input, "The Example");
    expect(button).toBeDisabled();
    await user.type(input, "s");
    expect(button).toBeEnabled();
    await user.type(input, " ");
    expect(button).toBeDisabled();
  });

  it("deletes and goes back to the list", async () => {
    remove.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    renderForm();
    await user.type(
      screen.getByLabelText("Type the household name to confirm"),
      "The Examples",
    );
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(remove).toHaveBeenCalledWith("h1");
    await screen.findByRole("button", { name: "Delete permanently" });
    expect(push).toHaveBeenCalledWith("/admin/households");
  });

  it("does not call the API while the name does not match", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("shows a refusal in plain words and stays on the page", async () => {
    remove.mockResolvedValue(failure("not_found"));
    const user = userEvent.setup();
    renderForm();
    await user.type(
      screen.getByLabelText("Type the household name to confirm"),
      "The Examples",
    );
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messageFor("not_found"),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("has a Cancel link back to the page", () => {
    renderForm();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/admin/households/h1?tab=remove",
    );
  });
});
