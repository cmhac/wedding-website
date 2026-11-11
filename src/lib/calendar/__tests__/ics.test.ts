/** @jest-environment node */
import { buildIcs, nextDay, foldLine, escapeText } from "../ics";

const entry = {
  date: "2027-09-18",
  title: "Chris & Hannah's wedding",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  siteUrl: "https://hannahandchris.wedding",
  revision: 3,
};
const now = new Date("2026-11-12T10:00:00Z");

describe("nextDay", () => {
  it.each([
    ["2027-09-18", "2027-09-19"],
    ["2027-01-31", "2027-02-01"],
    ["2027-12-31", "2028-01-01"],
    ["2028-02-28", "2028-02-29"],
    ["2028-02-29", "2028-03-01"],
    ["2027-02-28", "2027-03-01"],
  ])("%s is followed by %s", (date, expected) => {
    expect(nextDay(date)).toBe(expected);
  });

  it("refuses something that is not a calendar date", () => {
    expect(() => nextDay("2027-13-01")).toThrow();
    expect(() => nextDay("2027-02-30")).toThrow();
    expect(() => nextDay("tomorrow")).toThrow();
  });
});

describe("escapeText and foldLine", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\;c\\,d\\ne");
  });

  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds a long line at 75 octets with a leading space on each continuation", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const [i, part] of parts.entries()) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      `DESCRIPTION:${"x".repeat(200)}`,
    );
  });

  it("never splits a multi-byte character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(100)}`);
    const joined = folded
      .split("\r\n")
      .map((p, i) => (i ? p.slice(1) : p))
      .join("");
    expect(joined).toBe(`SUMMARY:${"é".repeat(100)}`);
  });
});

describe("buildIcs", () => {
  const ics = buildIcs(entry, now);
  const lines = ics.split("\r\n");

  it("is a calendar with one event, with CRLF line endings", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.at(-1)).toBe("");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("is an all-day entry on exactly one day, the end being exclusive", () => {
    expect(lines).toContain("DTSTART;VALUE=DATE:20270918");
    expect(lines).toContain("DTEND;VALUE=DATE:20270919");
    expect(lines).toContain("X-MICROSOFT-CDO-ALLDAYEVENT:TRUE");
    expect(ics).not.toMatch(/DTSTART:/);
  });

  it("ends the day after across a month, a year and a leap day", () => {
    expect(buildIcs({ ...entry, date: "2027-12-31" }, now)).toContain(
      "DTEND;VALUE=DATE:20280101",
    );
    expect(buildIcs({ ...entry, date: "2028-02-29" }, now)).toContain(
      "DTEND;VALUE=DATE:20280301",
    );
  });

  it("has a stable identity and a revision that follows the details", () => {
    expect(lines).toContain("UID:save-the-date@hannahandchris.wedding");
    expect(lines).toContain("SEQUENCE:3");
    const later = buildIcs({ ...entry, revision: 4, place: "Elsewhere" }, now);
    expect(later).toContain("UID:save-the-date@hannahandchris.wedding");
    expect(later).toContain("SEQUENCE:4");
  });

  it("carries the title, place, and a description with the note and the site address", () => {
    expect(ics).toContain("SUMMARY:Chris & Hannah's wedding");
    expect(ics).toContain("LOCATION:Napa Valley\\, California");
    expect(ics).toContain(
      "DESCRIPTION:Invitation to follow\\nhttps://hannahandchris.wedding",
    );
    expect(ics).toContain("URL:https://hannahandchris.wedding");
  });

  it("leaves out the place and the note when there are none", () => {
    const bare = buildIcs({ ...entry, place: null, note: null }, now);
    expect(bare).not.toContain("LOCATION:");
    expect(bare).toContain("DESCRIPTION:https://hannahandchris.wedding");
  });

  it("stamps the file with the time it was made", () => {
    expect(lines).toContain("DTSTAMP:20261112T100000Z");
    expect(lines).toContain("LAST-MODIFIED:20261112T100000Z");
  });

  it("holds nothing personal: no personal link, token, address or number", () => {
    expect(ics).not.toMatch(/\/i\//);
    expect(ics).not.toMatch(/\/t\//);
    expect(ics).not.toMatch(/next=/);
    expect(ics).not.toMatch(/token/i);
    expect(ics).not.toMatch(/@(?!hannahandchris\.wedding)/);
    expect(ics).not.toMatch(/\+1\d{10}/);
  });

  it("refuses a date that is not a calendar date", () => {
    expect(() => buildIcs({ ...entry, date: "soon" }, now)).toThrow();
  });
});
