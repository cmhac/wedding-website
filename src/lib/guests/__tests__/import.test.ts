import { parseGuestImport } from "../import";

const SLUGS = ["welcome-party", "rehearsal", "ceremony"];
const HEADER =
  "household_ref,household_name,contact_email,plus_one_allowance,first_name,last_name,event:ceremony,event:rehearsal";

const parse = (csv: string) => parseGuestImport(csv, { eventSlugs: SLUGS });

describe("parseGuestImport", () => {
  it("parses a valid household with guests and invitations", () => {
    const r = parse(
      [
        HEADER,
        "h1,Test Household,test@example.com,1,Ann,Example,yes,",
        "h1,Test Household,test@example.com,1,Bob,Example,yes,yes",
      ].join("\n"),
    );
    expect(r.errors).toEqual([]);
    expect(r.households).toHaveLength(1);
    const h = r.households[0];
    expect(h.display_name).toBe("Test Household");
    expect(h.contacts).toEqual(["test@example.com"]);
    expect(h.paper_only).toBe(false);
    expect(h.plus_one_allowance).toBe(1);
    expect(h.guests.map((g) => g.first_name)).toEqual(["Ann", "Bob"]);
    expect(h.guests[0].events).toEqual(["ceremony"]);
    expect(h.guests[1].events.sort()).toEqual(["ceremony", "rehearsal"]);
    expect(h.guests[0].row).toBe(2);
    expect(r.counts).toEqual({ households: 1, guests: 2, invitations: 3 });
  });

  it("accepts a household with no email and marks it paper-only", () => {
    const r = parse(`${HEADER}\nh1,Test Household,,0,Ann,Example,,`);
    expect(r.errors).toEqual([]);
    expect(r.households[0].contacts).toEqual([]);
    expect(r.households[0].paper_only).toBe(true);
  });

  it("defaults the plus-one allowance to 0", () => {
    const r = parse(`${HEADER}\nh1,Test Household,,,Ann,Example,,`);
    expect(r.households[0].plus_one_allowance).toBe(0);
  });

  it("reports missing required columns", () => {
    const r = parse("household_name,first_name\nTest,Ann");
    expect(r.households).toEqual([]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 1, field: "last_name" }),
    ]);
  });

  it("rejects bad emails, with row numbers", () => {
    const r = parse(
      `${HEADER}\nh1,Good,a@example.com,0,Ann,Example,,\nh2,Bad,not-an-email,0,Cy,Example,,`,
    );
    expect(r.households.map((h) => h.display_name)).toEqual(["Good"]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 3, field: "contact_email" }),
    ]);
  });

  it.each(["-1", "1.5", "abc"])("rejects plus_one_allowance %s", (v) => {
    const r = parse(`${HEADER}\nh1,Test,,${v},Ann,Example,,`);
    expect(r.households).toEqual([]);
    expect(r.errors[0]).toMatchObject({ row: 2, field: "plus_one_allowance" });
  });

  it("rejects unknown event slugs", () => {
    const r = parse(
      "household_name,first_name,last_name,event:banquet\nTest,Ann,Example,yes",
    );
    expect(r.households).toEqual([]);
    expect(r.errors[0]).toMatchObject({ row: 2, field: "event:banquet" });
  });

  it("rejects an unrecognised value in an event column", () => {
    const r = parse(`${HEADER}\nh1,Test,,0,Ann,Example,maybe,`);
    expect(r.errors[0]).toMatchObject({ row: 2, field: "event:ceremony" });
  });

  it("does not create a household with any invalid row, but keeps others", () => {
    const r = parse(
      [
        HEADER,
        "h1,Bad,,0,Ann,Example,,",
        "h1,Bad,,0,,Example,,",
        "h2,Fine,,0,Cy,Example,,",
      ].join("\n"),
    );
    expect(r.households.map((h) => h.display_name)).toEqual(["Fine"]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 3, field: "first_name" }),
    ]);
  });

  it("reports blank rows and keeps row numbers", () => {
    const r = parse(
      `${HEADER}\nh1,Test,,0,Ann,Example,,\n\n,,,,,,,\nh2,Other,,0,Cy,Example,,`,
    );
    expect(r.households).toHaveLength(2);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 3, field: "row" }),
      expect.objectContaining({ row: 4, field: "row" }),
    ]);
    expect(r.households[1].guests[0].row).toBe(5);
  });

  it("reports duplicate guests within a household", () => {
    const r = parse(
      `${HEADER}\nh1,Test,,0,Ann,Example,,\nh1,Test,,0,ann,EXAMPLE,,`,
    );
    expect(r.households).toEqual([]);
    expect(r.errors[0]).toMatchObject({ row: 3, field: "row" });
    expect(r.errors[0].message).toMatch(/duplicate/i);
  });

  it("reports conflicting household details across rows", () => {
    const r = parse(
      `${HEADER}\nh1,Test,a@example.com,0,Ann,Example,,\nh1,Test,b@example.com,0,Bob,Example,,`,
    );
    expect(r.households).toEqual([]);
    expect(r.errors[0]).toMatchObject({ row: 3, field: "contact_email" });
  });

  it("groups by household name and email when there is no household_ref", () => {
    const r = parse(
      "household_name,contact_email,first_name,last_name\nTest,a@example.com,Ann,Example\nTest,a@example.com,Bob,Example",
    );
    expect(r.households).toHaveLength(1);
    expect(r.households[0].guests).toHaveLength(2);
  });

  it("reports an unparseable file without throwing", () => {
    const r = parse('household_name,first_name,last_name\n"unclosed,Ann,X');
    expect(r.households).toEqual([]);
    expect(r.errors[0].field).toBe("file");
  });

  it("never puts guest values in error messages", () => {
    const r = parse(
      `${HEADER}\nh1,Secret Family,secret-address,0,Ann,Example,,`,
    );
    expect(JSON.stringify(r.errors)).not.toContain("secret");
  });
});

