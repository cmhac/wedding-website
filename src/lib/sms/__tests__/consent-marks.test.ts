/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { setSmsConsent } from "../consent-marks";

const rpc = jest.fn();
const db = { rpc };

const counts = {
  marked: 2,
  cleared: 0,
  already: 1,
  declined_skipped: 1,
  households_without_phone: 3,
  households: 6,
  dry_run: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockResolvedValue({ data: counts, error: null });
});

describe("setSmsConsent", () => {
  it("marks a batch through the staff function and returns the counts", async () => {
    const result = await setSmsConsent(db, {
      householdIds: ["h1", "h2"],
      mode: "mark",
      note: "address form",
    });
    expect(result).toEqual({
      ok: true,
      counts: {
        marked: 2,
        cleared: 0,
        already: 1,
        declinedSkipped: 1,
        householdsWithoutPhone: 3,
        households: 6,
        dryRun: false,
      },
    });
    expect(rpc).toHaveBeenCalledWith("staff_set_sms_consent", {
      household_ids: ["h1", "h2"],
      contact_id: null,
      mode: "mark",
      override_declined: false,
      note: "address form",
      dry_run: false,
    });
  });

  it("passes a single number, the override and a dry run through", async () => {
    await setSmsConsent(db, {
      householdIds: ["h1"],
      contactId: "c1",
      mode: "clear",
      overrideDeclined: true,
      dryRun: true,
    });
    expect(rpc).toHaveBeenCalledWith("staff_set_sms_consent", {
      household_ids: ["h1"],
      contact_id: "c1",
      mode: "clear",
      override_declined: true,
      note: null,
      dry_run: true,
    });
  });

  it("trims a blank note to nothing", async () => {
    await setSmsConsent(db, { householdIds: ["h1"], mode: "mark", note: "  " });
    expect(rpc.mock.calls[0][1].note).toBeNull();
  });

  it.each([
    ["forbidden", "forbidden"],
    ["not_found", "not_found"],
    ["declined_needs_override", "declined_needs_override"],
    ["invalid_payload", "invalid_payload"],
    ["something odd with +12025550123", "failed"],
  ])("maps the database error %s to %s", async (message, code) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    const result = await setSmsConsent(db, {
      householdIds: ["h1"],
      mode: "mark",
    });
    expect(result).toEqual({ ok: false, code });
  });

  it("is a plain failure when the answer is not the counts", async () => {
    rpc.mockResolvedValue({ data: "nope", error: null });
    expect(
      await setSmsConsent(db, { householdIds: ["h1"], mode: "mark" }),
    ).toEqual({ ok: false, code: "failed" });
  });
});
