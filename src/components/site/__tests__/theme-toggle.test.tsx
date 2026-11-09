import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";
import { THEME_KEY } from "@/lib/site/theme";

function deviceIsDark(dark: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && dark,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as never;
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
  deviceIsDark(false);
});

afterEach(() => jest.restoreAllMocks());

const toggle = () => screen.getByRole("switch", { name: "Dark mode" });

describe("ThemeToggle", () => {
  it("starts off when the device is light, and on when the device is dark", () => {
    const { unmount } = render(<ThemeToggle />);
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    unmount();
    deviceIsDark(true);
    render(<ThemeToggle />);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("follows a theme already applied to the page, over the device setting", () => {
    deviceIsDark(true);
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("switches the page theme at once, shows the new state and remembers the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(toggle());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    fireEvent.click(toggle());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("still switches for the visit when storage is blocked", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<ThemeToggle />);
    expect(() => fireEvent.click(toggle())).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("works when reading storage itself throws", () => {
    jest.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<ThemeToggle />);
    expect(() => fireEvent.click(toggle())).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is a button that the keyboard can reach and operate", () => {
    render(<ThemeToggle />);
    const el = toggle();
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("type", "button");
    act(() => el.focus());
    expect(el).toHaveFocus();
    // A native button turns Enter and Space into a click.
    fireEvent.click(el);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });
});
