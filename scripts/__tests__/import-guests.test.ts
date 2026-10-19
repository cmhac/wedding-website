/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import { formatReport, importGuestsFromFile } from "../import-guests";

const HEADER =
  "household_ref,household_name,contact_email,first_name,last_name,event:ceremony";

function fakeAdmin() {
  const rpc = jest.fn(async (_fn: string, _args: object) => ({
    data: {
      created: { households: 1, guests: 1, invitations: 1 },
      errors: [],
    },
    error: null,
  }));
  const households = {
    select: () => households,
    is: () => households,
    not: async () => ({ data: [], error: null }),
  };
  const from = jest.fn((table: string) =>
    table === "events"
      ? { select: async () => ({ data: [{ slug: "ceremony" }], error: null }) }
      : households,
  );
  return { admin: { rpc, from } as never, rpc };
}

const read = (text: string) => async (_path: string) => text;

describe("importGuestsFromFile", () => {
  it("reads the file, imports it, and reports counts only", async () => {
    const { admin, rpc } = fakeAdmin();
    const report = await importGuestsFromFile(
      admin,
      "guests.csv",
      read(`${HEADER}\nh1,Test Household,test@example.com,Ann,Example,yes`),
    );
    expect(rpc).toHaveBeenCalledWith("import_households", expect.anything());
    expect(report).toContain("1 households");
    expect(report).not.toContain("Ann");
    expect(report).not.toContain("example.com");
  });

  it("lists row errors without repeating cell values", async () => {
    const { admin } = fakeAdmin();
    const report = await importGuestsFromFile(
      admin,
      "guests.csv",
      read(`${HEADER}\nh1,Test Household,not-an-email,Ann,Example,yes`),
    );
    expect(report).toMatch(/row 2/i);
    expect(report).toMatch(/contact_email/);
    expect(report).not.toContain("not-an-email");
    expect(report).not.toContain("Ann");
  });

  it("reports an unreadable file as errors", async () => {
    const { admin, rpc } = fakeAdmin();
    const report = await importGuestsFromFile(
      admin,
      "guests.csv",
      read("first_name\nAnn"),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(report).toMatch(/not imported|could not be read/i);
  });
});

describe("formatReport", () => {
  it("formats counts and errors on separate lines", () => {
    const text = formatReport({
      kind: "done",
      created: { households: 2, guests: 5, invitations: 7 },
      errors: [{ row: 3, field: "email", message: "Invalid email" }],
    });
    expect(text).toContain("2 households, 5 guests, 7 invitations");
    expect(text).toContain("Row 3 (email): Invalid email");
  });
});
