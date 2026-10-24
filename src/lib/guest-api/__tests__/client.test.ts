import { createGuestApiClient } from "../client";

const GUEST = "11111111-1111-4111-8111-111111111111";

function fakeFetch(status: number, body: unknown) {
  return jest.fn(async () => ({
    status,
    json: async () => body,
  })) as unknown as typeof fetch & jest.Mock;
}

describe("guest API client", () => {
  it("posts the sign-in email as JSON and returns the neutral message", async () => {
    const f = fakeFetch(202, { message: "ok" });
    const api = createGuestApiClient({ fetch: f });
    const res = await api.signIn({ email: "a@example.com" });
    expect(f).toHaveBeenCalledWith(
      "/api/guest/sign-in",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
    expect(res).toEqual({ ok: true, status: 202, data: { message: "ok" } });
  });

  it("uses a base URL when given", async () => {
    const f = fakeFetch(200, { opt_out: true });
    await createGuestApiClient({
      fetch: f,
      baseUrl: "http://x.test",
    }).setOptOut(true);
    expect(f.mock.calls[0][0]).toBe("http://x.test/api/guest/opt-out");
  });

  it("returns the error body for a failed call", async () => {
    const f = fakeFetch(409, {
      error: { code: "rsvp_closed", message: "Closed." },
    });
    const res = await createGuestApiClient({ fetch: f }).submitRsvp({
      guests: [{ guest_id: GUEST, responses: [] }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error.code).toBe("rsvp_closed");
    }
  });

  it("reports an unreadable error body as a generic error", async () => {
    const f = fakeFetch(502, "<html>");
    const res = await createGuestApiClient({ fetch: f }).getRsvp();
    expect(res).toMatchObject({ ok: false, status: 502 });
  });

  it("treats 204 sign-out as success", async () => {
    const f = jest.fn(async () => ({
      status: 204,
      json: async () => {
        throw new Error("no body");
      },
    })) as unknown as typeof fetch;
    const res = await createGuestApiClient({ fetch: f }).signOut();
    expect(res).toEqual({ ok: true, status: 204, data: undefined });
  });

  it("names a plus-one", async () => {
    const f = fakeFetch(200, { id: GUEST });
    const res = await createGuestApiClient({ fetch: f }).namePlusOne({
      guest_id: GUEST,
      first_name: "Sam",
      last_name: "Fake",
    });
    expect(f.mock.calls[0][0]).toBe("/api/guest/plus-one");
    expect(res.ok).toBe(true);
  });
});
