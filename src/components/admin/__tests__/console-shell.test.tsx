import { render, screen } from "@testing-library/react";
import { ConsoleShell, navKeyFor } from "../ConsoleShell";

let pathname = "/admin";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("navKeyFor", () => {
  it.each([
    ["/admin", "overview"],
    ["/admin/", "overview"],
    ["/admin/households", "households"],
    ["/admin/households/abc", "households"],
    ["/admin/households/new", "households"],
    ["/admin/import", "import"],
    ["/admin/events", "events"],
    ["/admin/menus", "menus"],
    ["/admin/campaigns", "campaigns"],
    ["/admin/reports", "reports"],
    ["/admin/history", "history"],
    ["/admin/settings", "settings"],
    ["/admin/unknown", "overview"],
    [null, "overview"],
  ] as const)("maps %s to %s", (path, key) => {
    expect(navKeyFor(path)).toBe(key);
  });
});

describe("ConsoleShell", () => {
  it("marks the link for the current path and renders the page", () => {
    pathname = "/admin/households/abc";
    render(
      <ConsoleShell
        staff={{ displayName: "Hannah", role: "couple" }}
        signOutAction={jest.fn()}
      >
        <h1>Body</h1>
      </ConsoleShell>,
    );
    expect(
      screen.getAllByRole("link", { name: "Households" })[0],
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Body" })).toBeInTheDocument();
  });
});
