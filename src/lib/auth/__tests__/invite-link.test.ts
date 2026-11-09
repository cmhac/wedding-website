/** @jest-environment node */
import { createHmac } from "node:crypto";
import {
  householdIdFromToken,
  inviteLinkUrl,
  inviteToken,
  parseInviteToken,
} from "../invite-link";

const SECRET = "test-invite-secret-long-enough-for-hmac-0123456789";
const OTHER_SECRET = "a-different-secret-value-also-long-enough-0123456789";
const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const BASE64URL = /^[A-Za-z0-9_-]+$/;

beforeEach(() => {
  process.env.INVITE_LINK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://wedding.example";
});

describe("inviteToken", () => {
  it("is a 22-character id, a dot, and a 43-character signature, all base64url", () => {
    const token = inviteToken(ID, 1);
    const [id, signature, ...rest] = token.split(".");
    expect(rest).toEqual([]);
    expect(id).toHaveLength(22);
    expect(signature).toHaveLength(43);
    expect(id).toMatch(BASE64URL);
    expect(signature).toMatch(BASE64URL);
  });

  it("signs 'id:version' with HMAC-SHA256 keyed by INVITE_LINK_SECRET", () => {
    const expected = createHmac("sha256", SECRET)
      .update(`${ID}:3`)
      .digest("base64url");
    expect(inviteToken(ID, 3).split(".")[1]).toBe(expected);
  });

  it("is stable for the same household and version, and differs across versions and secrets", () => {
    expect(inviteToken(ID, 1)).toBe(inviteToken(ID, 1));
    expect(inviteToken(ID, 1)).not.toBe(inviteToken(ID, 2));
    process.env.INVITE_LINK_SECRET = OTHER_SECRET;
    expect(inviteToken(ID, 1).split(".")[1]).not.toBe(
      createHmac("sha256", SECRET).update(`${ID}:1`).digest("base64url"),
    );
  });

  it("holds nothing but the household id and the signature", () => {
    const token = inviteToken(ID, 7);
    expect(token).not.toContain(ID);
    expect(Buffer.from(token.split(".")[0], "base64url").toString("hex")).toBe(
      ID.replaceAll("-", ""),
    );
  });

  it("throws when the secret is missing", () => {
    delete process.env.INVITE_LINK_SECRET;
    expect(() => inviteToken(ID, 1)).toThrow(/INVITE_LINK_SECRET/);
  });
});

describe("householdIdFromToken", () => {
  it("reads the household id back without checking the signature", () => {
    expect(householdIdFromToken(inviteToken(ID, 1))).toBe(ID);
  });

  it.each([
    ["empty", ""],
    ["no dot", "x".repeat(22)],
    ["short id", `${"a".repeat(21)}.${"b".repeat(43)}`],
    ["long signature", `${"a".repeat(22)}.${"b".repeat(44)}`],
    ["bad characters", `${"a".repeat(21)}!.${"b".repeat(43)}`],
    ["padding", `${"a".repeat(22)}.${"b".repeat(42)}=`],
    ["extra part", `${"a".repeat(22)}.${"b".repeat(43)}.c`],
  ])("returns null for a malformed token: %s", (_label, token) => {
    expect(householdIdFromToken(token)).toBeNull();
  });
});

describe("parseInviteToken", () => {
  it("accepts a token for the current version", () => {
    expect(parseInviteToken(inviteToken(ID, 2), 2)).toEqual({
      householdId: ID,
    });
  });

  it("rejects a token for a different version", () => {
    expect(parseInviteToken(inviteToken(ID, 1), 2)).toBeNull();
    expect(parseInviteToken(inviteToken(ID, 3), 2)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [id, signature] = inviteToken(ID, 1).split(".");
    const flipped = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    expect(parseInviteToken(`${id}.${flipped}`, 1)).toBeNull();
  });

  it("rejects another household's id with this household's signature", () => {
    const other = "6a2d3c9f-2222-4333-8444-055566667777";
    const [, signature] = inviteToken(ID, 1).split(".");
    const [otherId] = inviteToken(other, 1).split(".");
    expect(parseInviteToken(`${otherId}.${signature}`, 1)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = inviteToken(ID, 1);
    process.env.INVITE_LINK_SECRET = OTHER_SECRET;
    expect(parseInviteToken(token, 1)).toBeNull();
  });

  it("rejects malformed tokens without throwing", () => {
    expect(parseInviteToken("", 1)).toBeNull();
    expect(parseInviteToken("not-a-token", 1)).toBeNull();
  });

  it("compares signatures in constant time", () => {
    // timingSafeEqual throws on unequal lengths, so lengths are checked first.
    expect(parseInviteToken(`${"a".repeat(22)}.short`, 1)).toBeNull();
  });
});

describe("inviteLinkUrl", () => {
  it("builds the personal link on the site's address", () => {
    expect(inviteLinkUrl(ID, 1)).toBe(
      `https://wedding.example/i/${inviteToken(ID, 1)}`,
    );
  });

  it("does not double a trailing slash on the site address", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wedding.example/";
    expect(inviteLinkUrl(ID, 1)).toMatch(
      /^https:\/\/wedding\.example\/i\/[^/]+$/,
    );
  });
});
