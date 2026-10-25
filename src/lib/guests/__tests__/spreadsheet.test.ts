/** @jest-environment node */
import { parseGuestImport } from "../import";
import { SpreadsheetError, xlsxToCsv } from "../spreadsheet";
import { makeXlsx } from "./fixtures/make-xlsx";

const HEADER = ["household_name", "first_name", "last_name", "contact_email"];
const opts = { eventSlugs: [] as string[] };

const book = (rows: Parameters<typeof makeXlsx>[0]["sheets"][0]["rows"]) =>
  makeXlsx({ sheets: [{ name: "Guest list", rows }] });

async function failure(bytes: Uint8Array) {
  try {
    await xlsxToCsv(bytes);
  } catch (e) {
    return e;
  }
  throw new Error("expected xlsxToCsv to throw");
}

describe("xlsxToCsv", () => {
  it("reads the first sheet and says which sheet it was", async () => {
    const bytes = makeXlsx({
      sheets: [
        {
          name: "Guest list",
          rows: [HEADER, ["Test House", "Ann", "Ex", null]],
        },
        { name: "Other", rows: [["ignored"]] },
      ],
    });
    const out = await xlsxToCsv(bytes);
    expect(out.sheet).toEqual({ name: "Guest list", index: 1, count: 2 });
    expect(out.csv.split("\n")[0]).toBe(HEADER.join(","));
    expect(out.csv).not.toContain("ignored");
  });

  it("converts cells as the contract says", async () => {
    const out = await xlsxToCsv(
      book([
        ["text", "num", "float", "bool", "no", "date", "empty", "end"],
        [
          "  padded  ",
          42,
          2.5,
          true,
          false,
          new Date(Date.UTC(2027, 5, 12)),
          null,
          "x",
        ],
      ]),
    );
    expect(out.csv.split("\n")[1]).toBe(
      "padded,42,2.5,true,false,2027-06-12,,x",
    );
  });

  it("escapes commas, quotes and line breaks so the parser reads the same values", async () => {
    const tricky = 'Smith, "Jo"\nand family';
    const out = await xlsxToCsv(
      book([HEADER, [tricky, "Ann", "Ex", "a@example.com"]]),
    );
    const parsed = parseGuestImport(out.csv, opts);
    expect(parsed.errors).toEqual([]);
    expect(parsed.households[0].display_name).toBe(tricky);
  });

  it("matches the CSV import for the same data", async () => {
    const rows = [
      HEADER,
      ["Test House", "Ann", "Ex", "ann@example.com"],
      ["Bad House", "Bob", "Ex", "not-an-email"],
    ];
    const fromXlsx = parseGuestImport((await xlsxToCsv(book(rows))).csv, opts);
    const fromCsv = parseGuestImport(
      rows.map((r) => r.join(",")).join("\n"),
      opts,
    );
    expect(fromXlsx).toEqual(fromCsv);
  });

  describe("blank rows before the header (research open point 1)", () => {
    const rows = [
      HEADER,
      ["Test House", "Ann", "Ex", "ann@example.com"],
      ["Bad House", "Bob", "Ex", "not-an-email"],
    ];

    it("read-excel-file keeps leading blank rows, so they are dropped here and counted in rowOffset", async () => {
      const out = await xlsxToCsv(
        makeXlsx({ sheets: [{ name: "S", rows }], blankRowsBeforeHeader: 3 }),
      );
      expect(out.rowOffset).toBe(3);
      expect(out.csv.split("\n")[0]).toBe(HEADER.join(","));
    });

    it("error row numbers plus rowOffset equal the sheet's own rows", async () => {
      const out = await xlsxToCsv(
        makeXlsx({ sheets: [{ name: "S", rows }], blankRowsBeforeHeader: 3 }),
      );
      const parsed = parseGuestImport(out.csv, opts);
      // The bad row is row 3 of the sheet from the header, row 6 in Excel.
      expect(parsed.errors).toEqual([
        expect.objectContaining({ row: 3, field: "contact_email" }),
      ]);
      expect(parsed.errors[0].row + out.rowOffset).toBe(6);
    });

    it("has no offset when the header is the first row", async () => {
      expect((await xlsxToCsv(book(rows))).rowOffset).toBe(0);
    });
  });

  describe("errors", () => {
    it("rejects corrupt bytes as unreadable", async () => {
      const e = await failure(new Uint8Array([1, 2, 3, 4]));
      expect(e).toBeInstanceOf(SpreadsheetError);
      expect((e as SpreadsheetError).reason).toBe("unreadable");
    });

    it("rejects an old .xls (OLE2 header) as unreadable", async () => {
      const ole = new Uint8Array([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0,
      ]);
      expect(((await failure(ole)) as SpreadsheetError).reason).toBe(
        "unreadable",
      );
    });

    it("rejects an empty first sheet", async () => {
      const e = await failure(book([]));
      expect((e as SpreadsheetError).reason).toBe("empty");
    });

    it("rejects a first sheet that only has blank cells", async () => {
      const e = await failure(book([[null, null], [null]]));
      expect((e as SpreadsheetError).reason).toBe("empty");
    });

    it("accepts 5,000 rows and rejects 5,001", async () => {
      const row = ["Test House", "Ann", "Ex", null];
      const make = (n: number) =>
        book([HEADER, ...Array.from({ length: n - 1 }, () => row)]);
      await expect(xlsxToCsv(make(5000))).resolves.toBeDefined();
      const e = await failure(make(5001));
      expect((e as SpreadsheetError).reason).toBe("too_many_rows");
    });

    it("never puts cell values in an error message", async () => {
      const e = await failure(new Uint8Array([1, 2, 3]));
      expect((e as Error).message).not.toMatch(/\d/);
    });
  });
});
