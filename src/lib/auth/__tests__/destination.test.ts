/** @jest-environment node */
import {
  SAVE_THE_DATE_PATH,
  destinationFor,
  withDestination,
} from "../destination";

describe("destinationFor", () => {
  it("sends a save the date to the save the date page", () => {
    expect(destinationFor("save_the_date")).toBe(SAVE_THE_DATE_PATH);
    expect(SAVE_THE_DATE_PATH).toBe("/save-the-date");
  });

  it.each([
    "invitation",
    "rsvp_reminder",
    "optional_events_reminder",
    "update",
    "something_new",
  ])("leaves %s with the default landing", (key) => {
    expect(destinationFor(key)).toBeNull();
  });

  it("treats a missing type as the default landing", () => {
    expect(destinationFor(undefined)).toBeNull();
    expect(destinationFor(null)).toBeNull();
  });
});

describe("withDestination", () => {
  const link = "https://example.test/i/abc.def";

  it("adds the landing to the link", () => {
    expect(withDestination(link, "/save-the-date")).toBe(
      "https://example.test/i/abc.def?next=/save-the-date",
    );
  });

  it("changes nothing when there is no destination", () => {
    expect(withDestination(link, null)).toBe(link);
  });

  it("never adds it twice", () => {
    const once = withDestination(link, "/save-the-date");
    expect(withDestination(once, "/save-the-date")).toBe(once);
  });
});
