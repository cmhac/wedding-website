/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });
const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  inviteGuests,
  recordMeal,
  recordRsvp,
  removeInvitation,
} from "../answers";

function setup(
  rpcResults: Record<
    string,
    { data?: unknown; error?: { code?: string; message?: string } }
  > = {},
  role: "couple" | "planner" = "couple",
) {
  const auth = fakeSupabase({ user: { id: "user-1" }, staffRole: role });
  const db = createAdminFakeDb(
    {
      invitations: [
        { guest_id: "g1", event_id: "e1" },
        { guest_id: "g1", event_id: "e2" },
        { guest_id: "g2", event_id: "e1" },
      ],
    },
    { rpcResults },
  );
  const client = {
    auth: auth.client.auth,
    from: (table: string) =>
      table === "staff" ? auth.client.from(table) : db.from(table),
    rpc: db.rpc,
  };
  return { db, client };
}

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

beforeEach(() => revalidatePath.mockClear());

describe("inviteGuests", () => {
  const run = (client: unknown, entries: Array<[string, string]>) =>
    inviteGuests(null, form(entries), { supabase: client as never });

  it("calls invite with the chosen guests and event, and reports the counts", async () => {
    const { db, client } = setup({
      invite: { data: { added: 2, existing: 1, unknown: 0 } },
    });
    const result = await run(client, [
      ["event_id", "e3"],
      ["guest_ids", "g1"],
      ["guest_ids", "g2"],
      ["guest_ids", "g3"],
    ]);
    expect(db.rpcCalls).toEqual([
      { fn: "invite", args: { guest_ids: ["g1", "g2", "g3"], event_id: "e3" } },
    ]);
    expect(result).toEqual({
      ok: true,
      data: {
        message: "2 added, 1 already invited, 0 not found",
        added: 2,
        existing: 1,
        unknown: 0,
      },
    });
  });

  it("accepts a single guest and sends no email", async () => {
    const { db, client } = setup({
      invite: { data: { added: 1, existing: 0, unknown: 0 } },
    });
    const result = await run(client, [
      ["event_id", "e3"],
      ["guest_ids", "g1"],
    ]);
    expect(result.ok).toBe(true);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["invite"]);
    expect(db.writes).toEqual([]);
  });

  it("asks for at least one guest and an event", async () => {
    const { db, client } = setup();
    const none = await run(client, [["event_id", "e3"]]);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.fieldErrors?.guest_ids).toBeTruthy();
    const noEvent = await run(client, [["guest_ids", "g1"]]);
    expect(noEvent.ok).toBe(false);
    expect(db.rpcCalls).toEqual([]);
  });

  it("gives a plain message for an unknown event", async () => {
    const { client } = setup({
      invite: { error: { message: "not_found" } },
    });
    const result = await run(client, [
      ["event_id", "gone"],
      ["guest_ids", "g1"],
    ]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("not_found"),
    });
  });

  it("refreshes the events and household pages", async () => {
    const { client } = setup({
      invite: { data: { added: 1, existing: 0, unknown: 0 } },
    });
    await run(client, [
      ["event_id", "e3"],
      ["guest_ids", "g1"],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/events", undefined);
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/households/[id]",
      "page",
    );
  });
});

describe("removeInvitation", () => {
  const run = (client: unknown, entries: Array<[string, string]>) =>
    removeInvitation(null, form(entries), { supabase: client as never });

  it("refuses without the confirm step", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
    ]);
    expect(result.ok).toBe(false);
    expect(db.tables.invitations).toHaveLength(3);
  });

  it("deletes only the one guest and event row", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
      ["confirmed", "yes"],
    ]);
    expect(result.ok).toBe(true);
    expect(db.tables.invitations).toEqual([
      { guest_id: "g1", event_id: "e2" },
      { guest_id: "g2", event_id: "e1" },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/households/[id]",
      "page",
    );
  });

  it("needs both ids", async () => {
    const { db, client } = setup();
    const result = await run(client, [
      ["guest_id", "g1"],
      ["confirmed", "yes"],
    ]);
    expect(result.ok).toBe(false);
    expect(db.tables.invitations).toHaveLength(3);
  });
});

