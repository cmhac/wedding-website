/** @jest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function allowList(): string[] {
  const toml = readFileSync(join(root, "supabase/config.toml"), "utf8");
  const match = /^additional_redirect_urls\s*=\s*\[(.*)\]/m.exec(toml);
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

function siteUrlFromExample(): string {
  const env = readFileSync(join(root, ".env.example"), "utf8");
  return /^NEXT_PUBLIC_SITE_URL=(.+)$/m.exec(env)![1].trim();
}

describe("local sign-in redirect allow-list", () => {
  it("permits the callback on the site URL that .env.example suggests", () => {
    const callback = `${siteUrlFromExample()}/auth/callback`;
    expect(allowList()).toContain(callback);
  });

  it("permits the callback on both local host names", () => {
    const list = allowList();
    expect(list).toContain("http://localhost:3000/auth/callback");
    expect(list).toContain("http://127.0.0.1:3000/auth/callback");
  });
});
