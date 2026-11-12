/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });
const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  checkAgain,
  confirmStep,
  leaveGuide,
  recordPosition,
  restartGuide,
  resumeGuide,
  saveSetupValue,
  skipStep,
  unconfirmStep,
} from "../setup";

function setup(
  role: "couple" | "planner" | null = "couple",
  initial: Record<string, Record<string, unknown>[]> = {},
) {
  const auth = fakeSupabase({
    user: { id: "user-1" },
    staffRole: role,
    household: role === null,
  });
  const db = createAdminFakeDb({
    settings: [{ id: true, rsvp_open: true, default_rsvp_deadline: null }],
    setup_guide_state: [],
    setup_confirmations: [],
    ...initial,
  });
  const client = {
    auth: auth.client.auth,
    from: (table: string) =>
      table === "staff" || table === "households"
        ? auth.client.from(table)
        : db.from(table),
  };
  return { db, client: client as never };
}

function form(entries: Array<[string, string]> = []) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

beforeEach(() => revalidatePath.mockClear());

describe("leaveGuide", () => {
  it("records that the person left, where they were and the required steps that exist", async () => {
    const { db, client } = setup();
    const result = await leaveGuide(
      null,
      form([
        ["step", "link_key"],
        ["seen", "site_url,link_key,not_a_step"],
      ]),
      { supabase: client },
    );
    expect(result.ok).toBe(true);
    expect(db.tables.setup_guide_state).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        left_guide: true,
        seen_required: ["site_url", "link_key"],
        last_step: "link_key",
      }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("ignores an unknown step instead of storing it", async () => {
    const { db, client } = setup();
    await leaveGuide(
      null,
      form([
        ["step", "bogus"],
        ["seen", ""],
      ]),
      {
        supabase: client,
      },
    );
    expect(db.tables.setup_guide_state[0]).not.toHaveProperty("last_step");
  });

  it("is staff only", async () => {
    const { db, client } = setup(null);
    const result = await leaveGuide(null, form(), { supabase: client });
    expect(result).toEqual({ ok: false, message: messageFor("forbidden") });
    expect(db.tables.setup_guide_state).toEqual([]);
  });
});

describe("resumeGuide", () => {
  it("clears the left state", async () => {
    const { db, client } = setup("planner", {
      setup_guide_state: [{ user_id: "user-1", left_guide: true }],
    });
    const result = await resumeGuide(null, form(), { supabase: client });
    expect(result.ok).toBe(true);
    expect(db.tables.setup_guide_state[0].left_guide).toBe(false);
  });
});

describe("skipStep", () => {
  it("adds the step to this person's skipped list once", async () => {
    const { db, client } = setup("couple", {
      setup_guide_state: [{ user_id: "user-1", skipped_steps: ["site_url"] }],
    });
    await skipStep(null, form([["step", "link_key"]]), { supabase: client });
    await skipStep(null, form([["step", "link_key"]]), { supabase: client });
    expect(db.tables.setup_guide_state[0].skipped_steps).toEqual([
      "site_url",
      "link_key",
    ]);
  });

  it("refuses an unknown step", async () => {
    const { db, client } = setup();
    const result = await skipStep(null, form([["step", "bogus"]]), {
      supabase: client,
    });
    expect(result.ok).toBe(false);
    expect(db.tables.setup_guide_state).toEqual([]);
  });
});

describe("recordPosition", () => {
  it("saves the step being viewed", async () => {
    const { db, client } = setup();
    await recordPosition(null, form([["step", "email_sending"]]), {
      supabase: client,
    });
    expect(db.tables.setup_guide_state[0]).toMatchObject({
      user_id: "user-1",
      last_step: "email_sending",
    });
  });
});

describe("restartGuide", () => {
  it("deletes this person's state only and changes no site value", async () => {
    const { db, client } = setup("couple", {
      setup_guide_state: [
        { user_id: "user-1", skipped_steps: ["site_url"] },
        { user_id: "user-2", skipped_steps: ["link_key"] },
      ],
    });
    const result = await restartGuide(null, form(), { supabase: client });
    expect(result.ok).toBe(true);
    expect(db.tables.setup_guide_state).toEqual([
      { user_id: "user-2", skipped_steps: ["link_key"] },
    ]);
    expect(db.tables.settings).toEqual([
      { id: true, rsvp_open: true, default_rsvp_deadline: null },
    ]);
  });
});

describe("confirmStep and unconfirmStep", () => {
  it("confirms and un-confirms a step that is checked by hand", async () => {
    const { db, client } = setup();
    await confirmStep(null, form([["step", "sending_domain"]]), {
      supabase: client,
    });
    expect(db.tables.setup_confirmations).toEqual([
      expect.objectContaining({
        step_key: "sending_domain",
        confirmed_by: "user-1",
      }),
    ]);
    await unconfirmStep(null, form([["step", "sending_domain"]]), {
      supabase: client,
    });
    expect(db.tables.setup_confirmations).toEqual([]);
  });

  it("refuses a step the site checks itself", async () => {
    const { db, client } = setup();
    const result = await confirmStep(null, form([["step", "site_url"]]), {
      supabase: client,
    });
    expect(result.ok).toBe(false);
    expect(db.tables.setup_confirmations).toEqual([]);
  });
});

describe("checkAgain", () => {
  it("refreshes the console for staff and returns no value", async () => {
    const { client } = setup("planner");
    const result = await checkAgain(null, form(), { supabase: client });
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("refuses a signed-in non-staff account", async () => {
    const { client } = setup(null);
    const result = await checkAgain(null, form(), { supabase: client });
    expect(result.ok).toBe(false);
  });
});

describe("saveSetupValue", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("saves the wedding event and nothing else", async () => {
    const { db, client } = setup("planner");
    const result = await saveSetupValue(
      null,
      form([
        ["step", "wedding_event"],
        ["wedding_event_id", uuid],
      ]),
      { supabase: client },
    );
    expect(result.ok).toBe(true);
    expect(db.tables.settings[0]).toEqual({
      id: true,
      rsvp_open: true,
      default_rsvp_deadline: null,
      wedding_event_id: uuid,
    });
  });

  it("refuses something that is not an event id", async () => {
    const { db, client } = setup();
    const result = await saveSetupValue(
      null,
      form([
        ["step", "wedding_event"],
        ["wedding_event_id", "nope"],
      ]),
      { supabase: client },
    );
    expect(result.ok).toBe(false);
    expect(db.tables.settings[0]).not.toHaveProperty("wedding_event_id");
  });

  it("saves the place and note, and refuses an empty place", async () => {
    const { db, client } = setup();
    const bad = await saveSetupValue(
      null,
      form([
        ["step", "card_details"],
        ["save_the_date_place", " "],
      ]),
      { supabase: client },
    );
    expect(bad.ok).toBe(false);
    await saveSetupValue(
      null,
      form([
        ["step", "card_details"],
        ["save_the_date_place", "Seattle"],
        ["save_the_date_note", ""],
      ]),
      { supabase: client },
    );
    expect(db.tables.settings[0]).toMatchObject({
      save_the_date_place: "Seattle",
      save_the_date_note: null,
    });
  });

  it("converts the Pacific deadline and refuses a time that does not exist", async () => {
    const { db, client } = setup();
    await saveSetupValue(
      null,
      form([
        ["step", "rsvp_deadline"],
        ["default_rsvp_deadline", "2027-05-01T23:59"],
      ]),
      { supabase: client },
    );
    expect(db.tables.settings[0].default_rsvp_deadline).toBe(
      "2027-05-02T06:59:00.000Z",
    );
    const bad = await saveSetupValue(
      null,
      form([
        ["step", "rsvp_deadline"],
        ["default_rsvp_deadline", "2027-03-14T02:30"],
      ]),
      { supabase: client },
    );
    expect(bad.ok).toBe(false);
  });

  it("closes the RSVP without touching the deadline", async () => {
    const { db, client } = setup();
    await saveSetupValue(null, form([["step", "rsvp_closed"]]), {
      supabase: client,
    });
    expect(db.tables.settings[0]).toMatchObject({
      rsvp_open: false,
      default_rsvp_deadline: null,
    });
  });
});
