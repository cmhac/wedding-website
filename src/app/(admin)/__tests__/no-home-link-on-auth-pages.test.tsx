import { render, screen } from "@testing-library/react";
import { AuthError } from "@/components/admin/AuthError";

// The home page link belongs to the console shell. The sign-in and failure
// pages do not use the shell, so they must not show it.
describe("pages outside the console shell", () => {
  it("the failure page has no 'View home page' link", () => {
    render(<AuthError />);
    expect(screen.queryByRole("link", { name: "View home page" })).toBeNull();
  });
});
