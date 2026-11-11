import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata as privacyMetadata } from "../privacy/page";
import TermsPage, { metadata as termsMetadata } from "../terms/page";

// Neither route reads a session or any data: they are fixed text for everyone,
// so they render here with nothing mocked, and are not forced to render per
// request.

describe("privacy route", () => {
  it("renders the privacy policy with no session", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
  });

  it("has a page title", () => {
    expect(privacyMetadata.title).toBe("Privacy Policy");
  });

  it("is not forced dynamic", async () => {
    const mod = await import("../privacy/page");
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined();
  });
});

describe("terms route", () => {
  it("renders the terms with no session", () => {
    render(<TermsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms & Conditions" }),
    ).toBeInTheDocument();
  });

  it("has a page title", () => {
    expect(termsMetadata.title).toBe("Terms & Conditions");
  });

  it("is not forced dynamic", async () => {
    const mod = await import("../terms/page");
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined();
  });
});
