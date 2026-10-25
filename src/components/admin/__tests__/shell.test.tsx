import { render, screen, within } from "@testing-library/react";
import { AdminShell } from "../AdminShell";

const staff = { displayName: "Hannah", role: "couple" as const };
const signOutAction = jest.fn();

function renderShell(current: Parameters<typeof AdminShell>[0]["current"]) {
  return render(
    <AdminShell current={current} staff={staff} signOutAction={signOutAction}>
      <h1>Page body</h1>
    </AdminShell>,
  );
}

describe("AdminShell", () => {
  it("has a Main navigation with the grouped links", () => {
    renderShell("overview");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav)
      .getAllByRole("link")
      .map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Overview", "/admin"],
      ["Households", "/admin/households"],
      ["Import", "/admin/import"],
      ["Events", "/admin/events"],
      ["Menus", "/admin/menus"],
      ["Campaigns", "/admin/campaigns"],
      ["Reports", "/admin/reports"],
      ["History", "/admin/history"],
      ["Settings", "/admin/settings"],
    ]);
    for (const heading of [
      "Guests",
      "Events",
      "Communicate",
      "Insights",
      "Admin",
    ]) {
      expect(within(nav).getByText(heading, { selector: "p" })).toBeVisible();
    }
  });

  it("marks only the current page's link with aria-current", () => {
    renderShell("households");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Households");
  });

  it("shows the signed-in person's name and role", () => {
    renderShell("overview");
    expect(screen.getAllByText("Hannah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Couple").length).toBeGreaterThan(0);
  });

  it("shows the planner role in words", () => {
    render(
      <AdminShell
        current="overview"
        staff={{ displayName: "Sam", role: "planner" }}
        signOutAction={signOutAction}
      >
        x
      </AdminShell>,
    );
    expect(screen.getAllByText("Planner").length).toBeGreaterThan(0);
  });

  it("signs out with a button inside a form", () => {
    renderShell("overview");
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toHaveAttribute("type", "submit");
      expect(button.closest("form")).not.toBeNull();
    }
  });

  it("has a phone menu that is a details element with a Menu button summary", () => {
    renderShell("menus");
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.tagName).toBe("SUMMARY");
    const details = menu.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const drawer = within(details as HTMLElement).getByRole("navigation", {
      name: "Main menu",
    });
    expect(within(drawer).getByRole("link", { name: "Menus" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(drawer).getAllByRole("link")).toHaveLength(9);
  });

  it("puts the page content in main", () => {
    renderShell("overview");
    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: "Page body",
      }),
    ).toBeInTheDocument();
  });
});
