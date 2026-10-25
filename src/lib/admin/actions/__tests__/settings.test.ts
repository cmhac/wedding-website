/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });
const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { saveSettings } from "../settings";

function setup(role: "couple" | "planner" = "couple") {
  const auth = fakeSupabase({ user: { id: "user-1" }, staffRole: role });
  const db = createAdminFakeDb({
    settings: [{ id: true, default_rsvp_deadline: null, rsvp_open: true }],
  });
  const client = {
    auth: auth.client.auth,
    from: (table: string) =>
      table === "staff" ? auth.client.from(table) : db.from(table),
  };
  return { db, client };
}

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const run = (
  client: unknown,
  entries: Array<[string, string]>,
): ReturnType<typeof saveSettings> =>
  saveSettings(null, form(entries), { supabase: client as never });

beforeEach(() => revalidatePath.mockClear());

describe("saveSettings", () => {
  it("converts a Pacific date-time and updates the single settings row", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["default_rsvp_deadline", "2027-05-01T23:59"],
      ["rsvp_open", "on"],
    ]);
    expect(result).toEqual({
      ok: true,
      data: { message: "Saved. Default deadline is May 1, 11:59 PM PT." },
    });
    expect(db.tables.settings).toEqual([
      {
        id: true,
        default_rsvp_deadline: "2027-05-02T06:59:00.000Z",
        rsvp_open: true,
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("clears the deadline when empty and closes RSVPs when the box is unticked", async () => {
    const { db, client } = setup();
    db.tables.settings[0].default_rsvp_deadline = "2027-05-02T06:59:00.000Z";
    const result = await run(client, [["default_rsvp_deadline", ""]]);
    expect(result.ok).toBe(true);
    expect(db.tables.settings[0]).toMatchObject({
      default_rsvp_deadline: null,
      rsvp_open: false,
    });
    if (result.ok) {
      expect(result.data?.message).toBe("Saved. There is no default deadline.");
    }
  });

  it("keeps what was typed and writes nothing for an invalid date", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["default_rsvp_deadline", "next spring"],
      ["rsvp_open", "on"],
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.default_rsvp_deadline).toBe(
      "Enter a date and time.",
    );
    expect(result.values).toEqual({
      default_rsvp_deadline: "next spring",
      rsvp_open: "on",
    });
    expect(db.tables.settings[0].default_rsvp_deadline).toBeNull();
  });

  it("refuses a time skipped by the clock change", async () => {
    const { client } = setup();
    const result = await run(client, [
      ["default_rsvp_deadline", "2027-03-14T02:30"],
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.default_rsvp_deadline).toMatch(
        /clocks change/,
      );
    }
  });

  it("reports a database refusal in plain English", async () => {
    const { db, client } = setup();
    db.failNext("settings", { message: "permission denied" });
    const result = await run(client, [["default_rsvp_deadline", ""]]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("server_error"),
    });
  });
});