describe("scale (SC-001)", () => {
  it("processes a generated 150-guest file in under 60 seconds", () => {
    const rows = [HEADER];
    for (let h = 0; h < 50; h++) {
      for (let g = 0; g < 3; g++) {
        rows.push(
          `h${h},Household ${h},h${h}@example.com,1,First${g},Last${h},yes,${g % 2 ? "yes" : ""}`,
        );
      }
    }
    const start = Date.now();
    const r = parse(rows.join("\n"));
    expect(Date.now() - start).toBeLessThan(60_000);
    expect(r.errors).toEqual([]);
    expect(r.counts.households).toBe(50);
    expect(r.counts.guests).toBe(150);
  });
});

describe("several addresses per household", () => {
  const MULTI =
    "household_ref,household_name,contact_email,contact_email_2,contact_email_3,first_name,last_name";

  it("reads contact_email and every contact_email_N column, lower-cased, in column order", () => {
    const r = parse(
      `${MULTI}\nh1,Test,A@Example.com,b@example.com,,Ann,Example\nh1,Test,a@example.com,B@example.com,,Bob,Example`,
    );
    expect(r.errors).toEqual([]);
    expect(r.households[0].contacts).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(r.households[0].paper_only).toBe(false);
  });

  it("reads an address that sits only in a later column", () => {
    const r = parse(`${MULTI}\nh1,Test,,,c@example.com,Ann,Example`);
    expect(r.households[0].contacts).toEqual(["c@example.com"]);
  });

  it("reports an invalid address by row and column and skips the household", () => {
    const r = parse(
      `${MULTI}\nh1,Test,a@example.com,nope,,Ann,Example\nh2,Fine,f@example.com,,,Cy,Example`,
    );
    expect(r.households.map((h) => h.display_name)).toEqual(["Fine"]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 2, field: "contact_email_2" }),
    ]);
  });

  it("reports an address repeated within a row", () => {
    const r = parse(
      `${MULTI}\nh1,Test,a@example.com,A@example.com,,Ann,Example`,
    );
    expect(r.households).toEqual([]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 2, field: "contact_email_2" }),
    ]);
  });

  it("reports an address used by two households in the file, skipping the second", () => {
    const r = parse(
      `${MULTI}\nh1,One,a@example.com,,,Ann,Example\nh2,Two,x@example.com,A@example.com,,Cy,Example`,
    );
    expect(r.households.map((h) => h.display_name)).toEqual(["One"]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 3, field: "contact_email_2" }),
    ]);
  });

  it("reports different address sets across rows of one household", () => {
    const r = parse(
      `${MULTI}\nh1,Test,a@example.com,b@example.com,,Ann,Example\nh1,Test,a@example.com,,,Bob,Example`,
    );
    expect(r.households).toEqual([]);
    expect(r.errors[0]).toMatchObject({ row: 3, field: "contact_email" });
  });

  it("never repeats an address in an error message", () => {
    const r = parse(`${MULTI}\nh1,Test,a@example.com,leak-me,,Ann,Example`);
    expect(JSON.stringify(r.errors)).not.toContain("leak-me");
  });
});

