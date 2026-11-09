/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  addContact,
  getInviteLink,
  reissueInviteLink,
  removeContact,
  signOutHousehold,
  updateContact,
  createHousehold,
  deleteHousehold,
  grantStaff,
  importGuests,
  importGuestsFile,
  requestStaffSignIn,
  revokeStaff,
  sendCampaign,
  updateHousehold,
} from "../client";

const household = {
  id: "h1",
  display_name: "Test Household",
  contact_count: 0,
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
      contacts: [],
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
    const res = await updateHousehold("h1", { display_name: "New name" });
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: { code: "email_in_use", message: "In use." },
    });
  });

  it("sends a PATCH to the household path", async () => {
    const f = mockFetch(200, { household });
    await updateHousehold("h1", { notes: null });
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
      source: { format: "csv" },
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

  describe("requestStaffSignIn", () => {
    it("posts the email as JSON and resolves ok on 202", async () => {
      const f = mockFetch(202, { message: "Check your email." });
      const res = await requestStaffSignIn("staff@example.com");
      expect(f.mock.calls[0][0]).toBe("/api/admin/sign-in");
      expect(f.mock.calls[0][1]?.method).toBe("POST");
      expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({
        email: "staff@example.com",
      });
      expect(res.ok).toBe(true);
    });

    it("resolves rate_limited on 429", async () => {
      mockFetch(429, {
        error: { code: "rate_limited", message: "Slow down." },
      });
      expect(await requestStaffSignIn("staff@example.com")).toMatchObject({
        ok: false,
        status: 429,
        error: { code: "rate_limited" },
      });
    });

    it("resolves network on a failed fetch and never throws", async () => {
      global.fetch = jest.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch;
      expect(await requestStaffSignIn("staff@example.com")).toMatchObject({
        ok: false,
        status: 0,
        error: { code: "network" },
      });
    });
  });

  describe("importGuestsFile", () => {
    const okBody = {
      created: { households: 1, guests: 2, invitations: 3 },
      errors: [],
      source: {
        format: "xlsx",
        sheet: { name: "Guest list", index: 1, count: 2 },
      },
    };

    it("sends xlsx bytes with the spreadsheet content type", async () => {
      const f = mockFetch(200, okBody);
      const file = new File(["bytes"], "guests.xlsx");
      const res = await importGuestsFile(file);
      const init = f.mock.calls[0][1]!;
      expect(f.mock.calls[0][0]).toBe("/api/admin/guests/import");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(init.body).toBe(file);
      expect(res).toEqual({ ok: true, data: okBody });
    });

    it("sends text/csv for a .csv file, case-insensitively", async () => {
      const f = mockFetch(200, { ...okBody, source: { format: "csv" } });
      await importGuestsFile(new File(["a,b"], "Guests.CSV"));
      expect(
        (f.mock.calls[0][1]!.headers as Record<string, string>)["content-type"],
      ).toBe("text/csv");
    });

    it("reports a response without source as bad_response", async () => {
      mockFetch(200, { created: okBody.created, errors: [] });
      expect(
        await importGuestsFile(new File(["x"], "guests.xlsx")),
      ).toMatchObject({ ok: false, error: { code: "bad_response" } });
    });
  });

  describe("sendCampaign", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const sent = {
      campaign_id: id,
      households: 3,
      addresses: 3,
      queued: 3,
      sent: 2,
      skipped: { no_email: 1, opted_out: 0, other: 0 },
      failed: 0,
    };

    it("posts to the send path and parses the body", async () => {
      const f = mockFetch(200, sent);
      const res = await sendCampaign(id);
      expect(f.mock.calls[0][0]).toBe(`/api/admin/campaigns/${id}/send`);
      expect(f.mock.calls[0][1]?.method).toBe("POST");
      expect(res).toEqual({ ok: true, data: sent });
    });

    it.each([
      [404, "not_found"],
      [409, "campaign_not_sendable"],
      [409, "template_missing"],
      [422, "invalid_audience"],
    ])("resolves %i %s", async (status, code) => {
      mockFetch(status, { error: { code, message: "No." } });
      expect(await sendCampaign(id)).toMatchObject({
        ok: false,
        status,
        error: { code },
      });
    });

    it("never throws on a network failure", async () => {
      global.fetch = jest.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch;
      expect(await sendCampaign(id)).toMatchObject({ ok: false, status: 0 });
    });
  });

  describe("staff access", () => {
    const userId = "10000000-0000-4000-8000-000000000002";
    const staff = { user_id: userId, role: "planner", display_name: "Pat" };

    it("grantStaff posts the body and parses the response", async () => {
      const f = mockFetch(201, { staff });
      const body = { email: "pat@example.com", display_name: "Pat" };
      const res = await grantStaff(body);
      expect(f.mock.calls[0][0]).toBe("/api/admin/staff");
      expect(f.mock.calls[0][1]?.method).toBe("POST");
      expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual(body);
      expect(res).toEqual({ ok: true, data: { staff } });
    });

    it("revokeStaff sends DELETE and resolves null on 204", async () => {
      const f = mockFetch(204);
      expect(await revokeStaff(userId)).toEqual({ ok: true, data: null });
      expect(f.mock.calls[0][0]).toBe(`/api/admin/staff/${userId}`);
      expect(f.mock.calls[0][1]?.method).toBe("DELETE");
    });

    it.each([
      ["grant", 403, "forbidden"],
      ["grant", 409, "already_staff"],
      ["revoke", 403, "forbidden"],
      ["revoke", 409, "last_couple"],
    ])("%s resolves %i %s", async (which, status, code) => {
      mockFetch(status, { error: { code, message: "No." } });
      const res =
        which === "grant"
          ? await grantStaff({ email: "pat@example.com", display_name: "Pat" })
          : await revokeStaff(userId);
      expect(res).toMatchObject({ ok: false, status, error: { code } });
    });

    it("never throws on a network failure", async () => {
      global.fetch = jest.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch;
      expect(await revokeStaff(userId)).toMatchObject({
        ok: false,
        error: { code: "network" },
      });
    });
  });
});

