import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Helpers for the contract tests that keep the endpoint tables in the
 * documents honest: read the "Method and path" tables out of a Markdown file
 * and list the route handlers that really exist on disk.
 */

const ROOT = process.cwd();
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Endpoint labels like "POST /api/guest/sign-in" from the first column of any table. */
export function endpointsInMarkdown(file: string): string[] {
  const text = readFileSync(join(ROOT, file), "utf8");
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\|\s*`((?:GET|POST|PUT|PATCH|DELETE) \/[^`]*)`/);
    if (match) found.push(match[1]);
  }
  return found.sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : walk(full);
    }
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** Endpoint labels for every route handler under a directory of `src/app`. */
export function endpointsOnDisk(appDir: string): string[] {
  const base = join(ROOT, "src/app");
  const found: string[] = [];
  for (const file of walk(join(ROOT, "src", appDir))) {
    const source = readFileSync(file, "utf8");
    const path = "/" + relative(base, file).split(sep).slice(0, -1).join("/");
    for (const method of METHODS) {
      const exported = new RegExp(
        `export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`,
      );
      if (exported.test(source)) found.push(`${method} ${path}`);
    }
  }
  return found.sort();
}
