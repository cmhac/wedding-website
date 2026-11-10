import { render, screen } from "@testing-library/react";
import { Placeholder } from "../Placeholder";

describe("Placeholder", () => {
  it("shows one line, centered by the stage, and nothing else visible", () => {
    const { container } = render(<Placeholder />);
    const main = screen.getByRole("main");
    expect(main).toHaveClass("stage");
    expect(main).toHaveTextContent(/^Coming soon 👀$/);
    // No heading, navigation, footer, image or link.
    for (const role of [
      "heading",
      "navigation",
      "contentinfo",
      "img",
      "link",
    ]) {
      expect(screen.queryByRole(role)).toBeNull();
    }
    // The only text on the page is the line and the two small controls.
    expect(container.textContent).toBe("Coming soon 👀Dark modeSign out");
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
