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

import { saveSaveTheDate, saveSettings, saveSmsSwitch } from "../settings";

const mockConfigured = jest.fn();
jest.mock("@/lib/sms/state", () => ({
  isSmsConfigured: () => mockConfigured(),
}));

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

  it("saves the wedding event and the sign-in limits when the form includes them", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["default_rsvp_deadline", ""],
      ["rsvp_open", "on"],
      ["wedding_event_id", "5f1c2b8e-1111-4222-8333-944455556666"],
      ["sign_in_limit_per_address", "5"],
      ["sign_in_window_minutes", "15"],
      ["sign_in_limit_global_per_hour", "100"],
    ]);
    expect(result.ok).toBe(true);
    expect(db.tables.settings[0]).toMatchObject({
      wedding_event_id: "5f1c2b8e-1111-4222-8333-944455556666",
      sign_in_limit_per_address: 5,
      sign_in_window_minutes: 15,
      sign_in_limit_global_per_hour: 100,
    });
  });

  it("clears the wedding event when 'not chosen' is selected", async () => {
    const { db, client } = setup();
    db.tables.settings[0].wedding_event_id =
      "5f1c2b8e-1111-4222-8333-944455556666";
    await run(client, [
      ["default_rsvp_deadline", ""],
      ["wedding_event_id", ""],
    ]);
    expect(db.tables.settings[0].wedding_event_id).toBeNull();
  });

  it.each([
    ["sign_in_limit_per_address", "0"],
    ["sign_in_limit_per_address", "abc"],
    ["sign_in_window_minutes", "-1"],
    ["sign_in_limit_global_per_hour", "1.5"],
    ["wedding_event_id", "not-a-uuid"],
  ])(
    "refuses %s = %s, naming the field and writing nothing",
    async (field, value) => {
      const { db, client } = setup();
      const result = await run(client, [
        ["default_rsvp_deadline", ""],
        [field, value],
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors?.[field]).toBeDefined();
      expect(db.tables.settings[0]).not.toHaveProperty(field);
    },
  );

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

describe("saveSmsSwitch", () => {
  const runSwitch = (client: unknown, entries: Array<[string, string]>) =>
    saveSmsSwitch(null, form(entries), { supabase: client as never });

  beforeEach(() => mockConfigured.mockReturnValue(true));

  it("turns texting on for the couple, saying nobody is texted yet", async () => {
    const { db, client } = setup("couple");
    const result = await runSwitch(client, [["sms_enabled", "on"]]);
    expect(result).toMatchObject({ ok: true });
    expect((result as { data: { message: string } }).data.message).toMatch(
      /Texting is on/,
    );
    expect(db.tables.settings[0].sms_enabled).toBe(true);
  });

  it("turns it off when the box is unticked", async () => {
    const { db, client } = setup("couple");
    db.tables.settings[0].sms_enabled = true;
    const result = await runSwitch(client, []);
    expect(result).toMatchObject({ ok: true });
    expect(db.tables.settings[0].sms_enabled).toBe(false);
  });

  it("refuses a planner", async () => {
    const { db, client } = setup("planner");
    const result = await runSwitch(client, [["sms_enabled", "on"]]);
    expect(result.ok).toBe(false);
    expect(db.tables.settings[0].sms_enabled).toBeUndefined();
  });

  it("refuses while the provider is not configured, changing nothing", async () => {
    mockConfigured.mockReturnValue(false);
    const { db, client } = setup("couple");
    const result = await runSwitch(client, [["sms_enabled", "on"]]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("texting_not_configured"),
    });
    expect(db.tables.settings[0].sms_enabled).toBeUndefined();
  });
});

describe("saveSaveTheDate", () => {
  it("saves the place and the note, trimmed, touching nothing else", async () => {
    const { db, client } = setup();
    const result = await saveSaveTheDate(
      null,
      form([
        ["save_the_date_place", "  Napa Valley, California "],
        ["save_the_date_note", " Invitation to follow "],
      ]),
      { supabase: client as never },
    );
    expect(result.ok).toBe(true);
    expect(db.tables.settings[0]).toMatchObject({
      save_the_date_place: "Napa Valley, California",
      save_the_date_note: "Invitation to follow",
      rsvp_open: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("clears a blank field to nothing", async () => {
    const { db, client } = setup();
    db.tables.settings[0].save_the_date_place = "Old";
    await saveSaveTheDate(
      null,
      form([
        ["save_the_date_place", "   "],
        ["save_the_date_note", ""],
      ]),
      { supabase: client as never },
    );
    expect(db.tables.settings[0].save_the_date_place).toBeNull();
    expect(db.tables.settings[0].save_the_date_note).toBeNull();
  });

  it("refuses a place over 200 characters or a note over 300, saving nothing", async () => {
    const { db, client } = setup();
    const long = await saveSaveTheDate(
      null,
      form([["save_the_date_place", "x".repeat(201)]]),
      { supabase: client as never },
    );
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.fieldErrors?.save_the_date_place).toBeTruthy();
    const note = await saveSaveTheDate(
      null,
      form([["save_the_date_note", "x".repeat(301)]]),
      { supabase: client as never },
    );
    expect(note.ok).toBe(false);
    expect(db.tables.settings[0].save_the_date_place).toBeUndefined();
  });

  it("is refused for someone who is not staff", async () => {
    const auth = fakeSupabase({ user: { id: "g" }, staffRole: null });
    const result = await saveSaveTheDate(
      null,
      form([["save_the_date_place", "x"]]),
      { supabase: auth.client as never },
    );
    expect(result.ok).toBe(false);
  });
});
