/** @jest-environment node */
import { addressHash, allowSignInAttempt } from "../sign-in-limits";

beforeEach(() => {
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
});

describe("addressHash", () => {
  it("is the same for different casing and surrounding spaces", () => {
    expect(addressHash("Ann@Example.test")).toBe(
      addressHash("  ann@example.TEST "),
    );
  });

  it("differs for different addresses and for a different secret", () => {
    const a = addressHash("ann@example.test");
    expect(a).not.toBe(addressHash("bob@example.test"));
    process.env.INVITE_LINK_SECRET =
      "another-secret-value-long-enough-0123456789-xx";
    expect(addressHash("ann@example.test")).not.toBe(a);
  });

  it("is a hex digest that never contains the address", () => {
    const hash = addressHash("ann@example.test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("ann");
  });

  it("throws without the secret", () => {
    delete process.env.INVITE_LINK_SECRET;
    expect(() => addressHash("a@example.test")).toThrow(/INVITE_LINK_SECRET/);
  });
});

describe("allowSignInAttempt", () => {
  const client = (reply: { data: unknown; error: unknown } | Error) =>
    ({
      rpc: jest.fn(async () => {
        if (reply instanceof Error) throw reply;
        return reply;
      }),
    }) as never;

  it("passes the hash to the database function and returns its answer", async () => {
    const admin = client({ data: true, error: null });
    expect(await allowSignInAttempt(admin, "hash")).toBe(true);
    expect((admin as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith(
      "allow_sign_in_attempt",
      { address_hash: "hash" },
    );
    expect(
      await allowSignInAttempt(client({ data: false, error: null }), "h"),
    ).toBe(false);
  });

  it("fails closed on a database error, a thrown error or an odd answer", async () => {
    expect(
      await allowSignInAttempt(
        client({ data: null, error: { message: "x" } }),
        "h",
      ),
    ).toBe(false);
    expect(await allowSignInAttempt(client(new Error("boom")), "h")).toBe(
      false,
    );
    expect(
      await allowSignInAttempt(client({ data: "yes", error: null }), "h"),
    ).toBe(false);
  });
});
