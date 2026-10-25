/** @jest-environment node */
import { createAdminFakeDb } from "./fake-db";

const rows = () => ({
  dishes: [
    { id: "d1", name: "Roast Squash", course: "main", rank: 2 },
    { id: "d2", name: "Herb Gnocchi", course: "main", rank: 1 },
    { id: "d3", name: "Lemon Tart", course: "dessert", rank: 3 },
    { id: "d4", name: "Plum Sorbet", course: "dessert", rank: 4 },
  ],
});

describe("admin fake db shapes", () => {
  it("order sorts ascending and descending", async () => {
    const db = createAdminFakeDb(rows());
    const asc = await db.from("dishes").select().order("rank");
    expect((asc.data as { id: string }[]).map((r) => r.id)).toEqual([
      "d2",
      "d1",
      "d3",
      "d4",
    ]);
    const desc = await db
      .from("dishes")
      .select()
      .order("rank", { ascending: false });
    expect((desc.data as { id: string }[])[0].id).toBe("d4");
  });

  it("in filters by a list of values", async () => {
    const db = createAdminFakeDb(rows());
    const res = await db.from("dishes").select().in("id", ["d1", "d4"]);
    expect((res.data as unknown[]).length).toBe(2);
  });

  it("ilike matches case-insensitively with % wildcards", async () => {
    const db = createAdminFakeDb(rows());
    const res = await db.from("dishes").select().ilike("name", "%TART%");
    expect(res.data).toEqual([expect.objectContaining({ id: "d3" })]);
    const starts = await db.from("dishes").select().ilike("name", "herb%");
    expect((starts.data as unknown[]).length).toBe(1);
    const none = await db.from("dishes").select().ilike("name", "tart");
    expect(none.data).toEqual([]);
  });

  it("range returns an inclusive slice", async () => {
    const db = createAdminFakeDb(rows());
    const res = await db.from("dishes").select().order("rank").range(1, 2);
    expect((res.data as { id: string }[]).map((r) => r.id)).toEqual([
      "d1",
      "d3",
    ]);
  });

  it("single returns one row, and an error for none or many", async () => {
    const db = createAdminFakeDb(rows());
    const one = await db.from("dishes").select().eq("id", "d1").single();
    expect(one.data).toEqual(expect.objectContaining({ id: "d1" }));
    const none = await db.from("dishes").select().eq("id", "zzz").single();
    expect(none.data).toBeNull();
    expect(none.error).not.toBeNull();
    const many = await db.from("dishes").select().single();
    expect(many.error).not.toBeNull();
  });

  it("maybeSingle returns null data and no error for none", async () => {
    const db = createAdminFakeDb(rows());
    const none = await db.from("dishes").select().eq("id", "zzz").maybeSingle();
    expect(none).toEqual({ data: null, error: null });
    const one = await db.from("dishes").select().eq("id", "d2").maybeSingle();
    expect(one.data).toEqual(expect.objectContaining({ id: "d2" }));
  });

  it("delete removes matching rows and is recorded", async () => {
    const db = createAdminFakeDb(rows());
    const res = await db.from("dishes").delete().eq("course", "dessert");
    expect(res.error).toBeNull();
    expect(db.tables.dishes.map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(db.writes).toContainEqual(
      expect.objectContaining({ table: "dishes", op: "delete" }),
    );
  });

  it("update without a returned row changes rows and returns no data", async () => {
    const db = createAdminFakeDb(rows());
    const res = await db
      .from("dishes")
      .update({ name: "Renamed" })
      .eq("id", "d1");
    expect(res).toEqual({ data: null, error: null });
    expect(db.tables.dishes[0].name).toBe("Renamed");
    expect(db.writes).toContainEqual(
      expect.objectContaining({ table: "dishes", op: "update" }),
    );
  });

  it("rpc returns canned results and records calls", async () => {
    const db = createAdminFakeDb(
      {},
      {
        rpcResults: {
          staff_households: { data: [{ id: "h1" }] },
          archive_dish: { error: { message: "nope" } },
        },
      },
    );
    await expect(db.rpc("staff_households", { q: "x" })).resolves.toEqual({
      data: [{ id: "h1" }],
      error: null,
    });
    await expect(db.rpc("archive_dish", { id: "d1" })).resolves.toEqual({
      data: null,
      error: { message: "nope" },
    });
    expect(db.rpcCalls).toEqual([
      { fn: "staff_households", args: { q: "x" } },
      { fn: "archive_dish", args: { id: "d1" } },
    ]);
    const missing = await db.rpc("unknown_fn");
    expect(missing.error).not.toBeNull();
  });

  it("failNext makes only the next query on that table fail", async () => {
    const db = createAdminFakeDb(rows());
    db.failNext("dishes", { message: "boom" });
    const failed = await db.from("dishes").select();
    expect(failed).toEqual({ data: null, error: { message: "boom" } });
    const ok = await db.from("dishes").select();
    expect(ok.error).toBeNull();
    expect((ok.data as unknown[]).length).toBe(4);
  });

  it("failNext does not apply a write that fails, and ignores other tables", async () => {
    const db = createAdminFakeDb(rows());
    db.failNext("dishes", { message: "boom" });
    const other = await db.from("events").select();
    expect(other.error).toBeNull();
    const res = await db.from("dishes").delete().eq("id", "d1");
    expect(res.error).toEqual({ message: "boom" });
    expect(db.tables.dishes).toHaveLength(4);
  });

  it("failNext also fails rpc when given an rpc name", async () => {
    const db = createAdminFakeDb({}, { rpcResults: { f: { data: 1 } } });
    db.failNext("f", { message: "rpc boom" });
    await expect(db.rpc("f")).resolves.toEqual({
      data: null,
      error: { message: "rpc boom" },
    });
    await expect(db.rpc("f")).resolves.toEqual({ data: 1, error: null });
  });
});
