/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import { runGuestImport } from "../run-import";

const HEADER =
  "household_ref,household_name,contact_email,first_name,last_name,event:ceremony";

function fakeClient(rpcResult?: { data: unknown; error: unknown }) {
  const rpc = jest.fn(
    async (_fn: string, _args: object) =>
      rpcResult ?? {
        data: {
          created: { households: 1, guests: 2, invitations: 2 },
          errors: [],
          household_ids: [{ ref: "h1", household_id: "hh-1" }],
        },
        error: null,
      },
  );
  const from = jest.fn((_table: string) => ({
    select: async () => ({
      data: [{ slug: "ceremony" }, { slug: "rehearsal" }],
      error: null,
    }),
  }));
  return { client: { rpc, from } as never, rpc, from };
}

const valid = [
  HEADER,
  "h1,Test Household,test@example.com,Ann,Example,yes",
  "h1,Test Household,test@example.com,Bob,Example,yes",
].join("\n");

describe("runGuestImport", () => {
  it("parses against the stored event slugs and calls import_households once", async () => {
    const { client, rpc, from } = fakeClient();
    const res = await runGuestImport(client, valid);
    expect(from).toHaveBeenCalledWith("events");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("import_households");
    const rows = (rpc.mock.calls[0][1] as { rows: { guests: unknown[] }[] })
      .rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].guests).toHaveLength(2);
    expect(res).toEqual({
      kind: "done",
      created: { households: 1, guests: 2, invitations: 2 },
      errors: [],
      householdIds: ["hh-1"],
      accounts: { linked: 0, failed: 0 },
    });
  });

  it("returns row errors from parsing and still imports the valid households", async () => {
    const { client, rpc } = fakeClient();
    const csv = [valid, "h2,Other Household,not-an-email,Cy,Example,"].join(
      "\n",
    );
    const res = await runGuestImport(client, csv);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.kind).toBe("done");
    if (res.kind === "done") {
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].row).toBe(4);
    }
  });

  it("merges row errors reported by the database, ordered by row", async () => {
    const { client } = fakeClient({
      data: {
        created: { households: 0, guests: 0, invitations: 0 },
        errors: [{ row: 2, field: "household", message: "Rejected" }],
      },
      error: null,
    });
    const csv = [valid, "h2,Other Household,bad,Cy,Example,"].join("\n");
    const res = await runGuestImport(client, csv);
    expect(res.kind === "done" && res.errors.map((e) => e.row)).toEqual([2, 4]);
  });

  it("returns an invalid-file result without calling the database", async () => {
    const { client, rpc } = fakeClient();
    const res = await runGuestImport(client, "first_name\nAnn");
    expect(res.kind).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips the database call when no household is valid", async () => {
    const { client, rpc } = fakeClient();
    const res = await runGuestImport(
      client,
      [HEADER, "h1,Test,bad-email,Ann,Example,"].join("\n"),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(res.kind === "done" && res.created.households).toBe(0);
  });

  it("throws a message free of guest data when the database call fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "x@y.z" } });
    await expect(runGuestImport(client, valid)).rejects.toThrow(
      "The import could not be completed.",
    );
  });
});

