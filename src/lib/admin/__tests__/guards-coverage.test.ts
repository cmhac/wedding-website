/**
 * Guard coverage: every admin server action goes through `runAdminAction`
 * (which checks the session and role), and every admin page checks the
 * session close to its data. Reads the source files, so a new action or page
 * that skips the check fails here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../../..");
const ACTIONS_DIR = path.join(ROOT, "src/lib/admin/actions");
const ADMIN_APP_DIR = path.join(ROOT, "src/app/(admin)");

/**
 * Exported actions that legitimately do not call `runAdminAction` directly.
 * Each entry says why it is still safe; the test below checks the reason holds.
 */
const ALLOWED: Record<string, { reason: string; mustCall: RegExp }> = {
  "session.ts:signOut": {
    reason:
      "Ends the session; it must work signed in or not, so there is no staff check. It only calls auth.signOut for the caller's own cookie session.",
    mustCall: /supabase\.auth\.signOut\(/,
  },
  "events.ts:confirmDeleteEvent": {
    reason: "Redirect wrapper: delegates to deleteEvent, which is guarded.",
    mustCall: /\bdeleteEvent\(/,
  },
  "guests.ts:confirmRemoveGuest": {
    reason: "Redirect wrapper: delegates to removeGuest, which is guarded.",
    mustCall: /\bremoveGuest\(/,
  },
};

function exportedFunctions(file: string) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: { name: string; body: string }[] = [];
  const isExported = (node: ts.Node) =>
    ts
      .getModifiers(node as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      found.push({ name: node.name.text, body: node.getText(source) });
    }
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const d of node.declarationList.declarations) {
        const init = d.initializer;
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          found.push({ name: d.name.getText(source), body: init.getText() });
        }
      }
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      found.push({ name: `re-export:${node.getText(source)}`, body: "" });
    }
  });
  return { text, functions: found };
}

const actionFiles = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith(".ts"))
  // shared.ts defines runAdminAction itself and is not a "use server" file.
  .filter((f) => f !== "shared.ts");

describe("admin actions", () => {
  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  it.each(actionFiles)("%s: every exported action is guarded", (file) => {
    const { text, functions } = exportedFunctions(path.join(ACTIONS_DIR, file));
    expect(text).toMatch(/^"use server";/m);
    const unguarded: string[] = [];
    for (const fn of functions) {
      if (fn.name.startsWith("re-export:")) {
        unguarded.push(fn.name);
        continue;
      }
      if (/\brunAdminAction\(/.test(fn.body)) continue;
      const allowed = ALLOWED[`${file}:${fn.name}`];
      if (allowed && allowed.mustCall.test(fn.body)) continue;
      unguarded.push(fn.name);
    }
    expect(unguarded).toEqual([]);
  });

  it("every allowlisted action still exists", () => {
    for (const key of Object.keys(ALLOWED)) {
      const [file, name] = key.split(":");
      const { functions } = exportedFunctions(path.join(ACTIONS_DIR, file));
      expect(functions.map((f) => f.name)).toContain(name);
    }
  });

  it("runAdminAction checks the session before running the handler", () => {
    const text = readFileSync(path.join(ACTIONS_DIR, "shared.ts"), "utf8");
    const check = text.indexOf("getSession(");
    const handler = text.indexOf("await handler(");
    expect(check).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(check);
    expect(text).toMatch(/session\.kind !== "staff"/);
  });
});

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === "__tests__") return [];
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

/** Public pages: no staff data is read, so no staff guard is needed. */
const PUBLIC_PAGES = new Set(["admin/sign-in/page.tsx", "auth/error/page.tsx"]);

describe("admin pages", () => {
  const pages = pageFiles(ADMIN_APP_DIR).map((f) => ({
    file: f,
    rel: path.relative(ADMIN_APP_DIR, f).split(path.sep).join("/"),
  }));

  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((p) => [p.rel, p.file]))(
    "%s checks the session or is public",
    (rel, file) => {
      if (PUBLIC_PAGES.has(rel)) return;
      const text = readFileSync(file, "utf8");
      expect(text).toMatch(/\brequire(Staff|Couple)Page\(/);
    },
  );

  it("the public pages read no staff data", () => {
    for (const rel of PUBLIC_PAGES) {
      const text = readFileSync(path.join(ADMIN_APP_DIR, rel), "utf8");
      expect(text).not.toMatch(/lib\/admin\/data/);
    }
  });

  it("the console layout guards everything under it", () => {
    const text = readFileSync(
      path.join(ADMIN_APP_DIR, "admin/(console)/layout.tsx"),
      "utf8",
    );
    expect(text).toMatch(/\brequireStaffPage\(/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === "__tests__") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("logging in the admin console", () => {
  const files = [
    ...sourceFiles(path.join(ROOT, "src/lib/admin")),
    ...sourceFiles(ADMIN_APP_DIR),
    ...sourceFiles(path.join(ROOT, "src/components/admin")),
  ];

  it("never calls console", () => {
    const offenders = files.filter((f) =>
      /\bconsole\.(log|info|warn|error|debug|trace)\(/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("log calls pass only a code", () => {
    const calls: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(
        /\blog\.(?:info|warn|error|debug)\(([^;]*?)\);/g,
      )) {
        calls.push(m[1]);
      }
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      expect(args).toMatch(
        /^\s*"[a-z_]+",\s*\{\s*code:\s*[\w"]+\s*\}\s*,?\s*$/,
      );
    }
  });
});
