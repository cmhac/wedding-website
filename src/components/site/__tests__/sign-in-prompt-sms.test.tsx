import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignInPrompt } from "../SignInPrompt";

const BOTH =
  "If that email address or mobile number is on the guest list, or belongs to a staff account, a link is on its way.";

function setup(signIn: jest.Mock, smsAvailable = true) {
  render(
    <SignInPrompt smsAvailable={smsAvailable} client={{ signIn } as never} />,
  );
  return screen.getByLabelText("Email or mobile number");
}

const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

describe("SignInPrompt with texting available", () => {
  it("has one field for an email address or a mobile number, and no checkbox yet", () => {
    setup(jest.fn());
    expect(screen.getByLabelText("Email or mobile number")).toBeRequired();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Send me a link" }),
    ).toBeEnabled();
  });

  it("shows no checkbox for an email address and sends it as the identifier", async () => {
    const signIn = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202, data: { message: BOTH } });
    const input = setup(signIn);
    type(input, "someone@example.test");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send me a link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(BOTH);
    expect(signIn).toHaveBeenCalledWith({ identifier: "someone@example.test" });
  });

  it("shows an unticked consent checkbox with the full statement for a phone number", () => {
    const input = setup(jest.fn());
    type(input, "(202) 555-0123");
    const box = screen.getByRole("checkbox");
    expect(box).not.toBeChecked();
    const statement = box.closest("div")!.textContent ?? "";
    expect(statement).toContain("Chris & Hannah's wedding");
    expect(statement).toContain("about a dozen messages over six months");
    expect(statement).toContain("Msg & data rates may apply");
    expect(statement).toContain("Reply HELP for help, STOP to opt out");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("cannot send a phone number until the box is ticked", async () => {
    const signIn = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202, data: { message: BOTH } });
    const input = setup(signIn);
    type(input, "(202) 555-0123");
    const submit = screen.getByRole("button", { name: "Send me a link" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        identifier: "(202) 555-0123",
        sms_consent: true,
      }),
    );
  });

  it("untick again and the button is disabled again", () => {
    const input = setup(jest.fn());
    type(input, "202-555-0123");
    const box = screen.getByRole("checkbox");
    fireEvent.click(box);
    fireEvent.click(box);
    expect(
      screen.getByRole("button", { name: "Send me a link" }),
    ).toBeDisabled();
  });
});

describe("SignInPrompt with texting not available", () => {
  it("is exactly the email-only prompt, with no mention of texts or phones", () => {
    const { container } = render(
      <SignInPrompt client={{ signIn: jest.fn() } as never} />,
    );
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /mobile|phone|text message|SMS|STOP|HELP/i,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("does not offer a checkbox even if a phone number is typed", () => {
    render(<SignInPrompt client={{ signIn: jest.fn() } as never} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "(202) 555-0123" },
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
