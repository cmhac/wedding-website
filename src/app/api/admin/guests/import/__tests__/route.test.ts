/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ fake: "admin" }),
}));
const mockLink = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  linkHouseholdAccounts: (...a: unknown[]) => mockLink(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { makeXlsx } from "@/lib/guests/__tests__/fixtures/make-xlsx";
import { POST } from "../route";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER =
  "household_ref,household_name,contact_email,first_name,last_name,event:ceremony";

const rpc = jest.fn();
const sessionClient = {
  from: () => ({
    select: async () => ({ data: [{ slug: "ceremony" }], error: null }),
  }),
  rpc: (...a: unknown[]) => rpc(...a),
};

const request = (csv: string) =>
  new Request("http://localhost:3000/api/admin/guests/import", {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
  });

const xlsxRequest = (bytes: Uint8Array, type: string | null = XLSX_TYPE) =>
  new Request("http://localhost:3000/api/admin/guests/import", {
    method: "POST",
    headers: type ? { "content-type": type } : {},
    body: bytes as unknown as BodyInit,
  });

const valid = [
  HEADER,
  "h1,Test Household,test@example.com,Ann,Example,yes",
  "h1,Test Household,test@example.com,Bob,Example,",
].join("\n");

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: sessionClient,
  });
  rpc.mockResolvedValue({
    data: {
      created: { households: 1, guests: 2, invitations: 1 },
      errors: [],
      household_ids: [{ ref: "h1", household_id: "hh-1" }],
    },
    error: null,
  });
  mockLink.mockResolvedValue({ linked: 1, failed: 0 });
});

describe("POST /api/admin/guests/import", () => {
  it("returns 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await POST(request(valid))).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await POST(request(valid))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("imports a valid CSV and returns the created counts with no errors", async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      created: { households: 1, guests: 2, invitations: 1 },
      errors: [],
      source: { format: "csv" },
    });
    expect(rpc).toHaveBeenCalledWith(
      "import_households",
      expect.objectContaining({ rows: expect.any(Array) }),
    );
  });

  it("links sign-in accounts for the new households only, attributed to the staff member", async () => {
    await POST(request(valid));
    expect(mockLink).toHaveBeenCalledWith({ fake: "admin" }, ["hh-1"], {
      staff: sessionClient,
    });
  });

  it("returns the bad row's error and still creates the valid households", async () => {
    const csv = [valid, "h2,Other Household,not-an-email,Cy,Example,"].join(
      "\n",
    );
    const res = await POST(request(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created.households).toBe(1);
    expect(json.errors).toEqual([
      expect.objectContaining({ row: 4, field: "contact_email" }),
    ]);
    expect(JSON.stringify(json.errors)).not.toContain("not-an-email");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 422 for an empty body and for a file missing required columns", async () => {
    expect((await POST(request(""))).status).toBe(422);
    const res = await POST(request("first_name\nAnn"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_file");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 500 when the database call fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(request(valid))).status).toBe(500);
  });
});

const HEADER_CELLS = [
  "household_ref",
  "household_name",
  "contact_email",
  "first_name",
  "last_name",
  "event:ceremony",
];
const ROWS = [
  HEADER_CELLS,
  ["h1", "Test Household", "test@example.com", "Ann", "Example", "yes"],
  ["h1", "Test Household", "test@example.com", "Bob", "Example", null],
  ["h2", "Other Household", "not-an-email", "Cy", "Example", null],
];
const csvOf = (rows: (string | null)[][]) =>
  rows.map((r) => r.map((c) => c ?? "").join(",")).join("\n");

describe("POST /api/admin/guests/import with an .xlsx file", () => {
  const twoSheets = (rows = ROWS, blank = 0) =>
    makeXlsx({
      sheets: [
        { name: "Guest list", rows },
        { name: "Notes", rows: [["ignored"]] },
      ],
      blankRowsBeforeHeader: blank,
    });

  it("returns the same created counts and errors as the equivalent CSV", async () => {
    const fromCsv = await (await POST(request(csvOf(ROWS)))).json();
    const res = await POST(xlsxRequest(twoSheets()));
    expect(res.status).toBe(200);
    const fromXlsx = await res.json();
    expect(fromXlsx.created).toEqual(fromCsv.created);
    expect(fromXlsx.errors).toEqual(fromCsv.errors);
    expect(fromXlsx.errors).toEqual([
      expect.objectContaining({ row: 4, field: "contact_email" }),
    ]);
  });

  it("reports the sheet that was read, and always reports source", async () => {
    const xlsx = await (await POST(xlsxRequest(twoSheets()))).json();
    expect(xlsx.source).toEqual({
      format: "xlsx",
      sheet: { name: "Guest list", index: 1, count: 2 },
    });
    const csv = await (await POST(request(valid))).json();
    expect(csv.source).toEqual({ format: "csv" });
  });

  it("reports Excel's own row numbers when blank rows come before the header", async () => {
    const res = await POST(xlsxRequest(twoSheets(ROWS, 3)));
    const json = await res.json();
    expect(json.created.households).toBe(1);
    expect(json.errors).toEqual([
      expect.objectContaining({ row: 7, field: "contact_email" }),
    ]);
  });

  it("treats an unknown or missing content type as CSV", async () => {
    const csv = new TextEncoder().encode(valid);
    for (const type of ["application/octet-stream", null]) {
      const res = await POST(xlsxRequest(csv, type));
      expect(res.status).toBe(200);
      expect((await res.json()).source).toEqual({ format: "csv" });
    }
  });

  const cases: [string, Uint8Array, string][] = [
    [
      "corrupt bytes",
      new Uint8Array([1, 2, 3, 4]),
      "This file could not be read. Upload a .csv or .xlsx file.",
    ],
    [
      "an old .xls file",
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
      "This file could not be read. Upload a .csv or .xlsx file.",
    ],
    [
      "an empty first sheet",
      makeXlsx({ sheets: [{ name: "Guest list", rows: [] }] }),
      "The file is empty.",
    ],
    [
      "more than 5,000 rows",
      makeXlsx({
        sheets: [
          {
            name: "Guest list",
            rows: [
              HEADER_CELLS,
              ...Array.from({ length: 5000 }, () => [
                "h",
                "Test",
                null,
                "A",
                "B",
                null,
              ]),
            ],
          },
        ],
      }),
      "The file has too many rows.",
    ],
  ];
  it.each(cases)(
    "returns 422 invalid_file for %s",
    async (_name, bytes, message) => {
      const res = await POST(xlsxRequest(bytes));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_file");
      expect(body.error.message).toBe(message);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("never repeats cell values in an error", async () => {
    const rows = [
      ["household_name", "first_name"],
      ["Secret Family", "Hidden"],
    ];
    const res = await POST(
      xlsxRequest(makeXlsx({ sheets: [{ name: "S", rows }] })),
    );
    expect(res.status).toBe(422);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("Hidden");
  });

  it("still enforces the 2 MiB limit on bytes, for both formats", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1).fill(97);
    for (const type of [XLSX_TYPE, "text/csv"]) {
      const res = await POST(xlsxRequest(big, type));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_file");
      expect(body.error.message).toBe("The file is too large.");
    }
  });
});
