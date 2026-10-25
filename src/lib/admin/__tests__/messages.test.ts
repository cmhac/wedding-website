/** @jest-environment node */
import { readFileSync } from "node:fs";
import path from "node:path";
import { messageFor, messageFromDbError } from "../messages";

const DOCUMENTED = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "email_in_use",
  "staff_account",
  "last_couple",
  "campaign_not_sendable",
  "template_missing",
  "invalid_audience",
  "invalid_request",
  "invalid_payload",
  "invalid_file",
  "rate_limited",
  "server_error",
];
const CONSOLE = ["network", "bad_response", "unknown"];
const DATABASE = [
  "allowance_below_named_plus_ones",
  "duplicate_guest_name",
  "invalid_meal",
  "campaign_locked",
  "invalid_status_transition",
];
const ALL = [...DOCUMENTED, ...CONSOLE, ...DATABASE];

function codesInErrorTable(): string[] {
  const doc = readFileSync(
    path.join(process.cwd(), "docs/admin-api.md"),
    "utf8",
  );
  const section = doc.split("## Error codes")[1]?.split(/\n## /)[0] ?? "";
  const codes: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cell = line.split("|")[2] ?? "";
    for (const m of cell.matchAll(/`([a-z_]+)`/g)) {
      if (m[1] !== "code") codes.push(m[1]);
    }
  }
  return codes;
}

describe("messageFor", () => {
  it.each(ALL)("has a message for %s", (code) => {
    const message = messageFor(code);
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toBe(code);
  });

  it("has a message for every code in the docs/admin-api.md error table", () => {
    const codes = codesInErrorTable();
    expect(codes.length).toBeGreaterThanOrEqual(DOCUMENTED.length);
    for (const code of codes) {
      expect(messageFor(code)).not.toBe(messageFor("unknown"));
    }
  });

  it("falls back to the unknown message for an unrecognised code", () => {
    expect(messageFor("something_new")).toBe(messageFor("unknown"));
  });

  it.each(ALL)("keeps %s free of technical text", (code) => {
    const message = messageFor(code);
    expect(message).not.toMatch(
      /\bat \S+:\d+|stack|trace|public\.|relation|violates|constraint|select |insert |syntax|SQLSTATE|_/i,
    );
  });
});

describe("messageFromDbError", () => {
  it.each([
    [
      "cannot lower the plus-one allowance below the number of named plus-ones",
      "allowance_below_named_plus_ones",
    ],
    ["plus-one allowance exceeded", "allowance_below_named_plus_ones"],
    ["duplicate_name", "duplicate_guest_name"],
    ["invalid_meal", "invalid_meal"],
    ["campaign_locked", "campaign_locked"],
    ["invalid_status_transition", "invalid_status_transition"],
    ["cannot remove or demote the last couple account", "last_couple"],
    ["email_in_use", "email_in_use"],
    ["staff_account", "staff_account"],
    ["forbidden", "forbidden"],
    ["not_found", "not_found"],
    ["invalid_payload", "invalid_payload"],
  ])("maps %j to the %s message", (text, code) => {
    expect(messageFromDbError({ message: text })).toBe(messageFor(code));
  });

  it("maps an archived dish refusal to the invalid meal message", () => {
    expect(messageFromDbError({ message: "dish is archived" })).toBe(
      messageFor("invalid_meal"),
    );
  });

  it("falls back to server_error and never leaks raw text", () => {
    const raw = 'relation "public.guests" does not exist';
    const result = messageFromDbError({ message: raw, code: "42P01" });
    expect(result).toBe(messageFor("server_error"));
    expect(result).not.toContain("guests");
  });

  it("falls back to server_error for null, undefined or empty errors", () => {
    expect(messageFromDbError(null)).toBe(messageFor("server_error"));
    expect(messageFromDbError(undefined)).toBe(messageFor("server_error"));
    expect(messageFromDbError({})).toBe(messageFor("server_error"));
  });
});
