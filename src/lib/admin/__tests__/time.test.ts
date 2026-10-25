import {
  ADMIN_TIME_ZONE,
  formatPacific,
  isoToPacificLocal,
  pacificLocalToIso,
} from "../time";

describe("formatPacific", () => {
  const all = { date: true, time: true, weekday: true };

  it("shows a summer moment with PT", () => {
    expect(formatPacific("2027-06-12T23:00:00.000Z", all)).toBe(
      "Sat, Jun 12, 4:00 PM PT",
    );
  });

  it("shows a winter moment with PT", () => {
    expect(formatPacific("2027-12-13T00:00:00.000Z", all)).toBe(
      "Sun, Dec 12, 4:00 PM PT",
    );
  });

  it("accepts a Date", () => {
    expect(formatPacific(new Date("2027-06-12T23:00:00.000Z"), all)).toBe(
      "Sat, Jun 12, 4:00 PM PT",
    );
  });

  it("can show only the date or only the time", () => {
    expect(formatPacific("2027-06-12T23:00:00.000Z", { date: true })).toBe(
      "Jun 12",
    );
    expect(formatPacific("2027-06-12T23:00:00.000Z", { time: true })).toBe(
      "4:00 PM PT",
    );
  });

  it("ignores the machine's own time zone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      expect(formatPacific("2027-06-12T23:00:00.000Z", all)).toBe(
        "Sat, Jun 12, 4:00 PM PT",
      );
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("pacificLocalToIso", () => {
  it("converts a daylight-time value", () => {
    expect(pacificLocalToIso("2027-06-12T16:00")).toBe(
      "2027-06-12T23:00:00.000Z",
    );
  });

  it("converts a standard-time value", () => {
    expect(pacificLocalToIso("2027-12-12T16:00")).toBe(
      "2027-12-13T00:00:00.000Z",
    );
  });

  it("refuses a time skipped by the spring clock change", () => {
    expect(pacificLocalToIso("2027-03-14T02:30")).toEqual({
      error: "That time does not exist on that date because the clocks change.",
    });
  });

  it("uses the first occurrence of a time that happens twice", () => {
    expect(pacificLocalToIso("2027-11-07T01:30")).toBe(
      "2027-11-07T08:30:00.000Z",
    );
  });

  it("returns null for an empty string", () => {
    expect(pacificLocalToIso("")).toBeNull();
  });

  it("returns an error object for text that is not a date and time", () => {
    expect(pacificLocalToIso("soon")).toEqual({
      error: expect.any(String),
    });
  });
});

describe("isoToPacificLocal", () => {
  it.each([
    "2027-06-12T16:00",
    "2027-12-12T16:00",
    "2027-03-14T03:30",
    "2027-11-07T00:30",
  ])("round-trips %s", (typed) => {
    const iso = pacificLocalToIso(typed);
    expect(typeof iso).toBe("string");
    expect(isoToPacificLocal(iso as string)).toBe(typed);
  });

  it("returns an empty string for null or empty", () => {
    expect(isoToPacificLocal(null)).toBe("");
    expect(isoToPacificLocal("")).toBe("");
  });
});

describe("ADMIN_TIME_ZONE", () => {
  it("defaults to America/Los_Angeles", () => {
    expect(ADMIN_TIME_ZONE).toBe("America/Los_Angeles");
  });

  it("is read from NEXT_PUBLIC_ADMIN_TIME_ZONE", () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_ADMIN_TIME_ZONE = "America/Denver";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("../time") as typeof import("../time");
      expect(mod.ADMIN_TIME_ZONE).toBe("America/Denver");
      delete process.env.NEXT_PUBLIC_ADMIN_TIME_ZONE;
    });
  });
});
