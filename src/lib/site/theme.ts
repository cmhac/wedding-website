/**
 * The visitor's light/dark choice. It lives only in their browser
 * (`localStorage`), never on the server. With no saved choice the page follows
 * the device's setting. Every storage call is wrapped, because storage can be
 * missing or blocked (private windows, blocked site data) and the page must
 * still work.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function parseTheme(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The browser's storage, or null where even asking for it is refused. */
export function browserStorage(
  win: { localStorage?: ThemeStorage } | null = typeof window === "undefined"
    ? null
    : window,
): ThemeStorage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readSavedTheme(storage: ThemeStorage | null): Theme | null {
  try {
    return parseTheme(storage?.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

export function saveTheme(storage: ThemeStorage | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this visit.
  }
}

/**
 * Runs in the page head before first paint, so a saved choice shows with no
 * flash of the other theme. Same rules as `readSavedTheme`, written as a string
 * because it runs before any of the app's code is loaded.
 */
export const THEME_INIT_SCRIPT = `try{var t=window.localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;
