/** @jest-environment node */
import { buildIcs } from "../ics";
import { entryFor, shapeSaveTheDate } from "../details";

const SITE = "https://hannahandchris.wedding";
const raw = (place: string, note: string, revision: number) => ({
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place,
  note,
  revision,
});

// The page, the JSON, the file and both links are all built from one details
// object, so a change to the details reaches every one of them (spec US5).
describe("one source for the card's facts", () => {
  it.each([
    ["Napa Valley, California", "Invitation to follow", 1],
    ["Sonoma, California", "Details to come", 2],
  ])("every surface reflects %s / %s", (place, note, revision) => {
    const details = shapeSaveTheDate(raw(place, note, revision), SITE);
    expect(details.place).toBe(place);
    expect(details.note).toBe(note);

    const entry = entryFor(details, SITE)!;
    const ics = buildIcs(entry, new Date("2026-11-12T00:00:00Z"));
    expect(ics).toContain(`SEQUENCE:${revision}`);
    expect(ics.replace(/\r\n /g, "")).toContain(place.replace(",", "\\,"));
    expect(ics.replace(/\r\n /g, "")).toContain(note);

    for (const link of [details.calendar!.google, details.calendar!.outlook]) {
      const params = new URL(link).searchParams;
      expect(params.get("location")).toBe(place);
      expect(params.get("details") ?? params.get("body")).toContain(note);
    }
  });

  it("takes the date from the one stored date, in every surface", () => {
    const details = shapeSaveTheDate(raw("P", "N", 1), SITE);
    const entry = entryFor(details, SITE)!;
    expect(entry.date).toBe("2027-09-18");
    expect(buildIcs(entry)).toContain("DTSTART;VALUE=DATE:20270918");
    expect(new URL(details.calendar!.google).searchParams.get("dates")).toBe(
      "20270918/20270919",
    );
    expect(new URL(details.calendar!.outlook).searchParams.get("startdt")).toBe(
      "2027-09-18",
    );
  });
});
