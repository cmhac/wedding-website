/**
 * A tiny in-memory stand-in for the Supabase client, for the campaign tests.
 * It supports only the query shapes the campaign code uses. Fake data only.
 */
type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string };
type Result = { data: unknown; error: DbError | null };
type CannedRpc = { data?: unknown; error?: DbError };

export type FakeDbOptions = {
  /** Canned rpc results, used before any handler. */
  rpcResults?: Record<string, CannedRpc>;
  /** single() errors unless exactly one row matches (as Supabase does). */
  strictSingle?: boolean;
};

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb(
  initial: Record<string, Row[]> = {},
  rpcs: Record<string, (args: Row) => unknown> = {},
  options: FakeDbOptions = {},
) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const rpcCalls: { fn: string; args: Row }[] = [];
  const writes: { table: string; op: string; value: unknown }[] = [];
  const failures: Record<string, DbError[]> = {};
  let nextId = 1;

  class Query implements PromiseLike<Result> {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    private sort: { col: string; ascending: boolean }[] = [];
    private window: [number, number] | null = null;
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
    ilike(col: string, pattern: string) {
      const source = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      const re = new RegExp(`^${source}$`, "i");
      this.filters.push((r) => typeof r[col] === "string" && re.test(r[col]));
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    order(col?: string, opts: { ascending?: boolean } = {}) {
      if (col) this.sort.push({ col, ascending: opts.ascending ?? true });
      return this;
    }
    range(from: number, to: number) {
      this.window = [from, to];
      return this;
    }
    maybeSingle() {
      return this.run().then((res) => {
        if (res.error) return { ...res, data: null };
        const list = Array.isArray(res.data) ? res.data : [res.data];
        if (options.strictSingle && list.length > 1) {
          return {
            data: null,
            error: { code: "PGRST116", message: "More than one row" },
          };
        }
        return { ...res, data: list[0] ?? null };
      });
    }
    single() {
      if (!options.strictSingle) return this.maybeSingle();
      return this.run().then((res) => {
        if (res.error) return { ...res, data: null };
        const list = Array.isArray(res.data) ? res.data : [res.data];
        return list.length === 1
          ? { data: list[0], error: null }
          : {
              data: null,
              error: { code: "PGRST116", message: "Expected one row" },
            };
      });
    }
    then<A, B>(
      onfulfilled?: ((v: Result) => A | PromiseLike<A>) | null,
      onrejected?: ((e: unknown) => B | PromiseLike<B>) | null,
    ) {
      return this.run().then(onfulfilled, onrejected);
    }

    private async run(): Promise<Result> {
      const failure = failures[this.table]?.shift();
      if (failure) return { data: null, error: failure };
      const rows = (tables[this.table] ??= []);
      const match = (r: Row) => this.filters.every((f) => f(r));
      if (this.op === "select") {
        let found = rows.filter(match).map((r) => ({ ...r }));
        for (const { col, ascending } of [...this.sort].reverse()) {
          found = found.sort((a, b) => {
            const x = a[col] as string | number;
            const y = b[col] as string | number;
            return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
          });
        }
        if (this.window)
          found = found.slice(this.window[0], this.window[1] + 1);
        return { data: found, error: null };
      }
      if (this.op === "delete") {
        writes.push({ table: this.table, op: "delete", value: null });
        for (let i = rows.length - 1; i >= 0; i--) {
          if (match(rows[i])) rows.splice(i, 1);
        }
        return { data: null, error: null };
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
    /** Makes the next query on `table` (or the next rpc named so) fail. */
    failNext: (name: string, error: DbError) => {
      (failures[name] ??= []).push(error);
    },
    rpc: async (fn: string, args: Row = {}): Promise<Result> => {
      rpcCalls.push({ fn, args });
      const failure = failures[fn]?.shift();
      if (failure) return { data: null, error: failure };
      const canned = options.rpcResults?.[fn];
      if (canned)
        return { data: canned.data ?? null, error: canned.error ?? null };
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
