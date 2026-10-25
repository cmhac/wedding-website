/** @jest-environment node */
import readXlsx, { readSheet } from "read-excel-file/node";
import { makeXlsx } from "./make-xlsx";

const sheets = [
  {
    name: "Guest list",
    rows: [
      ["a", "b"],
      ["x", 1],
    ],
  },
  { name: "Notes", rows: [["only"]] },
];

describe("makeXlsx", () => {
  it("returns bytes that read-excel-file reads back", async () => {
    const bytes = makeXlsx({ sheets });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const data = await readSheet(Buffer.from(bytes));
    expect(data).toEqual([
      ["a", "b"],
      ["x", 1],
    ]);
  });

  it("lists every sheet name from the default export (research open point 2)", async () => {
    const all = await readXlsx(Buffer.from(makeXlsx({ sheets })));
    expect(all.map((s) => s.sheet)).toEqual(["Guest list", "Notes"]);
    expect(all[1].data).toEqual([["only"]]);
  });

  it("writes booleans, numbers and dates as typed cells", async () => {
    const bytes = makeXlsx({
      sheets: [
        {
          name: "Types",
          rows: [[true, 2.5, new Date(Date.UTC(2027, 5, 12)), "t", null, "z"]],
        },
      ],
    });
    const rows = await readSheet(Buffer.from(bytes));
    const row = rows[0] as unknown[];
    expect(row[0]).toBe(true);
    expect(row[1]).toBe(2.5);
    expect(row[2]).toBeInstanceOf(Date);
    expect((row[2] as Date).toISOString().slice(0, 10)).toBe("2027-06-12");
    expect(row[3]).toBe("t");
    expect(row[4]).toBeNull();
  });
});
