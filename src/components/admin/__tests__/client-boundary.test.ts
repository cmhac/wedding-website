import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// React refuses a function passed as a child from a Server Component to a
// client component. Jest renders everything on the client, so it cannot see
// this failure; the page only crashes in the browser. A file that hands
// ActionForm or ResultForm a render function must itself be a client component.
const dir = path.join(__dirname, "..");
const FUNCTION_CHILD = /<(ActionForm|ResultForm)\b[^>]*>\s*\{\(/;

const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

describe("render-function children stay inside client components", () => {
  it.each(files)("%s", (file) => {
    const source = readFileSync(path.join(dir, file), "utf8");
    if (!FUNCTION_CHILD.test(source)) return;
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });
});
