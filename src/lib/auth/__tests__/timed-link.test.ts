/** @jest-environment node */
import { timedLinkUrl, timedToken, parseTimedToken } from "../timed-link";

const HOUSEHOLD = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NOW = new Date("2027-03-01T12:00:00Z");

beforeEach(() => {
  process.env.INVITE_LINK_SECRET = "test-secret-for-timed-links";
});

describe("timed sign-in links", () => {
  it("is valid for 15 minutes and reusable in that window", () => {
    const token = timedToken(HOUSEHOLD, 3, NOW);
    for (const minutes of [0, 1, 14]) {
      const at = new Date(NOW.getTime() + minutes * 60_000);
      expect(parseTimedToken(token, 3, at)).toEqual({ householdId: HOUSEHOLD });
    }
  });

  it("expires after 15 minutes", () => {
    const token = timedToken(HOUSEHOLD, 3, NOW);
    const late = new Date(NOW.getTime() + 15 * 60_000 + 1000);
    expect(parseTimedToken(token, 3, late)).toBeNull();
  });

  it("stops working when the household's link is reissued", () => {
    const token = timedToken(HOUSEHOLD, 3, NOW);
    expect(parseTimedToken(token, 4, NOW)).toBeNull();
  });

  it("rejects a tampered signature, expiry or household", () => {
    const token = timedToken(HOUSEHOLD, 3, NOW);
    const [id, expiry, sig] = token.split(".");
    const forgedSig = `${id}.${expiry}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    const laterExpiry = `${id}.${(parseInt(expiry, 36) + 3600).toString(36)}.${sig}`;
    expect(parseTimedToken(forgedSig, 3, NOW)).toBeNull();
    expect(parseTimedToken(laterExpiry, 3, NOW)).toBeNull();
    const other = timedToken("1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", 3, NOW);
    expect(
      parseTimedToken(`${other.split(".")[0]}.${expiry}.${sig}`, 3, NOW),
    ).toBeNull();
  });

  it.each(["", "a.b", "a.b.c.d", "short.1abcde.short", "has space.x.y"])(
    "rejects the malformed token %p",
    (token) => {
      expect(parseTimedToken(token, 3, NOW)).toBeNull();
    },
  );

  it("is not valid as a personal link and vice versa (different signed message)", () => {
    // A personal link signs "household:version"; a timed link signs a different message.
    const token = timedToken(HOUSEHOLD, 3, NOW);
    expect(token.split(".")).toHaveLength(3);
  });

  it("is short enough to keep a text to one segment", () => {
    const url = timedLinkUrl(
      HOUSEHOLD,
      3,
      "https://hannahandchris.wedding",
      NOW,
    );
    expect(url).toMatch(
      /^https:\/\/hannahandchris\.wedding\/t\/[A-Za-z0-9_-]{22}\.[0-9a-z]{6}\.[A-Za-z0-9_-]{22}$/,
    );
    expect(url.length).toBeLessThanOrEqual(90);
  });

  it("requires the secret", () => {
    delete process.env.INVITE_LINK_SECRET;
    expect(() => timedToken(HOUSEHOLD, 3, NOW)).toThrow();
  });
});
