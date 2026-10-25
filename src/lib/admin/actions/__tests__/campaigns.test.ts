/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });
const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
const redirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;replace;${url};307;`,
  });
});
jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { cancelCampaign, previewAudience, saveCampaign } from "../campaigns";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD = "6f1d1f3e-2b0a-4c3a-9d55-0a7f6d8e9b10";

function setup(
  campaigns: Array<Record<string, unknown>> = [],
  rpcData: unknown = [],
) {
  const auth = fakeSupabase({ user: { id: "user-1" }, staffRole: "planner" });
  const db = createAdminFakeDb(
    { campaigns },
    { rpcResults: { resolve_audience: { data: rpcData } } },
  );
  const client = {
    auth: auth.client.auth,
    rpc: db.rpc,
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

const everyone: Array<[string, string]> = [["audience_scope", "all"]];
const base: Array<[string, string]> = [
  ["name", "Required RSVP reminder"],
  ["message_type_key", "rsvp_reminder"],
  ...everyone,
];

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
});

describe("previewAudience", () => {
  const rows = [
    {
      household_id: "h1",
      display_name: "The Examples",
      deliverable: true,
      skip_reason: null,
    },
    {
      household_id: "h2",
      display_name: "Exampleton family",
      deliverable: false,
      skip_reason: "no_email",
    },
    {
      household_id: "h3",
      display_name: "Test, Pat and Lee",
      deliverable: false,
      skip_reason: "opted_out",
    },
  ];

  it("calls resolve_audience with the audience and message type and saves nothing", async () => {
    const { db, client } = setup([], rows);
    const result = await previewAudience(null, form(base), {
      supabase: client as never,
    });
    expect(db.rpcCalls).toEqual([
      {
        fn: "resolve_audience",
        args: { filter: { scope: "all" }, message_type_key: "rsvp_reminder" },
      },
    ]);
    expect(db.writes).toEqual([]);
    expect(result).toEqual({
      ok: true,
      data: {
        willSend: [{ householdId: "h1", name: "The Examples" }],
        skipped: [
          { householdId: "h2", name: "Exampleton family", reason: "no_email" },
          { householdId: "h3", name: "Test, Pat and Lee", reason: "opted_out" },
        ],
      },
    });
  });

  it("returns the plain message and does not call the RPC for an invalid audience", async () => {
    const { db, client } = setup();
    const result = await previewAudience(
      null,
      form([
        ["name", "x"],
        ["message_type_key", "rsvp_reminder"],
        ["audience_scope", "filter"],
      ]),
      { supabase: client as never },
    );
    expect(result).toMatchObject({
      ok: false,
      message:
        "Choose at least one filter, or send to everyone or one household.",
    });
    expect(db.rpcCalls).toEqual([]);
  });

  it("shows a plain message when the database refuses", async () => {
    const { db, client } = setup();
    db.failNext("resolve_audience", { message: "invalid_payload" });
    const result = await previewAudience(null, form(base), {
      supabase: client as never,
    });
    expect(result).toEqual({
      ok: false,
      message: messageFor("invalid_payload"),
      values: expect.any(Object),
    });
  });
});

describe("saveCampaign", () => {
  it("requires a name and a known message type", async () => {
    const { db, client } = setup();
    const result = await saveCampaign(
      null,
      form([["name", "  "], ["message_type_key", "bogus"], ...everyone]),
      { supabase: client as never },
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        name: expect.any(String),
        message_type_key: expect.any(String),
      },
      values: { name: "  " },
    });
    expect(db.writes).toEqual([]);
  });

  it("creates a draft and goes to its editor", async () => {
    const { db, client } = setup();
    await expect(
      saveCampaign(null, form([...base, ["intent", "draft"]]), {
        supabase: client as never,
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(db.tables.campaigns).toHaveLength(1);
    expect(db.tables.campaigns[0]).toMatchObject({
      name: "Required RSVP reminder",
      message_type_key: "rsvp_reminder",
      audience: { scope: "all" },
      status: "draft",
      scheduled_for: null,
    });
    const id = db.tables.campaigns[0].id as string;
    expect(redirect).toHaveBeenCalledWith(
      `/admin/campaigns?tab=edit&id=${id}&saved=1`,
    );
  });

  it("schedules with a Pacific time converted to an exact moment", async () => {
    const { db, client } = setup([
      {
        id: CAMPAIGN,
        name: "Old",
        message_type_key: "update",
        audience: { scope: "all" },
        status: "draft",
        scheduled_for: null,
      },
    ]);
    const result = await saveCampaign(
      null,
      form([
        ...base,
        ["id", CAMPAIGN],
        ["intent", "schedule"],
        ["scheduled_for", "2026-10-30T10:00"],
      ]),
      { supabase: client as never, now: new Date("2026-10-25T12:00:00Z") },
    );
    expect(result).toEqual({
      ok: true,
      data: { id: CAMPAIGN, message: "Scheduled for Oct 30, 10:00 AM PT." },
    });
    expect(db.tables.campaigns[0]).toMatchObject({
      name: "Required RSVP reminder",
      status: "scheduled",
      scheduled_for: "2026-10-30T17:00:00.000Z",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/campaigns");
  });

  it("stores a valid household audience", async () => {
    const { db, client } = setup([
      {
        id: CAMPAIGN,
        name: "Old",
        message_type_key: "update",
        audience: { scope: "all" },
        status: "draft",
        scheduled_for: null,
      },
    ]);
    await saveCampaign(
      null,
      form([
        ["id", CAMPAIGN],
        ["name", "Just one"],
        ["message_type_key", "update"],
        ["audience_scope", "household"],
        ["household_id", HOUSEHOLD],
      ]),
      { supabase: client as never },
    );
    expect(db.tables.campaigns[0].audience).toEqual({
      scope: "household",
      household_id: HOUSEHOLD,
    });
  });

  it("refuses an invalid audience with the plain message and saves nothing", async () => {
    const { db, client } = setup();
    const result = await saveCampaign(
      null,
      form([
        ["name", "x"],
        ["message_type_key", "update"],
        ["audience_scope", "filter"],
      ]),
      { supabase: client as never },
    );
    expect(result).toMatchObject({
      ok: false,
      message:
        "Choose at least one filter, or send to everyone or one household.",
    });
    expect(db.writes).toEqual([]);
  });

  it("needs a time to schedule, and the time must be in the future", async () => {
    const { db, client } = setup();
    const missing = await saveCampaign(
      null,
      form([...base, ["intent", "schedule"], ["scheduled_for", ""]]),
      { supabase: client as never },
    );
    expect(missing).toMatchObject({
      ok: false,
      fieldErrors: { scheduled_for: expect.any(String) },
    });
    const past = await saveCampaign(
      null,
      form([
        ...base,
        ["intent", "schedule"],
        ["scheduled_for", "2026-10-01T10:00"],
      ]),
      { supabase: client as never, now: new Date("2026-10-25T12:00:00Z") },
    );
    expect(past).toMatchObject({
      ok: false,
      fieldErrors: { scheduled_for: "Choose a time in the future." },
    });
    expect(db.writes).toEqual([]);
  });

  it("rejects a time that does not exist because the clocks change", async () => {
    const { client } = setup();
    const result = await saveCampaign(
      null,
      form([
        ...base,
        ["intent", "schedule"],
        ["scheduled_for", "2027-03-14T02:30"],
      ]),
      { supabase: client as never, now: new Date("2026-10-25T12:00:00Z") },
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { scheduled_for: expect.stringMatching(/clocks change/) },
    });
  });

  it.each(["sending", "done", "cancelled"])(
    "refuses to edit a %s campaign with the locked message",
    async (status) => {
      const { db, client } = setup([
        {
          id: CAMPAIGN,
          name: "Old",
          message_type_key: "update",
          audience: { scope: "all" },
          status,
          scheduled_for: null,
        },
      ]);
      const result = await saveCampaign(
        null,
        form([...base, ["id", CAMPAIGN], ["intent", "draft"]]),
        { supabase: client as never },
      );
      expect(result).toMatchObject({
        ok: false,
        message: messageFor("campaign_locked"),
      });
      expect(db.writes).toEqual([]);
    },
  );

  it("says not found for a campaign that does not exist", async () => {
    const { client } = setup();
    const result = await saveCampaign(
      null,
      form([...base, ["id", CAMPAIGN], ["intent", "draft"]]),
      { supabase: client as never },
    );
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("not_found"),
    });
  });
});

describe("cancelCampaign", () => {
  const row = (status: string) => ({
    id: CAMPAIGN,
    name: "Old",
    message_type_key: "update",
    audience: { scope: "all" },
    status,
    scheduled_for: null,
  });

  it.each(["draft", "scheduled"])("cancels a %s campaign", async (status) => {
    const { db, client } = setup([row(status)]);
    const result = await cancelCampaign(null, form([["id", CAMPAIGN]]), {
      supabase: client as never,
    });
    expect(result).toEqual({ ok: true });
    expect(db.tables.campaigns[0].status).toBe("cancelled");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/campaigns");
  });

  it.each(["sending", "done", "cancelled"])(
    "shows the status-transition message for a %s campaign",
    async (status) => {
      const { db, client } = setup([row(status)]);
      const result = await cancelCampaign(null, form([["id", CAMPAIGN]]), {
        supabase: client as never,
      });
      expect(result).toMatchObject({
        ok: false,
        message: messageFor("invalid_status_transition"),
      });
      expect(db.writes).toEqual([]);
    },
  );

  it("rejects an id that is not a campaign id", async () => {
    const { client } = setup();
    const result = await cancelCampaign(null, form([["id", "nope"]]), {
      supabase: client as never,
    });
    expect(result.ok).toBe(false);
  });
});
