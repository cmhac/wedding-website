/** @jest-environment node */
import { runGuestImport } from "../run-import";

const csv =
  "household_ref,household_name,first_name,last_name,contact_email,contact_phone\n" +
  "a,Smith,Ann,Smith,ann@example.test,(202) 555-0123\n" +
  "b,Jones,Bo,Jones,,(202) 555-0150\n";

function setup(
  options: {
    addPhone?: (args: Record<string, unknown>) => {
      error: { message: string } | null;
    };
  } = {},
) {
  const importRpc = jest.fn(
    async (_fn: string, args: { rows: { ref: string }[] }) => ({
      data: {
        created: {
          households: args.rows.length,
          guests: args.rows.length,
          invitations: 0,
        },
        errors: [],
        household_ids: args.rows.map((r) => ({
          ref: r.ref,
          household_id: `hid-${r.ref}`,
        })),
      },
      error: null,
    }),
  );
  const supabase = {
    from: () => ({ select: async () => ({ data: [], error: null }) }),
    rpc: importRpc,
  };
  const addPhone = jest.fn(
    async (_fn: string, args: Record<string, unknown>) =>
      options.addPhone
        ? { data: "cid", ...options.addPhone(args) }
        : { data: "cid", error: null },
  );
  const admin = {
    rpc: addPhone,
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    auth: {
      admin: {
        createUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
        deleteUser: jest.fn(),
      },
    },
  };
  return {
    supabase: supabase as never,
    admin: admin as never,
    addPhone,
    importRpc,
  };
}

describe("runGuestImport with phone numbers", () => {
  it("saves each number to its new household through the service-role function, never with a consent value", async () => {
    const { supabase, admin, addPhone } = setup();
    const result = await runGuestImport(supabase, csv, admin, {
      smsConfigured: true,
    });
    expect(result.kind).toBe("done");
    expect(
      addPhone.mock.calls
        .filter((c) => c[0] === "add_phone_contact")
        .map((c) => c[1]),
    ).toEqual([
      { household_id: "hid-a", value: "+12025550123" },
      { household_id: "hid-b", value: "+12025550150" },
    ]);
    expect(JSON.stringify(addPhone.mock.calls)).not.toMatch(/consent/i);
    if (result.kind === "done") expect(result.phonesSaved).toBe(2);
  });

  it("reports a number another household already has, by row and column, and carries on", async () => {
    const { supabase, admin } = setup({
      addPhone: (args) =>
        args.value === "+12025550123"
          ? { error: { message: "phone_in_use" } }
          : { error: null },
    });
    const result = await runGuestImport(supabase, csv, admin, {
      smsConfigured: true,
    });
    if (result.kind !== "done") throw new Error("expected done");
    expect(result.errors).toContainEqual({
      row: 2,
      field: "contact_phone",
      message: "Already used by another household",
    });
    expect(result.phonesSaved).toBe(1);
  });

  it("saves nothing and says so when texting is not configured", async () => {
    const { supabase, admin, addPhone } = setup();
    const result = await runGuestImport(supabase, csv, admin, {
      smsConfigured: false,
    });
    expect(
      addPhone.mock.calls.filter((c) => c[0] === "add_phone_contact"),
    ).toHaveLength(0);
    if (result.kind === "done") expect(result.phonesIgnored).toBe(2);
  });

  it("does not save numbers without the service-role client, and counts them as ignored", async () => {
    const { supabase } = setup();
    const result = await runGuestImport(supabase, csv, undefined, {
      smsConfigured: true,
    });
    if (result.kind === "done") {
      expect(result.phonesSaved ?? 0).toBe(0);
      expect(result.phonesIgnored).toBe(2);
    }
  });
});
