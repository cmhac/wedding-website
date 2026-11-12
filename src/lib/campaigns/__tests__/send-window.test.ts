/** @jest-environment node */
import { textSegments, textSendWarning } from "../send-window";

describe("textSendWarning", () => {
  // 11:00 to 21:00 Eastern keeps every continental time zone inside 8 a.m. to 9 p.m.
  it.each([
    ["2027-01-15T16:00:00Z", "11:00 Eastern, in winter"],
    ["2027-01-15T20:00:00Z", "15:00 Eastern"],
    ["2027-01-16T01:59:00Z", "20:59 Eastern"],
    ["2027-07-15T15:00:00Z", "11:00 Eastern, in summer"],
    ["2027-07-16T00:59:00Z", "20:59 Eastern, in summer"],
  ])("does not warn at %s (%s)", (iso) => {
    expect(textSendWarning(new Date(iso))).toBeNull();
  });

  it.each([
    ["2027-01-15T15:59:00Z", "10:59 Eastern, in winter"],
    ["2027-01-16T02:00:00Z", "21:00 Eastern"],
    ["2027-01-15T08:00:00Z", "03:00 Eastern"],
    ["2027-07-15T14:59:00Z", "10:59 Eastern, in summer"],
    ["2027-07-16T01:00:00Z", "21:00 Eastern, in summer"],
  ])("warns at %s (%s)", (iso) => {
    const warning = textSendWarning(new Date(iso));
    expect(warning).toMatch(/8 a\.m\./);
    expect(warning).toMatch(/9 p\.m\./);
    expect(warning).toMatch(/11 a\.m\. to 9 p\.m\. Eastern/);
  });
});

describe("textSegments", () => {
  it("counts one segment up to 160 standard characters", () => {
    expect(textSegments("a".repeat(160))).toBe(1);
    expect(textSegments("")).toBe(1);
  });

  it("counts joined segments of 153 after that", () => {
    expect(textSegments("a".repeat(161))).toBe(2);
    expect(textSegments("a".repeat(306))).toBe(2);
    expect(textSegments("a".repeat(307))).toBe(3);
  });

  it("counts a character outside the standard alphabet as 70 for one segment, 67 joined", () => {
    expect(textSegments("é".repeat(70) + "😀")).toBe(2);
    expect(textSegments("😀".repeat(35))).toBe(1);
    expect(textSegments("😀".repeat(36))).toBe(2);
    expect(textSegments("é".repeat(40) + "—")).toBe(1);
    expect(textSegments("—".repeat(71))).toBe(2);
  });

  it("counts the extended characters of the standard alphabet as two", () => {
    expect(textSegments("€".repeat(80))).toBe(1);
    expect(textSegments("€".repeat(81))).toBe(2);
  });
});
