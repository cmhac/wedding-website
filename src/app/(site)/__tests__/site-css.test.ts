/** @jest-environment node */
import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(path.join(__dirname, "..", "site.css"), "utf8");

const requiredTokens = [
  "font",
  "bg",
  "text",
  "muted",
  "border",
  "focus",
  "accent",
  "accent-text",
  "ok-bg",
  "ok-text",
  "bad-bg",
  "bad-text",
];

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function tokens(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const light = tokens(block(":root {"));
const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
const darkByDevice = tokens(
  // The media-query copy only: up to the visitor-chose-dark block.
  css.slice(mediaStart, css.indexOf(':root[data-theme="dark"]')),
);
const darkByChoice = tokens(block(':root[data-theme="dark"]'));

describe("site stylesheet tokens", () => {
  it.each(requiredTokens)(
    "defines --%s for light, and dark both ways",
    (name) => {
      expect(light[name]).toBeDefined();
      if (name !== "font") {
        expect(darkByChoice[name]).toBeDefined();
        expect(darkByDevice[name]).toBeDefined();
      }
    },
  );

  it("gives the same dark colors when the device is dark and when the visitor chose dark", () => {
    for (const name of requiredTokens.filter((n) => n !== "font")) {
      expect(darkByDevice[name]).toBe(darkByChoice[name]);
    }
  });

  it("applies the device's dark colors only when the visitor has not chosen light", () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/,
    );
  });

  it("defines every custom property it uses", () => {
    const used = new Set(
      [...css.matchAll(/var\(\s*--([\w-]+)/g)].map((m) => m[1]),
    );
    expect([...used].filter((n) => !(n in light))).toEqual([]);
  });

  it("uses a plain sans-serif font and downloads nothing", () => {
    expect(light.font).toMatch(/sans-serif\s*$/);
    expect(css).not.toMatch(/@import|@font-face|url\(/);
    expect(css).not.toMatch(/@tailwind|@apply/);
  });

  it("changes colors only through the tokens, so both themes stay in step", () => {
    const outside = css
      .replace(/:root[^{]*\{[^}]*\}/g, "")
      .replace(/@media \(prefers-color-scheme: dark\)\s*\{\s*\}/g, "");
    expect(outside).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

describe("site stylesheet contrast", () => {
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
  const pairs: [string, string][] = [
    ["text", "bg"],
    ["muted", "bg"],
    ["accent-text", "accent"],
    ["ok-text", "ok-bg"],
    ["bad-text", "bad-bg"],
    ["focus", "bg"],
  ];

  describe.each([
    ["light", light],
    ["dark", darkByChoice],
  ])("%s theme", (_name, set) => {
    it.each(pairs)("%s on %s is at least 4.5:1", (fg, bg) => {
      expect(ratio(set[fg], set[bg])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe("site stylesheet layout", () => {
  it("centers the line in the window, vertically and horizontally", () => {
    const stage = block(".stage");
    expect(stage).toMatch(/min-height:\s*100dvh/);
    expect(stage).toMatch(/place-items:\s*center/);
  });
});
