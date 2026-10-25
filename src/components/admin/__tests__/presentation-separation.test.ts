/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const adminComponents = path.join(root, "src/components/admin");
const adminApp = path.join(root, "src/app/(admin)");
const allComponents = path.join(root, "src/components");

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

// Test files may quote the forbidden patterns, so they are not scanned.
const isTest = (f: string) =>
  f.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.[jt]sx?$/.test(f);

const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => path.relative(root, f);

describe("presentation stays in admin.css", () => {
  const scanned = [...files(adminComponents), ...files(adminApp)].filter(
    (f) => !isTest(f),
  );

  it("scans at least one file", () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it("has no Tailwind-style utility class lists", () => {
    const utility =
      /className=(?:"|'|\{\s*[`"'])[^"'`]*\b(?:flex|grid|block|hidden|p[xytblr]?-\d|m[xytblr]?-\d|text-(?:xs|sm|base|lg|xl|\d?xl|center|left|right|gray|white|black)|bg-[a-z]+|border-\d|rounded(?:-[a-z]+)?|gap-\d|w-\d|h-\d|items-[a-z]+|justify-[a-z]+|font-(?:bold|semibold|medium)|space-[xy]-\d)\b/;
    const offenders = scanned.filter((f) => utility.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("has no inline style setting presentation properties", () => {
    const inline =
      /style=\{\{[^}]*\b(?:color|background(?:Color)?|font\w*|margin\w*|padding\w*|border\w*)\s*:/;
    const offenders = scanned.filter((f) => inline.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("no service-role access from components or admin pages", () => {
  const scanned = [...files(allComponents), ...files(adminApp)].filter(
    (f) => !isTest(f),
  );

  it("never imports the Supabase admin client or names the service key", () => {
    const offenders = scanned
      .filter((f) => {
        const text = read(f);
        return (
          /@\/lib\/supabase\/admin/.test(text) ||
          text.includes("SUPABASE_SERVICE_ROLE_KEY")
        );
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
