import { render, screen } from "@testing-library/react";
import { ImportHelp } from "../ImportHelp";

describe("ImportHelp", () => {
  it("documents the extra address columns", () => {
    render(<ImportHelp />);
    expect(screen.getByText("contact_email")).toBeInTheDocument();
    expect(screen.getByText("contact_email_2")).toBeInTheDocument();
    expect(screen.getByText("contact_email_3")).toBeInTheDocument();
    expect(
      screen.getByText(/can belong to only one household/),
    ).toBeInTheDocument();
  });

  it("says what an empty address means", () => {
    render(<ImportHelp />);
    expect(screen.getByText(/paper invitation/)).toBeInTheDocument();
  });
});
