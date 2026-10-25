/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

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

import { confirmDeleteEvent, deleteEvent, saveEvent } from "../events";

function setup(role: "couple" | "planner" = "couple") {
  const auth = fakeSupabase({ user: { id: "user-1" }, staffRole: role });
  const db = createAdminFakeDb({
    events: [
      {
        id: "e1",
        slug: "ceremony",
        name: "Ceremony",
        display_order: 1,
        is_required: true,
      },
    ],
    invitations: [
      { guest_id: "g1", event_id: "e1" },
      { guest_id: "g2", event_id: "e1" },
      { guest_id: "g1", event_id: "e2" },
    ],
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

const valid: Array<[string, string]> = [
  ["slug", "after-party"],
  ["name", "After party"],
  ["starts_at", "2027-06-12T22:00"],
  ["venue_name", "Example Bar"],
  ["group_key", "wedding-weekend"],
  ["rsvp_deadline", ""],
  ["display_order", "4"],
];

const save = (client: unknown, entries: Array<[string, string]>) =>
  saveEvent(null, form(entries), { supabase: client as never });

function replace(
  entries: Array<[string, string]>,
  key: string,
  value: string | null,
) {
  const rest = entries.filter(([k]) => k !== key);
  return value === null ? rest : [...rest, [key, value] as [string, string]];
}

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
});

describe("saveEvent (create)", () => {
  it("inserts the event with Pacific times converted and optional fields as null", async () => {
    const { db, client } = setup();
    const result = await save(client, [...valid, ["is_required", "on"]]);
    expect(result.ok).toBe(true);
    expect(db.tables.events).toHaveLength(2);
    expect(db.tables.events[1]).toMatchObject({
      slug: "after-party",
      name: "After party",
      starts_at: "2027-06-13T05:00:00.000Z",
      venue_name: "Example Bar",
      is_required: true,
      group_key: "wedding-weekend",
      rsvp_deadline: null,
      display_order: 4,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/events");
  });

  it("stores is_required false when the box is not ticked, and empty text as null", async () => {
    const { db, client } = setup();
    await save(
      client,
      replace(replace(valid, "venue_name", ""), "group_key", ""),
    );
    expect(db.tables.events[1]).toMatchObject({
      is_required: false,
      venue_name: null,
      group_key: null,
    });
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["uppercase", "After-Party"],
    ["with a space", "after party"],
    ["with an underscore", "after_party"],
  ])("rejects a slug that is %s", async (_label, slug) => {
    const { db, client } = setup();
    const result = await save(client, replace(valid, "slug", slug));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.slug).toBeTruthy();
    expect(db.tables.events).toHaveLength(1);
  });

  it("requires a name", async () => {
    const { client } = setup();
    const result = await save(client, replace(valid, "name", "  "));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.name).toBeTruthy();
  });

  it("shows a plain message for a start time skipped by a clock change", async () => {
    const { client } = setup();
    const result = await save(
      client,
      replace(valid, "starts_at", "2027-03-14T02:30"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.starts_at).toMatch(/clocks change/);
    }
  });

  it("converts an own deadline", async () => {
    const { db, client } = setup();
    await save(client, replace(valid, "rsvp_deadline", "2027-05-01T23:59"));
    expect(db.tables.events[1].rsvp_deadline).toBe("2027-05-02T06:59:00.000Z");
  });

  it.each(["1.5", "abc", "", "32768", "-32769"])(
    "rejects display order %p",
    async (order) => {
      const { client } = setup();
      const result = await save(client, replace(valid, "display_order", order));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors?.display_order).toBeTruthy();
    },
  );

  it("accepts the largest and smallest smallint", async () => {
    for (const order of ["32767", "-32768"]) {
      const { client } = setup();
      const result = await save(client, replace(valid, "display_order", order));
      expect(result.ok).toBe(true);
    }
  });

  it("shows a plain message for a duplicate slug", async () => {
    const { db, client } = setup();
    db.failNext("events", { code: "23505", message: "duplicate key value" });
    const result = await save(client, valid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        "Another event already uses that short key. Choose a different one.",
      );
      expect(result.fieldErrors?.slug).toBe(result.message);
      expect(result.values?.slug).toBe("after-party");
    }
  });
});

describe("saveEvent (edit)", () => {
  const edit: Array<[string, string]> = [
    ["id", "e1"],
    ["slug", "changed-key"],
    ["name", "Ceremony and reception"],
    ["starts_at", ""],
    ["venue_name", ""],
    ["group_key", ""],
    ["rsvp_deadline", ""],
    ["display_order", "2"],
  ];

  it("updates the event and ignores a changed slug", async () => {
    const { db, client } = setup();
    const result = await save(client, edit);
    expect(result.ok).toBe(true);
    expect(db.tables.events).toHaveLength(1);
    expect(db.tables.events[0]).toMatchObject({
      id: "e1",
      slug: "ceremony",
      name: "Ceremony and reception",
      is_required: false,
      display_order: 2,
    });
    expect(JSON.stringify(db.writes)).not.toContain("changed-key");
  });

  it("does not need a slug at all when editing", async () => {
    const { client } = setup();
    const result = await save(client, replace(edit, "slug", null));
    expect(result.ok).toBe(true);
  });
});

describe("deleteEvent", () => {
  const del = (client: unknown, entries: Array<[string, string]>) =>
    deleteEvent(null, form(entries), { supabase: client as never });

  it("refuses without the confirm step and deletes nothing", async () => {
    const { db, client } = setup();
    const result = await del(client, [["id", "e1"]]);
    expect(result.ok).toBe(false);
    expect(db.tables.events).toHaveLength(1);
    expect(db.tables.invitations).toHaveLength(3);
  });

  it("deletes the event and says how many invitations were removed", async () => {
    const { db, client } = setup();
    const result = await del(client, [
      ["id", "e1"],
      ["confirmed", "yes"],
    ]);
    expect(result).toEqual({
      ok: true,
      data: {
        message: "Event deleted. 2 invitations were removed.",
        removedInvitations: 2,
      },
    });
    expect(db.tables.events).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/events");
  });

  it("uses singular wording for one invitation", async () => {
    const { db, client } = setup();
    db.tables.invitations.splice(0, 1);
    const result = await del(client, [
      ["id", "e1"],
      ["confirmed", "yes"],
    ]);
    if (result.ok) {
      expect(result.data?.message).toBe(
        "Event deleted. 1 invitation was removed.",
      );
    }
  });
});

describe("confirmDeleteEvent", () => {
  it("goes back to the events list after deleting", async () => {
    const { db, client } = setup();
    await expect(
      confirmDeleteEvent(
        form([
          ["id", "e1"],
          ["confirmed", "yes"],
        ]),
        { supabase: client as never },
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(db.tables.events).toHaveLength(0);
    expect(redirect).toHaveBeenCalledWith("/admin/events?notice=deleted");
  });

  it("goes back to the event with a notice when it fails", async () => {
    const { db, client } = setup();
    db.failNext("events", { message: "boom" });
    await expect(
      confirmDeleteEvent(
        form([
          ["id", "e1"],
          ["confirmed", "yes"],
        ]),
        { supabase: client as never },
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      "/admin/events?tab=edit&id=e1&notice=delete_failed",
    );
  });
});
