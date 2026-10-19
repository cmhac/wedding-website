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
