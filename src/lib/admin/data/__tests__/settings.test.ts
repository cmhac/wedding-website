/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import { loadSettings, loadStaff } from "../settings";

const asClient = (db: ReturnType<typeof createAdminFakeDb>) =>
  db as unknown as SupabaseClient;

describe("loadSettings", () => {
  it("returns the deadline as a Pacific datetime-local value, rsvp_open and the row", async () => {
    const row = {
      id: true,
      default_rsvp_deadline: "2027-05-02T06:59:00.000Z",
      rsvp_open: false,
    };
    const db = createAdminFakeDb({ settings: [row] });
    const result = await loadSettings(asClient(db));
    expect(result).toEqual({
      default_rsvp_deadline: "2027-05-01T23:59",
      rsvp_open: false,
      row,
    });
  });

  it("gives an empty deadline when none is set", async () => {
    const db = createAdminFakeDb({
      settings: [{ id: true, default_rsvp_deadline: null, rsvp_open: true }],
    });
    const result = await loadSettings(asClient(db));
    expect(result.default_rsvp_deadline).toBe("");
    expect(result.rsvp_open).toBe(true);
  });

  it("throws when the settings row cannot be read", async () => {
    const db = createAdminFakeDb({ settings: [] });
    await expect(loadSettings(asClient(db))).rejects.toThrow();
  });
});

describe("loadStaff", () => {
  it("returns each member's display name and role only, couple first", async () => {
    const db = createAdminFakeDb({
      staff: [
        {
          user_id: "u3",
          display_name: "Pat Planner",
          role: "planner",
          created_at: "2026-01-01",
        },
        { user_id: "u2", display_name: "Hannah", role: "couple" },
        { user_id: "u1", display_name: "Chris", role: "couple" },
      ],
    });
    const staff = await loadStaff(asClient(db));
    expect(staff).toEqual([
      { user_id: "u1", display_name: "Chris", role: "couple" },
      { user_id: "u2", display_name: "Hannah", role: "couple" },
      { user_id: "u3", display_name: "Pat Planner", role: "planner" },
    ]);
  });

  it("returns an empty list when the read fails", async () => {
    const db = createAdminFakeDb({ staff: [] });
    db.failNext("staff", { message: "boom" });
    await expect(loadStaff(asClient(db))).rejects.toThrow();
  });
});
