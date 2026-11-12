/** @jest-environment node */
import {
  OUTLOOK_COMPOSE_URL,
  googleCalendarUrl,
  outlookCalendarUrl,
} from "../links";

const entry = {
  date: "2027-12-31",
  title: "Chris & Hannah's wedding",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  siteUrl: "https://hannahandchris.wedding",
  revision: 1,
};

describe("googleCalendarUrl", () => {
  const url = new URL(googleCalendarUrl(entry));

  it("opens a new entry on Google Calendar", () => {
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
  });

  it("is an all-day entry with the end one day after", () => {
    expect(url.searchParams.get("dates")).toBe("20271231/20280101");
  });

  it("carries the title, place and details, encoded", () => {
    expect(url.searchParams.get("text")).toBe("Chris & Hannah's wedding");
    expect(url.searchParams.get("location")).toBe("Napa Valley, California");
    expect(url.searchParams.get("details")).toBe(
      "Invitation to follow\nhttps://hannahandchris.wedding",
    );
    expect(url.href).not.toContain("& Hannah");
  });

  it("leaves out an empty place", () => {
    expect(
      new URL(googleCalendarUrl({ ...entry, place: null })).searchParams.has(
        "location",
      ),
    ).toBe(false);
  });
});

describe("outlookCalendarUrl", () => {
  const url = new URL(outlookCalendarUrl(entry));

  it("uses the one Outlook address constant", () => {
    expect(url.origin + url.pathname).toBe(OUTLOOK_COMPOSE_URL);
    expect(OUTLOOK_COMPOSE_URL).toBe(
      "https://outlook.live.com/calendar/0/deeplink/compose",
    );
  });

  it("is an all-day entry with the end one day after", () => {
    expect(url.searchParams.get("allday")).toBe("true");
    expect(url.searchParams.get("startdt")).toBe("2027-12-31");
    expect(url.searchParams.get("enddt")).toBe("2028-01-01");
    expect(url.searchParams.get("rru")).toBe("addevent");
    expect(url.searchParams.get("path")).toBe("/calendar/action/compose");
  });

  it("carries the title, place and body", () => {
    expect(url.searchParams.get("subject")).toBe("Chris & Hannah's wedding");
    expect(url.searchParams.get("location")).toBe("Napa Valley, California");
    expect(url.searchParams.get("body")).toBe(
      "Invitation to follow\nhttps://hannahandchris.wedding",
    );
  });
});

describe("what the links hold", () => {
  it("is nothing personal", () => {
    for (const link of [googleCalendarUrl(entry), outlookCalendarUrl(entry)]) {
      expect(decodeURIComponent(link)).not.toMatch(/\/i\/|\/t\/|next=|token/i);
    }
  });
});
