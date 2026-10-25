import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { requestStaffSignIn } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { SignInForm } from "../forms/SignInForm";

jest.mock("@/lib/admin-api/client", () => ({
  requestStaffSignIn: jest.fn(),
}));

const request = requestStaffSignIn as jest.Mock;
const NEUTRAL =
  "If that address belongs to a staff account, a sign-in link is on its way.";

async function submit(email = "staff@example.test") {
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText("Email address"), email);
  await user.click(screen.getByRole("button", { name: /sign-in link/i }));
  return user;
}

beforeEach(() => request.mockReset());

describe("SignInForm", () => {
  it("has a labelled Email address field", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "type",
      "email",
    );
  });

  it("sends the typed address and shows the neutral message for a 202", async () => {
    request.mockResolvedValue({ ok: true, data: null });
    await submit("staff@example.test");
    expect(request).toHaveBeenCalledWith("staff@example.test");
    expect(await screen.findByRole("status")).toHaveTextContent(NEUTRAL);
  });

  it.each([
    [404, "not_found"],
    [400, "invalid_request"],
    [500, "server_error"],
  ])(
    "shows the same neutral message for a %s %s response",
    async (status, code) => {
      request.mockResolvedValue({
        ok: false,
        status,
        error: { code, message: "raw text" },
      });
      await submit();
      expect(await screen.findByRole("status")).toHaveTextContent(NEUTRAL);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows the rate-limit message from messages.ts for a 429", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: "raw text" },
    });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messageFor("rate_limited"),
    );
    expect(screen.queryByText(NEUTRAL)).not.toBeInTheDocument();
  });

  it("keeps the email in the field after an error", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: "x" },
    });
    await submit("keep@example.test");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "keep@example.test",
    );
  });

  it("shows a network failure in plain words and keeps the field", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 0,
      error: { code: "network", message: "x" },
    });
    await submit("net@example.test");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messageFor("network"),
    );
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "net@example.test",
    );
  });
});
