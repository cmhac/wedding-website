import { render, screen } from "@testing-library/react";
import { Home } from "../Home";

describe("Home", () => {
  it("shows the placeholder to a signed-in visitor, not the prompt", () => {
    render(<Home signedIn />);
    expect(screen.getByText("Coming soon 👀")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("shows the sign-in prompt, not the placeholder, to a visitor who is not signed in", () => {
    render(<Home signedIn={false} />);
    expect(screen.queryByText("Coming soon 👀")).toBeNull();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a link" }),
    ).toBeInTheDocument();
  });
});
