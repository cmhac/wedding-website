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

describe("admin stylesheet contrast", () => {
  const token = (name: string) =>
    new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(rootBlock)?.[1] ??
    "";
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  // Text colour on the background it is drawn on (text is at least 4.5:1).
  const pairs: [string, string][] = [
    ["text", "bg"],
    ["text", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["muted", "surface-2"],
    ["accent-text", "accent"],
    ["ok-text", "ok-bg"],
    ["warn-text", "warn-bg"],
    ["bad-text", "bad-bg"],
    ["accent-text", "bad-solid"],
    ["focus", "surface"],
    ["focus", "bg"],
  ];

  it.each(pairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
