/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { firstBlocked, loadReadiness, type ReadinessItem } from "../readiness";
import { createFakeDb } from "./fixtures/fake-db";

const details = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 1,
  wedding_event_set: true,
};

const emailTemplates = { save_the_date: () => ({}) } as never;
const goodEnv = { RESEND_API_KEY: "re_x", EMAIL_FROM: "Test <a@example.test>" };

function db(over: { details?: unknown; rsvpOpen?: boolean } = {}) {
  return createFakeDb(
    {
      settings: [{ id: true, rsvp_open: over.rsvpOpen ?? false }],
      households: [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }],
      household_contacts: [
        { household_id: "h1", kind: "email", sms_consent: null },
        { household_id: "h2", kind: "phone", sms_consent: "opted_in" },
        { household_id: "h3", kind: "phone", sms_consent: "not_asked" },
        { household_id: "h1", kind: "phone", sms_consent: "opted_in" },
      ],
    },
    { get_save_the_date: () => over.details ?? details },
  );
}

const options = {
  channel: "both" as const,
  siteUrl: "https://example.test",
  env: goodEnv,
  templates: emailTemplates,
  sms: { configured: true, enabled: true },
};

const byKey = (items: ReadinessItem[], key: string) =>
  items.find((i) => i.key === key)!;

describe("loadReadiness", () => {
  it("is ready when everything is set", async () => {
    const items = await loadReadiness(db() as never, options);
    expect(items.filter((i) => i.status === "blocked")).toEqual([]);
    expect(byKey(items, "date").status).toBe("ready");
    expect(byKey(items, "email_template").status).toBe("ready");
    expect(byKey(items, "text_template").status).toBe("ready");
    expect(byKey(items, "site_url").status).toBe("ready");
    expect(byKey(items, "rsvp").status).toBe("ready");
    expect(byKey(items, "texting").status).toBe("ready");
  });

  it("blocks when the wedding date is not set", async () => {
    const items = await loadReadiness(
      db({ details: { ...details, date: null } }) as never,
      options,
    );
    expect(byKey(items, "date").status).toBe("blocked");
    expect(byKey(items, "date").detail).toMatch(/wedding event/i);
  });

  it("blocks when email is chosen and no email template is registered, but not for a text-only send", async () => {
    const none = { ...options, templates: {} as never };
    expect(
      byKey(await loadReadiness(db() as never, none), "email_template").status,
    ).toBe("blocked");
    expect(
      byKey(
        await loadReadiness(db() as never, { ...none, channel: "text" }),
        "email_template",
      ).status,
    ).toBe("ready");
  });

  it("blocks when the site address is missing, and warns when it is not https", async () => {
    expect(
      byKey(
        await loadReadiness(db() as never, { ...options, siteUrl: "" }),
        "site_url",
      ).status,
    ).toBe("blocked");
    expect(
      byKey(
        await loadReadiness(db() as never, {
          ...options,
          siteUrl: "http://example.test",
        }),
        "site_url",
      ).status,
    ).toBe("warn");
  });

  it("warns while the RSVP is open, so guests could answer before invitations go out", async () => {
    const items = await loadReadiness(db({ rsvpOpen: true }) as never, options);
    expect(byKey(items, "rsvp").status).toBe("warn");
    expect(byKey(items, "rsvp").detail).toMatch(/closed|close/i);
  });

  it("warns when texting is off, and not when only email is chosen", async () => {
    const off = { ...options, sms: { configured: true, enabled: false } };
    expect(
      byKey(await loadReadiness(db() as never, off), "texting").status,
    ).toBe("warn");
    expect(
      byKey(
        await loadReadiness(db() as never, { ...off, channel: "email" }),
        "texting",
      ).status,
    ).toBe("ready");
  });

  it("blocks when email is chosen without the email key or sending address, and says domain verification is by hand", async () => {
    const missing = await loadReadiness(db() as never, { ...options, env: {} });
    expect(byKey(missing, "email_config").status).toBe("blocked");
    const ok = await loadReadiness(db() as never, options);
    expect(byKey(ok, "email_config").detail).toMatch(/domain is verified/i);
  });

  it("counts reach by email, text, both and neither, and warns when anyone is out of reach", async () => {
    const items = await loadReadiness(db() as never, options);
    const reach = byKey(items, "reach");
    expect(reach.status).toBe("warn");
    // h1 email and text, h2 text only, h3 neither (not asked), h4 neither.
    expect(reach.detail).toContain("1 by email and text");
    expect(reach.detail).toContain("1 by text only");
    expect(reach.detail).toContain("2 by neither");
  });

  it("warns that the text is two segments, ready otherwise, blocks when no text is registered", async () => {
    expect(
      byKey(await loadReadiness(db() as never, options), "text_template")
        .status,
    ).toBe("ready");
    expect(
      byKey(
        await loadReadiness(db() as never, { ...options, texts: {} }),
        "text_template",
      ).status,
    ).toBe("blocked");
  });
});

describe("firstBlocked", () => {
  it("returns the first blocked item, or null", () => {
    const items: ReadinessItem[] = [
      { key: "a", label: "A", status: "ready", detail: "" },
      { key: "b", label: "B", status: "warn", detail: "" },
      { key: "c", label: "C", status: "blocked", detail: "no" },
      { key: "d", label: "D", status: "blocked", detail: "no" },
    ];
    expect(firstBlocked(items)?.key).toBe("c");
    expect(firstBlocked(items.slice(0, 2))).toBeNull();
  });
});
