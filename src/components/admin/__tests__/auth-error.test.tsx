import { render, screen } from "@testing-library/react";
import { AuthError } from "../AuthError";

describe("AuthError", () => {
  it("explains the link did not work and links back to the home page sign-in", () => {
    render(<AuthError />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText(
        "That sign-in link did not work or has already been used.",
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Back to sign in" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("shows no data", () => {
    render(<AuthError />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
