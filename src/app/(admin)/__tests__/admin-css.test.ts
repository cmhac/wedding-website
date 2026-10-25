/** @jest-environment node */
import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(path.join(__dirname, "..", "admin.css"), "utf8");

const requiredTokens = [
  "font",
  "bg",
  "surface",
  "surface-2",
  "border",
  "border-soft",
  "text",
  "muted",
  "accent",
  "accent-text",
  "focus",
  "ok-bg",
  "ok-text",
  "ok-border",
  "warn-bg",
  "warn-text",
  "warn-border",
  "bad-bg",
  "bad-text",
  "bad-border",
  "bad-solid",
  "radius",
  "radius-sm",
  "gap",
  "side-w",
];

// Contents of the first :root block, where the tokens live.
const rootMatch = /:root\s*\{([^}]*)\}/.exec(css);
const rootBlock = rootMatch ? rootMatch[1] : "";
const defined = new Set(
  [...rootBlock.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]),
);

describe("admin stylesheet tokens", () => {
  it("has a :root block", () => {
    expect(rootMatch).not.toBeNull();
  });

  it.each(requiredTokens)("defines --%s in :root", (name) => {
    expect(defined.has(name)).toBe(true);
  });

  it("defines every custom property it uses", () => {
    const used = new Set(
      [...css.matchAll(/var\(\s*--([\w-]+)/g)].map((m) => m[1]),
    );
    const missing = [...used].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });
});
