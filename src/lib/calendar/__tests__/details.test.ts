/** @jest-environment node */
import { eventTitle, shapeSaveTheDate } from "../details";

const SITE = "https://hannahandchris.wedding";
const raw = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 3,
  wedding_event_set: true,
};

describe("eventTitle", () => {
  it("names the couple's wedding", () => {
    expect(eventTitle("Chris & Hannah")).toBe("Chris & Hannah's wedding");
  });
  it("copes without names", () => {
    expect(eventTitle(null)).toBe("Our wedding");
    expect(eventTitle("  ")).toBe("Our wedding");
  });
});

describe("shapeSaveTheDate", () => {
  it("returns the facts and the calendar choices", () => {
    const shaped = shapeSaveTheDate(raw, SITE);
    expect(shaped).toMatchObject({
      couple_names: "Chris & Hannah",
      date: "2027-09-18",
      place: "Napa Valley, California",
      note: "Invitation to follow",
      revision: 3,
    });
    expect(shaped.calendar?.file).toBe("/api/guest/save-the-date/calendar");
    expect(shaped.calendar?.google).toContain("calendar.google.com");
    expect(shaped.calendar?.outlook).toContain("outlook.live.com");
  });

  it("has no calendar while the site address is not set, rather than an entry with an empty address", () => {
    expect(shapeSaveTheDate(raw, "").calendar).toBeNull();
    expect(shapeSaveTheDate(raw, "  ").calendar).toBeNull();
  });

  it("has no calendar when the date is not set", () => {
    const shaped = shapeSaveTheDate({ ...raw, date: null }, SITE);
    expect(shaped.date).toBeNull();
    expect(shaped.calendar).toBeNull();
  });

  it("copes with nothing at all", () => {
    for (const bad of [null, undefined, "x", 3, []]) {
      const shaped = shapeSaveTheDate(bad, SITE);
      expect(shaped.date).toBeNull();
      expect(shaped.calendar).toBeNull();
      expect(shaped.revision).toBe(1);
    }
  });

  it("ignores a date that is not a calendar date", () => {
    expect(
      shapeSaveTheDate({ ...raw, date: "2027-02-30" }, SITE).date,
    ).toBeNull();
  });

  it("trims blank text to null", () => {
    const shaped = shapeSaveTheDate({ ...raw, place: "  ", note: "" }, SITE);
    expect(shaped.place).toBeNull();
    expect(shaped.note).toBeNull();
  });

  it("carries nothing but the card's facts", () => {
    const shaped = shapeSaveTheDate(
      { ...raw, household_id: "h1", email: "a@b.test" },
      SITE,
    );
    expect(Object.keys(shaped).sort()).toEqual(
      ["calendar", "couple_names", "date", "note", "place", "revision"].sort(),
    );
  });
});
