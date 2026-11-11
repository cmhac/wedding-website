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

describe("ImportHelp phone columns", () => {
  it("documents phone columns only while texting is configured", () => {
    render(<ImportHelp smsConfigured />);
    expect(screen.getByText("contact_phone")).toBeInTheDocument();
    expect(screen.getByText(/United States numbers only/)).toBeInTheDocument();
    expect(screen.getByText(/opts in themselves/)).toBeInTheDocument();
  });

  it("says nothing about phones while texting is not configured", () => {
    const { container } = render(<ImportHelp />);
    expect(container.textContent).not.toMatch(/phone|texting|opt in|opted/i);
  });
});
