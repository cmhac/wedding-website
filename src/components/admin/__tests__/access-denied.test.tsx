import { render, screen } from "@testing-library/react";
import { AccessDenied } from "../AccessDenied";

describe("AccessDenied", () => {
  it("shows the heading and a link to sign in", () => {
    render(<AccessDenied />);
    expect(
      screen.getByRole("heading", { name: "You do not have access to this" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/sign-in");
  });

  it("shows no data tables or lists", () => {
    render(<AccessDenied />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
