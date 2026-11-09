/** @jest-environment node */
import magicLink from "../magic-link";

const URL_ = "https://wedding.example/auth/confirm?token_hash=abc&type=email";

describe("magic_link template", () => {
  it("renders a subject, an HTML body and a plain-text body", async () => {
    const out = await magicLink({ sign_in_url: URL_, audience: "guest" });
    expect(out.subject).toEqual(expect.any(String));
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain("<html");
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.text).not.toContain("<");
  });

  it("puts the sign-in link in both bodies", async () => {
    const out = await magicLink({ sign_in_url: URL_, audience: "guest" });
    expect(out.html).toContain("token_hash=abc");
    expect(out.text).toContain("token_hash=abc");
  });

  it("words guest and staff emails differently", async () => {
    const guest = await magicLink({ sign_in_url: URL_, audience: "guest" });
    const staff = await magicLink({ sign_in_url: URL_, audience: "staff" });
    expect(guest.subject).not.toBe(staff.subject);
    expect(guest.text).not.toBe(staff.text);
    expect(staff.subject).toMatch(/admin/i);
    expect(guest.subject).not.toMatch(/admin/i);
  });

  it("is registered as magic_link", async () => {
    const { getTemplate } = await import("@/lib/email/templates");
    expect(typeof getTemplate("magic_link")).toBe("function");
  });
});
