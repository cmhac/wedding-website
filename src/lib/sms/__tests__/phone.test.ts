/** @jest-environment node */
import { looksLikePhone, maskPhone, parseUsPhone } from "../phone";

describe("parseUsPhone", () => {
  it.each([
    "(202) 555-0123",
    "202-555-0123",
    "+1 202 555 0123",
    "1 (202) 555-0123",
    "202.555.0123",
    "  202 555 0123  ",
  ])("accepts %s as the same United States number", (input) => {
    expect(parseUsPhone(input)).toEqual({ ok: true, e164: "+12025550123" });
  });

  it("refuses Canadian and Caribbean numbers as not United States", () => {
    expect(parseUsPhone("(416) 555-0123")).toEqual({
      ok: false,
      reason: "not_us",
    });
    expect(parseUsPhone("(876) 555-0123")).toEqual({
      ok: false,
      reason: "not_us",
    });
  });

  it.each([
    "555-0100",
    "(202) 555-01",
    "(202) 555-012345",
    "abcdefghij",
    "",
    "(202) 555-0123 ext 4",
  ])("refuses %p as invalid", (input) => {
    expect(parseUsPhone(input)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("maskPhone", () => {
  it("shows only the last four digits", () => {
    expect(maskPhone("+12025550123")).toBe("(•••) •••-0123");
  });

  it("masks anything that is not a number completely", () => {
    expect(maskPhone("nonsense")).toBe("(•••) •••-••••");
  });
});

describe("looksLikePhone", () => {
  it.each(["(202) 555-0123", "202-555-0123", "+1 202 555 0123", "2025550123"])(
    "is true for %s",
    (value) => expect(looksLikePhone(value)).toBe(true),
  );

  it.each(["a@b.co", "someone@example.com", "", "hello", "12"])(
    "is false for %p",
    (value) => expect(looksLikePhone(value)).toBe(false),
  );
});