describe("admin API client: addresses, links and sign-out", () => {
  const contact = {
    contact: { id: "c1", kind: "email", value: "a@example.test" },
  };

  it("adds an address with a POST to the contacts path", async () => {
    const f = mockFetch(201, contact);
    const res = await addContact("h1", "a@example.test");
    expect(f.mock.calls[0][0]).toBe("/api/admin/households/h1/contacts");
    expect(f.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({
      kind: "email",
      value: "a@example.test",
    });
    expect(res).toEqual({ ok: true, data: contact });
  });

  it("changes an address with a PATCH", async () => {
    const f = mockFetch(200, contact);
    await updateContact("h1", "c1", "a@example.test");
    expect(f.mock.calls[0][0]).toBe("/api/admin/households/h1/contacts/c1");
    expect(f.mock.calls[0][1]?.method).toBe("PATCH");
  });

  it("removes an address and returns paper_only", async () => {
    const f = mockFetch(200, { paper_only: true });
    const res = await removeContact("h1", "c1");
    expect(f.mock.calls[0][1]?.method).toBe("DELETE");
    expect(res).toEqual({ ok: true, data: { paper_only: true } });
  });

  it("returns the error body when an address is in use", async () => {
    mockFetch(409, { error: { code: "email_in_use", message: "In use." } });
    expect(await addContact("h1", "a@example.test")).toEqual({
      ok: false,
      status: 409,
      error: { code: "email_in_use", message: "In use." },
    });
  });

  it("reads and reissues the personal link", async () => {
    const link = {
      url: "https://x.example/i/t",
      issued_at: "2027-01-01T00:00:00Z",
    };
    const f = mockFetch(200, link);
    expect(await getInviteLink("h1")).toEqual({ ok: true, data: link });
    expect(f.mock.calls[0][0]).toBe("/api/admin/households/h1/invite-link");
    expect(f.mock.calls[0][1]?.method).toBe("GET");
    await reissueInviteLink("h1");
    expect(f.mock.calls[1][1]?.method).toBe("POST");
  });

  it("signs a household out everywhere", async () => {
    const f = mockFetch(204);
    expect(await signOutHousehold("h1")).toEqual({ ok: true, data: null });
    expect(f.mock.calls[0][0]).toBe("/api/admin/households/h1/sign-out");
    expect(f.mock.calls[0][1]?.method).toBe("POST");
  });
});
