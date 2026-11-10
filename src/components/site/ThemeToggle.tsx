"use client";

import { useSyncExternalStore } from "react";
import {
  browserStorage,
  parseTheme,
  readSavedTheme,
  saveTheme,
  type Theme,
} from "@/lib/site/theme";

/** The theme showing now: what the page has applied, else the device's setting. */
function currentTheme(): Theme {
  const applied = parseTheme(document.documentElement.dataset.theme);
  if (applied) return applied;
  const saved = readSavedTheme(browserStorage());
  if (saved) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const THEME_EVENT = "site-theme-change";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  query?.addEventListener?.("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    query?.removeEventListener?.("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/**
 * Light/dark switch. The page starts in the device's theme (or the saved
 * choice, applied before first paint by the layout's inline script). Pressing
 * it applies the other theme at once and remembers the choice on this device.
 * On the server, and while the browser hydrates, it renders in its off state so
 * server and browser markup match.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    currentTheme,
    () => null,
  );

  function onClick() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    saveTheme(browserStorage(), next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      className="toggle"
      onClick={onClick}
    >
      <span className="toggle-track" aria-hidden="true" />
      Dark mode
    </button>
  );
}
