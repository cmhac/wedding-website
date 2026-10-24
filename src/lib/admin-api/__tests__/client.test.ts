/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  createHousehold,
  deleteHousehold,
  importGuests,
  updateHousehold,
} from "../client";

const household = {
  id: "h1",
  display_name: "Test Household",
  contact_email: null,
  plus_one_allowance: 0,
  paper_only: true,
};

function mockFetch(status: number, body?: unknown) {
  const fn = jest.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
  );
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("admin API client", () => {
  it("posts a household and returns the parsed response", async () => {
    const f = mockFetch(201, { household, guest_ids: ["g1"] });
    const res = await createHousehold({
      display_name: "Test Household",
      plus_one_allowance: 0,
      guests: [{ first_name: "Ann", last_name: "Example" }],
    });
    expect(f.mock.calls[0][0]).toBe("/api/admin/households");
    expect(f.mock.calls[0][1]?.method).toBe("POST");
    expect(res).toEqual({
      ok: true,
      data: { household, guest_ids: ["g1"] },
    });
  });

  it("returns the error body on a failure", async () => {
    mockFetch(409, { error: { code: "email_in_use", message: "In use." } });
    const res = await updateHousehold("h1", { contact_email: "a@example.com" });
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: { code: "email_in_use", message: "In use." },
    });
  });

  it("sends a PATCH to the household path", async () => {
    const f = mockFetch(200, { household });
    await updateHousehold("h1", { contact_email: null });
    expect(f.mock.calls[0][0]).toBe("/api/admin/households/h1");
    expect(f.mock.calls[0][1]?.method).toBe("PATCH");
  });

  it("treats 204 as success for delete", async () => {
    const f = mockFetch(204);
    expect(await deleteHousehold("h1")).toEqual({ ok: true, data: null });
    expect(f.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("sends the CSV as text/csv", async () => {
    const f = mockFetch(200, {
      created: { households: 0, guests: 0, invitations: 0 },
      errors: [],
    });
    await importGuests("a,b\n1,2");
    const init = f.mock.calls[0][1]!;
    expect(f.mock.calls[0][0]).toBe("/api/admin/guests/import");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "text/csv",
    );
    expect(init.body).toBe("a,b\n1,2");
  });

  it("reports a network failure as an error result", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const res = await deleteHousehold("h1");
    expect(res.ok).toBe(false);
  });
});
