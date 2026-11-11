import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsentStep } from "../ConsentStep";
import { Home } from "../Home";

const pending = [
  { id: "p1", masked: "(•••) •••-0123" },
  { id: "p2", masked: "(•••) •••-0124" },
];

function setup(answer: jest.Mock) {
  render(
    <ConsentStep
      pending={pending}
      client={{ answerSmsConsent: answer } as never}
    />,
  );
  return jest.fn();
}

describe("ConsentStep", () => {
  it("asks about each number with an unticked box and the full statement", () => {
    setup(jest.fn());
    expect(
      screen.getByRole("heading", { name: "Would you like text updates?" }),
    ).toBeInTheDocument();
    for (const n of ["(•••) •••-0123", "(•••) •••-0124"]) {
      expect(
        screen.getByRole("checkbox", { name: `Text me at ${n}` }),
      ).not.toBeChecked();
    }
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).toContain("optional");
    expect(text).toContain("Tick only numbers that are yours");
    expect(text).toContain("about a dozen messages over six months");
    expect(text).toContain("Msg & data rates may apply");
    expect(text).toContain("Reply HELP for help, STOP to opt out");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("sends ticked boxes as opt-in and unticked as declined, then shows the saved state", async () => {
    const answer = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: { saved: 2 } });
    const reload = setup(answer);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Text me at (•••) •••-0123" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save my choice" }));
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith({
        answers: [
          { id: "p1", opt_in: true },
          { id: "p2", opt_in: false },
        ],
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Thanks, your choice is saved",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the ticks when saving fails", async () => {
    const answer = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: "texting_unavailable", message: "x" },
    });
    setup(answer);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Text me at (•••) •••-0123" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save my choice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save your choice. Try again.",
    );
    expect(
      screen.getByRole("checkbox", { name: "Text me at (•••) •••-0123" }),
    ).toBeChecked();
  });

  it("shows an error when the request itself fails", async () => {
    setup(jest.fn().mockRejectedValue(new Error("down")));
    fireEvent.click(screen.getByRole("button", { name: "Save my choice" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("Home and the consent step", () => {
  it("shows the consent step instead of the placeholder to a signed-in guest with numbers to answer for", () => {
    render(<Home signedIn consent={pending} />);
    expect(
      screen.getByRole("heading", { name: "Would you like text updates?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Coming soon 👀")).toBeNull();
  });

  it.each([[undefined], [[]]])(
    "shows the placeholder when there is nothing to ask (%p)",
    (consent) => {
      render(<Home signedIn consent={consent} />);
      expect(screen.getByText("Coming soon 👀")).toBeInTheDocument();
    },
  );

  it("never shows the consent step to a visitor who is not signed in", () => {
    render(<Home signedIn={false} consent={pending} />);
    expect(
      screen.queryByRole("heading", { name: "Would you like text updates?" }),
    ).toBeNull();
  });
});
