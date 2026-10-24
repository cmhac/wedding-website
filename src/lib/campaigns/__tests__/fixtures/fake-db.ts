/**
 * A tiny in-memory stand-in for the Supabase client, for the campaign tests.
 * It supports only the query shapes the campaign code uses. Fake data only.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string } | null };

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb(
  initial: Record<string, Row[]> = {},
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const rpcCalls: { fn: string; args: Row }[] = [];
  const writes: { table: string; op: string; value: unknown }[] = [];
  let nextId = 1;

  class Query implements PromiseLike<Result> {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "upsert" | "update" = "select";
    private payload: Row | Row[] = [];
    private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    constructor(private table: string) {}

    select() {
      return this;
    }
    insert(rows: Row | Row[]) {
      this.op = "insert";
      this.payload = rows;
      return this;
    }
    upsert(rows: Row | Row[], opts = {}) {
      this.op = "upsert";
      this.payload = rows;
      this.opts = opts;
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push((r) => r[col] === value);
      return this;
    }
    in(col: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[col]));
      return this;
    }
    order() {
      return this;
    }
    maybeSingle() {
      return this.run().then((res) => ({
        ...res,
        data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data,
      }));
    }
    single() {
      return this.maybeSingle();
    }
    then<A, B>(
      onfulfilled?: ((v: Result) => A | PromiseLike<A>) | null,
      onrejected?: ((e: unknown) => B | PromiseLike<B>) | null,
    ) {
      return this.run().then(onfulfilled, onrejected);
    }

    private async run(): Promise<Result> {
      const rows = (tables[this.table] ??= []);
      const match = (r: Row) => this.filters.every((f) => f(r));
      if (this.op === "select") {
        return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
      }
      writes.push({ table: this.table, op: this.op, value: this.payload });
      if (this.op === "update") {
        for (const r of rows.filter(match)) Object.assign(r, this.payload);
        return { data: null, error: null };
      }
      const incoming = Array.isArray(this.payload)
        ? this.payload
        : [this.payload];
      const keys = (this.opts.onConflict ?? "").split(",").filter(Boolean);
      for (const row of incoming) {
        const existing = keys.length
          ? rows.find((r) => keys.every((k) => r[k] === row[k]))
          : undefined;
        if (existing) {
          if (this.op === "insert") {
            return { data: null, error: { code: "23505" } };
          }
          if (!this.opts.ignoreDuplicates) Object.assign(existing, row);
          continue;
        }
        rows.push({ id: `id-${nextId++}`, ...row });
      }
      return { data: null, error: null };
    }
  }

  return {
    tables,
    rpcCalls,
    writes,
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Row = {}): Promise<Result> => {
      rpcCalls.push({ fn, args });
      const handler = rpcs[fn];
      if (!handler) return { data: null, error: { code: "no_such_rpc" } };
      try {
        return { data: handler(args), error: null };
      } catch {
        return { data: null, error: { code: "rpc_failed" } };
      }
    },
  };
}
