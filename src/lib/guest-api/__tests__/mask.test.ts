import { maskEmail } from "../mask";

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("ada.fake@example.test")).toBe("a•••@example.test");
  });

  it("works for a one-character local part", () => {
    expect(maskEmail("b@example.test")).toBe("b•••@example.test");
  });

  it("never reveals the rest of the local part", () => {
    expect(maskEmail("secretname@example.test")).not.toContain("ecret");
  });

  it("masks something that is not an address entirely", () => {
    expect(maskEmail("not-an-address")).toBe("•••");
  });

  it("uses the last @ so a quoted local part cannot leak", () => {
    expect(maskEmail('"a@b"@example.test')).toBe('"•••@example.test');
  });
});
