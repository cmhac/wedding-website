/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { previewTextCost } from "../text-cost";

describe("previewTextCost", () => {
  const siteUrl = "https://hannahandchris.wedding";

  it("counts the save the date as two segments, from the real link length and landing", () => {
    expect(previewTextCost("save_the_date", 10, siteUrl)).toMatchObject({
      segmentsPerText: 2,
      totalSegments: 20,
    });
  });

  it("counts a reminder as one segment", () => {
    expect(previewTextCost("rsvp_reminder", 10, siteUrl)).toMatchObject({
      segmentsPerText: 1,
      totalSegments: 10,
    });
  });

  it("estimates the minutes at the dispatcher's pace of one text every two seconds", () => {
    expect(previewTextCost("update", 90, siteUrl)?.minutes).toBe(3);
    expect(previewTextCost("update", 1, siteUrl)?.minutes).toBe(1);
    expect(previewTextCost("update", 0, siteUrl)?.minutes).toBe(0);
  });

  it("is null for a message type with no registered text", () => {
    expect(previewTextCost("no_such_type", 5, siteUrl)).toBeNull();
  });

  it("falls back to a sample address when the site address is not set", () => {
    expect(previewTextCost("save_the_date", 1, "")?.segmentsPerText).toBe(2);
  });
});
