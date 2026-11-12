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

const mockConfigured = jest.fn();
const mockSmsEnabled = jest.fn();
jest.mock("@/lib/sms/state", () => ({
  isSmsConfigured: () => mockConfigured(),
  getSmsState: async () => ({
    configured: mockConfigured(),
    enabled: mockSmsEnabled(),
    available: mockConfigured() && mockSmsEnabled(),
  }),
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
    {
      campaigns,
      household_contacts: [
        {
          id: "c1",
          household_id: "h1",
          kind: "email",
          value: "a@example.test",
        },
        {
          id: "c2",
          household_id: "h1",
          kind: "email",
          value: "b@example.test",
        },
        // A phone number does not count as an address to email.
        { id: "c3", household_id: "h1", kind: "phone", value: "+12025550123" },
      ],
    },
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
        willSend: [{ householdId: "h1", name: "The Examples", addresses: 2 }],
        skipped: [
          { householdId: "h2", name: "Exampleton family", reason: "no_email" },
          { householdId: "h3", name: "Test, Pat and Lee", reason: "opted_out" },
        ],
        unreachable: 1,
        sendWarning: null,
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

describe("saveCampaign channel", () => {
  const save = (client: unknown, extra: Array<[string, string]>) =>
    saveCampaign(null, form([...base, ["intent", "draft"], ...extra]), {
      supabase: client as never,
    }).catch((e) => e);

  beforeEach(() => mockConfigured.mockReturnValue(true));

  it.each(["email", "text", "both"])(
    "saves the channel %s when texting is configured",
    async (channel) => {
      const { db, client } = setup();
      await save(client, [["channel", channel]]);
      expect(db.tables.campaigns[0].channel).toBe(channel);
    },
  );

  it("saves no channel (so email) when none is sent", async () => {
    const { db, client } = setup();
    await save(client, []);
    expect(db.tables.campaigns[0]).not.toHaveProperty("channel");
  });

  it("ignores a channel entirely while texting is not configured", async () => {
    mockConfigured.mockReturnValue(false);
    const { db, client } = setup();
    await save(client, [["channel", "both"]]);
    expect(db.tables.campaigns[0]).not.toHaveProperty("channel");
  });

  it("refuses a channel that is not email, text or both", async () => {
    const { db, client } = setup();
    const result = await saveCampaign(
      null,
      form([...base, ["intent", "draft"], ["channel", "pigeon"]]),
      {
        supabase: client as never,
      },
    );
    expect(result).toMatchObject({ ok: false });
    expect(db.tables.campaigns).toHaveLength(0);
  });
});

describe("previewAudience for texts", () => {
  const audienceRows = [
    {
      household_id: "h1",
      display_name: "One",
      deliverable: true,
      skip_reason: null,
    },
    {
      household_id: "h2",
      display_name: "Two",
      deliverable: false,
      skip_reason: "no_email",
    },
    {
      household_id: "h3",
      display_name: "Three",
      deliverable: true,
      skip_reason: null,
    },
    {
      household_id: "h4",
      display_name: "Four",
      deliverable: false,
      skip_reason: "already_responded",
    },
  ];
  const withPhones = (db: {
    tables: Record<string, Array<Record<string, unknown>>>;
  }) => {
    db.tables.household_contacts.push(
      {
        id: "p1",
        household_id: "h1",
        kind: "phone",
        value: "+12025550101",
        sms_consent: "opted_in",
      },
      {
        id: "p2",
        household_id: "h1",
        kind: "phone",
        value: "+12025550102",
        sms_consent: "not_asked",
      },
      {
        id: "p3",
        household_id: "h2",
        kind: "phone",
        value: "+12025550103",
        sms_consent: "not_asked",
      },
      {
        id: "p4",
        household_id: "h4",
        kind: "phone",
        value: "+12025550104",
        sms_consent: "opted_in",
      },
    );
  };
  const preview = (client: unknown, channel: string | null) =>
    previewAudience(
      null,
      form(channel ? [...base, ["channel", channel]] : base),
      { supabase: client as never },
    );

  beforeEach(() => {
    mockConfigured.mockReturnValue(true);
    mockSmsEnabled.mockReturnValue(true);
  });

  it("counts texts per household and says why each other number or household is not texted", async () => {
    const { db, client } = setup([], audienceRows);
    withPhones(db as never);
    const result = await preview(client, "both");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data!.texts).toEqual({
      switchedOff: false,
      preConsented: 0,
      segmentsPerText: 1,
      totalSegments: 1,
      minutes: 1,
      willText: [{ householdId: "h1", name: "One", texts: 1 }],
      notTexted: expect.arrayContaining([
        { householdId: "h1", name: "One", reason: "not_opted_in" },
        { householdId: "h2", name: "Two", reason: "not_opted_in" },
        { householdId: "h3", name: "Three", reason: "no_phone" },
      ]),
    });
    // A household out of the audience for another reason is not texted either.
    expect(
      result.data!.texts!.notTexted.find((n) => n.householdId === "h4"),
    ).toBeUndefined();
  });

  it("says texts will be skipped when texting is switched off", async () => {
    mockSmsEnabled.mockReturnValue(false);
    const { db, client } = setup([], audienceRows);
    withPhones(db as never);
    const result = await preview(client, "text");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data!.texts).toMatchObject({
      switchedOff: true,
      willText: [],
    });
  });

  it("has no text section for an email campaign or while texting is not configured", async () => {
    const { db, client } = setup([], audienceRows);
    withPhones(db as never);
    expect(
      ((await preview(client, "email")) as { data: { texts?: unknown } }).data
        .texts,
    ).toBeUndefined();
    mockConfigured.mockReturnValue(false);
    expect(
      ((await preview(client, "both")) as { data: { texts?: unknown } }).data
        .texts,
    ).toBeUndefined();
  });
});

describe("previewAudience figures for the first outreach", () => {
  const rows = [
    {
      household_id: "h1",
      display_name: "One",
      deliverable: true,
      skip_reason: null,
    },
    {
      household_id: "h2",
      display_name: "Two",
      deliverable: false,
      skip_reason: "no_email",
    },
    {
      household_id: "h3",
      display_name: "Three",
      deliverable: false,
      skip_reason: "no_email",
    },
  ];
  const phone = (
    id: string,
    hid: string,
    consent: string,
    source: string | null,
  ) => ({
    id,
    household_id: hid,
    kind: "phone",
    value: `+1202555${id}`,
    sms_consent: consent,
    sms_consent_source: source,
  });
  const preview = (client: unknown, extra: Array<[string, string]> = []) =>
    previewAudience(
      null,
      form([
        ["name", "x"],
        ["message_type_key", "save_the_date"],
        ...everyone,
        ...extra,
      ]),
      { supabase: client as never, now: new Date("2027-01-15T20:00:00Z") },
    );

  beforeEach(() => {
    mockConfigured.mockReturnValue(true);
    mockSmsEnabled.mockReturnValue(true);
  });

  it("counts pre-consented numbers, the segments of the save the date text and how long it takes", async () => {
    const { db, client } = setup([], rows);
    db.tables.household_contacts.push(
      phone("0101", "h1", "opted_in", "staff"),
      phone("0102", "h2", "opted_in", "import"),
      phone("0103", "h2", "opted_in", "first_sign_in"),
    );
    const result = await preview(client, [["channel", "both"]]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data!.texts).toMatchObject({
      preConsented: 2,
      segmentsPerText: 2,
      totalSegments: 6,
      minutes: 1,
    });
  });

  it("counts the households this campaign cannot reach: no email and no opted-in number", async () => {
    const { db, client } = setup([], rows);
    db.tables.household_contacts.push(
      phone("0102", "h2", "opted_in", "staff"),
      phone("0103", "h3", "not_asked", null),
    );
    const both = await preview(client, [["channel", "both"]]);
    if (!both.ok) throw new Error("expected ok");
    expect(both.data!.unreachable).toBe(1);
    const emailOnly = await preview(client, [["channel", "email"]]);
    if (!emailOnly.ok) throw new Error("expected ok");
    expect(emailOnly.data!.unreachable).toBe(2);
  });

  it("warns about texting hours for a text send now outside 11 a.m. to 9 p.m. Eastern, and not inside", async () => {
    const { client } = setup([], rows);
    const night = previewAudience(
      null,
      form([
        ["name", "x"],
        ["message_type_key", "save_the_date"],
        ...everyone,
        ["channel", "text"],
      ]),
      { supabase: client as never, now: new Date("2027-01-15T08:00:00Z") },
    );
    const ok = await night;
    if (!ok.ok) throw new Error("expected ok");
    expect(ok.data!.sendWarning).toMatch(/8 a\.m\./);
    const day = await preview(client, [["channel", "text"]]);
    if (!day.ok) throw new Error("expected ok");
    expect(day.data!.sendWarning).toBeNull();
  });

  it("uses the scheduled time, in Pacific time, when there is one, and never warns for an email campaign", async () => {
    const { client } = setup([], rows);
    // 7:00 a.m. Pacific is 10:00 Eastern: outside the window.
    const early = await preview(client, [
      ["channel", "text"],
      ["scheduled_for", "2027-03-01T07:00"],
    ]);
    if (!early.ok) throw new Error("expected ok");
    expect(early.data!.sendWarning).toMatch(/8 a\.m\./);
    const emailOnly = await preview(client, [
      ["channel", "email"],
      ["scheduled_for", "2027-03-01T07:00"],
    ]);
    if (!emailOnly.ok) throw new Error("expected ok");
    expect(emailOnly.data!.sendWarning).toBeNull();
  });
});
