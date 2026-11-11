import { render, screen } from "@testing-library/react";
import { Placeholder } from "../Placeholder";

describe("Placeholder", () => {
  it("shows one line, centered by the stage, and nothing else visible", () => {
    const { container } = render(<Placeholder />);
    const main = screen.getByRole("main");
    expect(main).toHaveClass("stage");
    expect(main).toHaveTextContent(/^Coming soon 👀$/);
    // No heading, navigation, footer, image or link.
    for (const role of ["heading", "navigation", "contentinfo", "img"]) {
      expect(screen.queryByRole(role)).toBeNull();
    }
    // The only links are the two small legal links, outside the centered line.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Privacy Policy",
      "Terms",
    ]);
    expect(main).not.toContainElement(
      screen.getByRole("link", { name: "Terms" }),
    );
    // The only text on the page is the line and the two small controls.
    expect(container.textContent).toBe(
      "Coming soon 👀Dark modeSign outPrivacy Policy · Terms",
    );
  });

  it("has the theme toggle and a Sign out button, both outside the centered line", () => {
    render(<Placeholder />);
    const main = screen.getByRole("main");
    for (const control of [
      screen.getByRole("switch", { name: "Dark mode" }),
      screen.getByRole("button", { name: "Sign out" }),
    ]) {
      expect(main).not.toContainElement(control);
    }
  });
});
