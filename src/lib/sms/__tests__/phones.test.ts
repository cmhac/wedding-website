/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { addPhone, changePhone, removePhone } from "../phones";

const HOUSEHOLD = "5f1c2b8e-1111-4222-8333-944455556666";
const CONTACT = "6a1c2b8e-1111-4222-8333-944455556666";
const configured = {
  TWILIO_ACCOUNT_SID: "AC",
  TWILIO_AUTH_TOKEN: "t",
  TWILIO_MESSAGING_SERVICE_SID: "MG",
};

function db(
  result: { data?: unknown; error?: { message: string } | null } = {},
) {
  const rpc = jest.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  return { client: { rpc } as never, rpc };
}

describe("addPhone", () => {
  it("normalises the number and adds it through the service-role function", async () => {
    const { client, rpc } = db({ data: CONTACT });
    expect(
      await addPhone(client, HOUSEHOLD, "(202) 555-0123", configured),
    ).toEqual({
      ok: true,
      contactId: CONTACT,
      e164: "+12025550123",
    });
    expect(rpc).toHaveBeenCalledWith("add_phone_contact", {
      household_id: HOUSEHOLD,
      value: "+12025550123",
    });
  });

  it("refuses a non-US number and an invalid one without calling the database", async () => {
    const { client, rpc } = db();
    expect(
      await addPhone(client, HOUSEHOLD, "(416) 555-0123", configured),
    ).toEqual({ ok: false, code: "not_us_phone" });
    expect(await addPhone(client, HOUSEHOLD, "555-0100", configured)).toEqual({
      ok: false,
      code: "invalid_phone",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves nothing when texting is not configured", async () => {
    const { client, rpc } = db();
    expect(await addPhone(client, HOUSEHOLD, "(202) 555-0123", {})).toEqual({
      ok: false,
      code: "texting_not_configured",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["phone_in_use", "phone_in_use"],
    ["not_found", "not_found"],
    ["invalid_payload", "invalid_phone"],
    ["something else", "failed"],
  ])("maps the database refusal %s to %s", async (message, code) => {
    const { client } = db({ error: { message } });
    expect(
      await addPhone(client, HOUSEHOLD, "(202) 555-0123", configured),
    ).toEqual({ ok: false, code });
  });
});

describe("changePhone", () => {
  it("validates, then updates (which resets the opt-in in the database)", async () => {
    const { client, rpc } = db();
    expect(
      await changePhone(client, HOUSEHOLD, CONTACT, "202-555-0199", configured),
    ).toEqual({ ok: true, e164: "+12025550199" });
    expect(rpc).toHaveBeenCalledWith("update_phone_contact", {
      household_id: HOUSEHOLD,
      contact_id: CONTACT,
      value: "+12025550199",
    });
  });

  it("refuses a non-US number", async () => {
    const { client } = db();
    expect(
      await changePhone(
        client,
        HOUSEHOLD,
        CONTACT,
        "(416) 555-0123",
        configured,
      ),
    ).toEqual({ ok: false, code: "not_us_phone" });
  });
});

describe("removePhone", () => {
  it("removes it and says whether the household became paper only", async () => {
    const { client } = db({ data: { paper_only: true } });
    expect(await removePhone(client, HOUSEHOLD, CONTACT)).toEqual({
      ok: true,
      paperOnly: true,
    });
  });

  it("reports a missing number as not found", async () => {
    const { client } = db({ error: { message: "not_found" } });
    expect(await removePhone(client, HOUSEHOLD, CONTACT)).toEqual({
      ok: false,
      code: "not_found",
    });
  });
});