describe("parseGuestImport: phone columns", () => {
  const header =
    "household_name,first_name,last_name,contact_email,contact_phone,contact_phone_2\n";
  const slugs = { eventSlugs: [] as string[] };

  it("reads every phone column as a normalised United States number when texting is configured", () => {
    const csv = `${header}Smith,Ann,Smith,ann@example.test,(202) 555-0123,202-555-0124\n`;
    const result = parseGuestImport(csv, { ...slugs, smsConfigured: true });
    expect(result.errors).toEqual([]);
    expect(result.households[0].phones).toEqual([
      "+12025550123",
      "+12025550124",
    ]);
  });

  it("reports a bad number by row and column without repeating it", () => {
    const csv = `${header}Smith,Ann,Smith,ann@example.test,555-0100,(416) 555-0123\n`;
    const result = parseGuestImport(csv, { ...slugs, smsConfigured: true });
    expect(result.households).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, field: "contact_phone", message: "Not a valid phone number" },
      {
        row: 2,
        field: "contact_phone_2",
        message: "Only United States numbers are supported",
      },
    ]);
    expect(JSON.stringify(result.errors)).not.toMatch(/555/);
  });

  it("refuses a number repeated in a household and one used by another household in the file", () => {
    const csv =
      `${header}Smith,Ann,Smith,,(202) 555-0123,202-555-0123\n` +
      `Jones,Bo,Jones,,(202) 555-0150,\n` +
      `Brown,Cy,Brown,,202.555.0150,\n`;
    const result = parseGuestImport(csv, { ...slugs, smsConfigured: true });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          row: 2,
          field: "contact_phone_2",
          message: "Repeats another number of this household",
        },
        {
          row: 4,
          field: "contact_phone",
          message: "Used by another household in this file",
        },
      ]),
    );
  });

  it("ignores phone columns when texting is not configured, saving nothing and counting what was dropped", () => {
    const csv = `${header}Smith,Ann,Smith,ann@example.test,(202) 555-0123,555-0100\nJones,Bo,Jones,,,\n`;
    const result = parseGuestImport(csv, slugs);
    expect(result.errors).toEqual([]);
    expect(result.households[0]).not.toHaveProperty("phones");
    expect(result.phonesIgnored).toBe(2);
  });

  it("ignores a column that is not a phone consent column", () => {
    const csv = `${header.trim()},sms_consent\nSmith,Ann,Smith,,(202) 555-0123,,yes\n`;
    const result = parseGuestImport(csv, { ...slugs, smsConfigured: true });
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result.households)).not.toMatch(/consent|opted/i);
  });
});

describe("parseGuestImport: phone consent columns", () => {
  const header =
    "household_name,first_name,last_name,contact_phone,contact_phone_consent,contact_phone_2,contact_phone_2_consent\n";
  const slugs = { eventSlugs: [] as string[], smsConfigured: true };

  it("lists the numbers marked yes, in standard form, and leaves the rest alone", () => {
    const csv = `${header}Smith,Ann,Smith,(202) 555-0123,yes,202-555-0124,no\nJones,Bo,Jones,202-555-0150,,,\n`;
    const result = parseGuestImport(csv, slugs);
    expect(result.errors).toEqual([]);
    expect(result.households[0].phones).toEqual([
      "+12025550123",
      "+12025550124",
    ]);
    expect(result.households[0].consented_phones).toEqual(["+12025550123"]);
    expect(result.households[1].consented_phones).toBeUndefined();
  });

  it.each(["y", "Y", "true", "1", "x", "YES"])("reads %s as yes", (value) => {
    const csv = `${header}Smith,Ann,Smith,(202) 555-0123,${value},,\n`;
    expect(parseGuestImport(csv, slugs).households[0].consented_phones).toEqual(
      ["+12025550123"],
    );
  });

  it.each(["n", "false", "0", "NO", ""])("reads %s as not marked", (value) => {
    const csv = `${header}Smith,Ann,Smith,(202) 555-0123,${value},,\n`;
    const result = parseGuestImport(csv, slugs);
    expect(result.errors).toEqual([]);
    expect(result.households[0].consented_phones).toBeUndefined();
  });

  it("reports an unrecognised value by row and column, skipping the household, without repeating it", () => {
    const csv = `${header}Smith,Ann,Smith,(202) 555-0123,maybe-leak-me,,\n`;
    const result = parseGuestImport(csv, slugs);
    expect(result.households).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, field: "contact_phone_consent", message: "Use yes or no" },
    ]);
    expect(JSON.stringify(result.errors)).not.toContain("leak-me");
  });

  it("ignores a yes beside an empty number", () => {
    const csv = `${header}Smith,Ann,Smith,,yes,,\n`;
    const result = parseGuestImport(csv, slugs);
    expect(result.errors).toEqual([]);
    expect(result.households[0].consented_phones).toBeUndefined();
  });

  it("ignores consent columns when texting is not configured", () => {
    const csv = `${header}Smith,Ann,Smith,(202) 555-0123,yes,,maybe\n`;
    const result = parseGuestImport(csv, { eventSlugs: [] });
    expect(result.errors).toEqual([]);
    expect(result.households[0]).not.toHaveProperty("consented_phones");
  });
});