describe("runGuestImport sign-in accounts", () => {
  function fakeAdmin(
    options: { createFails?: boolean; updateFails?: boolean } = {},
  ) {
    let n = 1;
    const createUser = jest.fn(async (_attrs: { email: string }) =>
      options.createFails
        ? { data: { user: null }, error: { code: "x" } }
        : { data: { user: { id: `user-${n++}` } }, error: null },
    );
    const deleteUser = jest.fn(async (_id: string) => ({ error: null }));
    const eq = jest.fn(async (_c: string, _v: string) => ({
      error: options.updateFails ? { message: "boom" } : null,
    }));
    const update = jest.fn((_values: object) => ({ eq }));
    const from = jest.fn((_table: string) => ({ update }));
    return {
      admin: { auth: { admin: { createUser, deleteUser } }, from } as never,
      createUser,
      deleteUser,
      update,
      eq,
      from,
    };
  }

  it("gives every imported household a synthetic sign-in account and links it", async () => {
    const { client } = fakeClient();
    const a = fakeAdmin();
    const res = await runGuestImport(client, valid, a.admin);
    expect(a.createUser).toHaveBeenCalledTimes(1);
    expect(a.createUser.mock.calls[0][0].email).toBe(
      "household-hh-1@households.invalid",
    );
    expect(a.from).toHaveBeenCalledWith("households");
    expect(a.update).toHaveBeenCalledWith({ auth_user_id: "user-1" });
    expect(a.eq).toHaveBeenCalledWith("id", "hh-1");
    expect(res.kind === "done" && res.accounts).toEqual({
      linked: 1,
      failed: 0,
    });
  });

  it("returns counts only, never an address", async () => {
    const { client } = fakeClient();
    const a = fakeAdmin();
    const res = await runGuestImport(client, valid, a.admin);
    expect(JSON.stringify(res)).not.toContain("test@example.com");
  });

  it("counts a failed account and removes any account it could not link", async () => {
    const { client } = fakeClient();
    const a = fakeAdmin({ updateFails: true });
    const res = await runGuestImport(client, valid, a.admin);
    expect(a.deleteUser).toHaveBeenCalledWith("user-1");
    expect(res.kind === "done" && res.accounts).toEqual({
      linked: 0,
      failed: 1,
    });
  });

  it("counts a failure when the account cannot be created", async () => {
    const { client } = fakeClient();
    const a = fakeAdmin({ createFails: true });
    const res = await runGuestImport(client, valid, a.admin);
    expect(res.kind === "done" && res.accounts).toEqual({
      linked: 0,
      failed: 1,
    });
  });

  it("creates no accounts when nothing was imported", async () => {
    const { client } = fakeClient();
    const a = fakeAdmin();
    await runGuestImport(
      client,
      [HEADER, "h1,Test,bad-email,Ann,Example,"].join("\n"),
      a.admin,
    );
    expect(a.createUser).not.toHaveBeenCalled();
  });
});

describe("runGuestImport: phone consent marks", () => {
  const csv = [
    "household_ref,household_name,first_name,last_name,contact_phone,contact_phone_consent,contact_phone_2,contact_phone_2_consent",
    "h1,Test Household,Ann,Example,(202) 555-0123,yes,(202) 555-0124,",
  ].join("\n");

  function adminClient(consent: { message?: string } | null = null) {
    const rpc = jest.fn(async (fn: string, _args: object) => ({
      data: fn === "import_phone_consent" ? { result: "marked" } : null,
      error: fn === "import_phone_consent" ? consent : null,
    }));
    const from = jest.fn(() => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }));
    return {
      admin: {
        rpc,
        from,
        auth: {
          admin: {
            createUser: async () => ({
              data: { user: { id: "u1" } },
              error: null,
            }),
            deleteUser: async () => ({}),
          },
        },
      } as never,
      rpc,
    };
  }

  it("records each number marked yes as imported, by the staff member who imported, and nothing for the rest", async () => {
    const { client } = fakeClient();
    const { admin, rpc } = adminClient();
    const res = await runGuestImport(client, csv, admin, {
      smsConfigured: true,
      importedBy: "staff-1",
    });
    expect(rpc).toHaveBeenCalledWith("import_phone_consent", {
      household_id: "hh-1",
      value: "+12025550123",
      marked_by: "staff-1",
      override_declined: false,
    });
    const marks = rpc.mock.calls.filter((c) => c[0] === "import_phone_consent");
    expect(marks).toHaveLength(1);
    expect(res).toMatchObject({
      kind: "done",
      phonesSaved: 2,
      phonesConsented: 1,
    });
  });

  it("reports a mark that was not saved by row and column, and carries on", async () => {
    const { client } = fakeClient();
    const { admin } = adminClient({ message: "boom +12025550123" });
    const res = await runGuestImport(client, csv, admin, {
      smsConfigured: true,
      importedBy: "staff-1",
    });
    expect(res).toMatchObject({ kind: "done", phonesSaved: 2 });
    if (res.kind !== "done") throw new Error("unexpected");
    expect(res.phonesConsented).toBeUndefined();
    expect(res.errors).toContainEqual({
      row: 2,
      field: "contact_phone_consent",
      message: "The consent mark was not saved",
    });
    expect(JSON.stringify(res.errors)).not.toContain("555");
  });

  it("marks nothing when texting is not configured", async () => {
    const { client } = fakeClient();
    const { admin, rpc } = adminClient();
    await runGuestImport(client, csv, admin, { smsConfigured: false });
    expect(rpc.mock.calls.some((c) => c[0] === "import_phone_consent")).toBe(
      false,
    );
  });
});
