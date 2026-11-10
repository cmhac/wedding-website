import { render } from "@testing-library/react";
import { Home } from "../Home";

// A visitor who is not signed in sees only fixed copy: no address, name, role
// or other data about households, guests or staff.
describe("Home for a visitor who is not signed in", () => {
  it("contains only the fixed sign-in copy", () => {
    const { container } = render(<Home signedIn={false} />);
    expect(container.textContent).toBe(
      "Sign in to see what's comingEnter the email address we invited, and we'll send you a link.Email addressEmail me a link",
    );
    expect(container.querySelector("input")?.getAttribute("value")).toBe("");
  });
});
