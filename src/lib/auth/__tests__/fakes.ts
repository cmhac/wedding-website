/** Test helper: a minimal fake of the Supabase client pieces the auth helpers use. */
export type FakeOptions = {
  user?: { id: string } | null;
  staffRole?: "couple" | "planner" | null;
  household?: boolean;
  authError?: boolean;
  displayName?: string;
};

export function fakeSupabase(options: FakeOptions = {}) {
  const queries: string[] = [];
  const from = jest.fn((table: string) => {
    queries.push(table);
    const row =
      table === "staff"
        ? options.staffRole
          ? {
              user_id: options.user?.id,
              role: options.staffRole,
              display_name: options.displayName ?? "Test Staff",
            }
          : null
        : table === "households"
          ? options.household
            ? { id: "household-1" }
            : null
          : null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return builder;
  });
  const client = {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: options.user ?? null },
        error: options.authError ? { message: "bad" } : null,
      })),
    },
    from,
  };
  return { client, queries };
}