describe("recordRsvp", () => {
  const run = (client: unknown, entries: Array<[string, string]>) =>
    recordRsvp(null, form(entries), { supabase: client as never });

  it.each(["pending", "attending", "declined"])(
    "calls staff_set_rsvp with %s",
    async (status) => {
      const { db, client } = setup({ staff_set_rsvp: { data: {} } });
      const result = await run(client, [
        ["guest_id", "g1"],
        ["event_id", "e1"],
        ["status", status],
      ]);
      expect(result.ok).toBe(true);
      expect(db.rpcCalls).toEqual([
        {
          fn: "staff_set_rsvp",
          args: { guest_id: "g1", event_id: "e1", status },
        },
      ]);
    },
  );

  it.each(["maybe", "", "ATTENDING"])("rejects status %p", async (status) => {
    const { db, client } = setup({ staff_set_rsvp: { data: {} } });
    const result = await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
      ["status", status],
    ]);
    expect(result.ok).toBe(false);
    expect(db.rpcCalls).toEqual([]);
  });

  it("is not blocked by a closed RSVP setting or a passed deadline (it never reads them)", async () => {
    const { db, client } = setup({ staff_set_rsvp: { data: {} } });
    await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
      ["status", "attending"],
    ]);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["staff_set_rsvp"]);
    expect(db.writes).toEqual([]);
  });

  it("gives a plain message when the invitation is gone", async () => {
    const { client } = setup({
      staff_set_rsvp: { error: { message: "not_found" } },
    });
    const result = await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
      ["status", "declined"],
    ]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("not_found"),
    });
  });

  it("refreshes the household and events pages", async () => {
    const { client } = setup({ staff_set_rsvp: { data: {} } });
    await run(client, [
      ["guest_id", "g1"],
      ["event_id", "e1"],
      ["status", "declined"],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/households/[id]",
      "page",
    );
  });
});

describe("recordMeal", () => {
  const run = (client: unknown, entries: Array<[string, string]>) =>
    recordMeal(null, form(entries), { supabase: client as never });

  it("calls staff_set_meal with the course, dish and guest", async () => {
    const { db, client } = setup({ staff_set_meal: { data: {} } });
    const result = await run(client, [
      ["guest_id", "g1"],
      ["course_id", "c1"],
      ["dish_id", "d1"],
    ]);
    expect(result.ok).toBe(true);
    expect(db.rpcCalls).toEqual([
      {
        fn: "staff_set_meal",
        args: { course_id: "c1", dish_id: "d1", guest_id: "g1" },
      },
    ]);
  });

  it("clears the choice with a null dish when the dish is empty or missing", async () => {
    for (const entries of [
      [
        ["guest_id", "g1"],
        ["course_id", "c1"],
        ["dish_id", ""],
      ],
      [
        ["guest_id", "g1"],
        ["course_id", "c1"],
      ],
    ] as Array<Array<[string, string]>>) {
      const { db, client } = setup({ staff_set_meal: { data: {} } });
      const result = await run(client, entries);
      expect(result.ok).toBe(true);
      expect(db.rpcCalls[0].args).toEqual({
        course_id: "c1",
        dish_id: null,
        guest_id: "g1",
      });
    }
  });

  it("maps invalid_meal to its plain message", async () => {
    const { client } = setup({
      staff_set_meal: { error: { message: "invalid_meal" } },
    });
    const result = await run(client, [
      ["guest_id", "g1"],
      ["course_id", "c1"],
      ["dish_id", "d1"],
    ]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("invalid_meal"),
    });
  });

  it("needs a guest and a course", async () => {
    const { db, client } = setup();
    const result = await run(client, [["dish_id", "d1"]]);
    expect(result.ok).toBe(false);
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("who may run these", () => {
  it("lets a planner record an answer", async () => {
    const { client } = setup({ staff_set_rsvp: { data: {} } }, "planner");
    const result = await recordRsvp(
      null,
      form([
        ["guest_id", "g1"],
        ["event_id", "e1"],
        ["status", "attending"],
      ]),
      { supabase: client as never },
    );
    expect(result.ok).toBe(true);
  });
});
