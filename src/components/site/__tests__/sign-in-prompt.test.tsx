import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignInPrompt } from "../SignInPrompt";

const MESSAGE =
  "If that address is on the guest list or belongs to a staff account, a link is on its way.";

function setup(signIn: jest.Mock) {
  render(<SignInPrompt client={{ signIn } as never} />);
  return {
    input: screen.getByLabelText("Email address"),
    submit: screen.getByRole("button", { name: "Email me a link" }),
  };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("SignInPrompt", () => {
  it("has a labelled email field and a submit button, and no staff sign-in link", () => {
    setup(jest.fn());
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("Email address")).toBeRequired();
    // No staff sign-in link: the only links are the two legal pages.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Privacy Policy",
      "Terms",
    ]);
    expect(screen.getByRole("main")).toHaveClass("stage");
  });

  it("sends the typed address and shows the message the API returns", async () => {
    const signIn = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202, data: { message: MESSAGE } });
    const { input, submit } = setup(signIn);
    type(input, "someone@example.test");
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(MESSAGE);
    expect(signIn).toHaveBeenCalledWith({ email: "someone@example.test" });
    // The form stays so another address can be tried.
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("shows the same wording whatever address was typed", async () => {
    const signIn = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202, data: { message: MESSAGE } });
    const { input, submit } = setup(signIn);
    type(input, "household@example.test");
    fireEvent.click(submit);
    const first = (await screen.findByRole("status")).textContent;
    type(input, "staff@example.test");
    fireEvent.click(submit);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole("status")).textContent).toBe(first);
  });

  it("says to try again soon when there have been too many attempts", async () => {
    const signIn = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: "x" },
    });
    const { input, submit } = setup(signIn);
    type(input, "a@example.test");
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again soon.",
    );
  });

  it("says it could not reach the server when the request fails", async () => {
    const { input, submit } = setup(
      jest.fn().mockRejectedValue(new Error("x")),
    );
    type(input, "a@example.test");
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Try again.",
    );
  });

  it("gives any other failure the same neutral message as success", async () => {
    const signIn = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: "invalid_payload", message: "x" },
    });
    const { input, submit } = setup(signIn);
    type(input, "a@example.test");
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(MESSAGE);
  });

  it("disables the button while a request is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    const signIn = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    const { input, submit } = setup(signIn);
    type(input, "a@example.test");
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    finish({ ok: true, status: 202, data: { message: MESSAGE } });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
