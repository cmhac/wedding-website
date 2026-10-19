/** @jest-environment node */
import { rpcErrorResponse } from "../rpc-errors";

async function run(message: string) {
  const res = rpcErrorResponse({ message });
  return { status: res.status, body: await res.json() };
}

describe("rpcErrorResponse", () => {
  it.each([
    ["not_a_guest", 403],
    ["forbidden", 403],
    ["rsvp_closed", 409],
    ["not_a_placeholder", 409],
    ["invalid_meal", 422],
    ["invalid_payload", 422],
  ])("maps %s to %i", async (code, status) => {
    const out = await run(code);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(code);
  });

  it("hides unknown database text behind a 500", async () => {
    const out = await run('relation "x" does not exist');
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain("relation");
  });
});
