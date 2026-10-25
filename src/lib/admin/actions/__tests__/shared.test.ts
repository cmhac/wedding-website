/** @jest-environment node */
import { z } from "zod";
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { messageFor, messageFromDbError } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });

const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const logError = jest.fn();
jest.mock("@/lib/log", () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (event: string, fields?: unknown) => logError(event, fields),
  },
}));

import { formDataToObject, runAdminAction } from "../shared";

const user = { id: "user-1" };
const schema = z.object({
  name: z.string().min(1),
  allowance: z.coerce.number().int().min(0),
});

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const valid = () =>
  form([
    ["name", "Ada Example"],
    ["allowance", "2"],
  ]);

beforeEach(() => {
  revalidatePath.mockClear();
  logError.mockClear();
});

describe("formDataToObject", () => {
  it("returns strings, collects repeated keys into arrays, skips files and Next internals", () => {
    const fd = form([
      ["a", "1"],
      ["tag", "x"],
      ["tag", "y"],
      ["$ACTION_ID_abc", "z"],
      ["empty", ""],
    ]);
    fd.append("file", new Blob(["hi"]), "f.txt");
    expect(formDataToObject(fd)).toEqual({
      a: "1",
      tag: ["x", "y"],
      empty: "",
    });
  });
});

describe("runAdminAction guards", () => {
  it("returns the session-ended message and skips the handler with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    const handler = jest.fn();
    const result = await runAdminAction(schema, valid(), handler, {
      supabase: client as never,
    });
    expect(result).toEqual({
      ok: false,
      message: messageFor("unauthenticated"),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns the forbidden message for a guest", async () => {
    const { client } = fakeSupabase({ user, household: true });
    const handler = jest.fn();
    const result = await runAdminAction(schema, valid(), handler, {
      supabase: client as never,
    });
    expect(result).toEqual({ ok: false, message: messageFor("forbidden") });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a planner on a couple-only action", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    const handler = jest.fn();
    const result = await runAdminAction(schema, valid(), handler, {
      supabase: client as never,
      coupleOnly: true,
    });
    expect(result).toEqual({ ok: false, message: messageFor("forbidden") });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("runAdminAction validation", () => {
  it("returns plain field errors and the typed values, without calling the handler", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const handler = jest.fn();
    const result = await runAdminAction(
      schema,
      form([
        ["name", ""],
        ["allowance", "-1"],
      ]),
      handler,
      { supabase: client as never },
    );
    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(messageFor("invalid_request"));
    expect(result.values).toEqual({ name: "", allowance: "-1" });
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      "allowance",
      "name",
    ]);
    for (const text of Object.values(result.fieldErrors ?? {})) {
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/expected|invalid input|>=|too small/i);
    }
  });

  it("uses a message the schema supplies itself", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const custom = z.object({ name: z.string().min(1, "Enter a name.") });
    const result = await runAdminAction(
      custom,
      form([["name", ""]]),
      jest.fn(),
      {
        supabase: client as never,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { name: "Enter a name." },
    });
  });
});

describe("runAdminAction handler", () => {
  it("passes parsed input, client, user and role to the handler", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    const handler = jest.fn(async () => ({}));
    await runAdminAction(schema, valid(), handler, {
      supabase: client as never,
    });
    expect(handler).toHaveBeenCalledWith({
      input: { name: "Ada Example", allowance: 2 },
      supabase: client,
      user,
      role: "planner",
    });
  });

  it("maps a database error through messageFromDbError and does not revalidate", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const error = { message: "duplicate_name: already there" };
    const result = await runAdminAction(
      schema,
      valid(),
      async () => ({ error, revalidate: ["/admin/guests"] }),
      { supabase: client as never },
    );
    expect(result).toEqual({
      ok: false,
      message: messageFromDbError(error),
      values: { name: "Ada Example", allowance: "2" },
    });
    expect(result).toMatchObject({
      message: messageFor("duplicate_guest_name"),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates each named path and returns ok with any data", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const result = await runAdminAction(
      schema,
      valid(),
      async () => ({
        revalidate: ["/admin/guests", "/admin/guests/1"],
        data: 7,
      }),
      { supabase: client as never },
    );
    expect(result).toEqual({ ok: true, data: 7 });
    expect(revalidatePath.mock.calls).toEqual([
      ["/admin/guests"],
      ["/admin/guests/1"],
    ]);
  });

  it("returns plain { ok: true } when the handler returns nothing", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const result = await runAdminAction(schema, valid(), async () => {}, {
      supabase: client as never,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns server_error and logs only a code when the handler throws", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const result = await runAdminAction(
      schema,
      valid(),
      async () => {
        throw new Error("boom ada@example.test");
      },
      { supabase: client as never },
    );
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("server_error"),
    });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(/boom|example/);
    expect(logError.mock.calls[0][1]).toEqual({ code: "server_error" });
  });

  it("rethrows Next control-flow errors such as redirect", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/admin;307;",
    });
    await expect(
      runAdminAction(
        schema,
        valid(),
        async () => {
          throw redirectError;
        },
        { supabase: client as never },
      ),
    ).rejects.toBe(redirectError);
    expect(logError).not.toHaveBeenCalled();
  });
});
