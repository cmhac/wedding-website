/** @jest-environment node */
import { plainErrorReason, statusForTwilio } from "../status";

describe("statusForTwilio", () => {
  it.each([
    ["queued", "sending"],
    ["sending", "sending"],
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["undelivered", "failed"],
    ["failed", "failed"],
  ])("maps %s to %s", (twilio, ours) => {
    expect(statusForTwilio(twilio)).toBe(ours);
  });

  it.each(["read", "accepted", "scheduled", "received", "", "nonsense"])(
    "ignores %p",
    (status) => expect(statusForTwilio(status)).toBeNull(),
  );
});

describe("plainErrorReason", () => {
  it("explains STOP in plain English for both forms of the code", () => {
    expect(plainErrorReason("opted_out")).toBe("The recipient replied STOP");
    expect(plainErrorReason("21610")).toBe("The recipient replied STOP");
  });

  it.each([
    ["30003", /unreachable/i],
    ["30005", /unknown/i],
    ["30006", /landline/i],
    ["30007", /blocked/i],
    ["unknown_outcome", /check Twilio before re-sending/i],
    ["invalid_number", /not a valid United States number/i],
  ])("explains %s", (code, pattern) => {
    expect(plainErrorReason(code)).toMatch(pattern);
  });

  it("falls back to the number for an unknown code", () => {
    expect(plainErrorReason("30999")).toBe("Twilio error 30999");
  });

  it("handles a missing code", () => {
    expect(plainErrorReason(null)).toBe("Failed");
  });
});
