import {
  isTerminal,
  shouldAdvance,
  statusForEventType,
  STATUS_RANK,
} from "../status";

describe("message status ranking", () => {
  it("ranks queued < sending < sent < delivered", () => {
    expect(STATUS_RANK.queued).toBe(0);
    expect(STATUS_RANK.sending).toBe(1);
    expect(STATUS_RANK.sent).toBe(2);
    expect(STATUS_RANK.delivered).toBe(3);
  });

  it("treats bounced, complained and failed as terminal", () => {
    for (const s of ["bounced", "complained", "failed"] as const) {
      expect(isTerminal(s)).toBe(true);
    }
    expect(isTerminal("delivered")).toBe(false);
    expect(isTerminal("skipped")).toBe(false);
  });

  it("moves forward only", () => {
    expect(shouldAdvance("queued", "sent")).toBe(true);
    expect(shouldAdvance("sent", "delivered")).toBe(true);
    expect(shouldAdvance("delivered", "sent")).toBe(false);
    expect(shouldAdvance("sent", "sent")).toBe(false);
  });

  it("lets a terminal status win over ranks 0 to 3", () => {
    for (const from of ["queued", "sending", "sent", "delivered"] as const) {
      expect(shouldAdvance(from, "bounced")).toBe(true);
      expect(shouldAdvance(from, "complained")).toBe(true);
      expect(shouldAdvance(from, "failed")).toBe(true);
    }
  });

  it("never changes a message that is already terminal or skipped", () => {
    expect(shouldAdvance("bounced", "delivered")).toBe(false);
    expect(shouldAdvance("bounced", "complained")).toBe(false);
    expect(shouldAdvance("failed", "sent")).toBe(false);
    expect(shouldAdvance("skipped", "sent")).toBe(false);
  });

  it("maps provider event types to statuses and ignores others", () => {
    expect(statusForEventType("email.sent")).toBe("sent");
    expect(statusForEventType("email.delivered")).toBe("delivered");
    expect(statusForEventType("email.bounced")).toBe("bounced");
    expect(statusForEventType("email.complained")).toBe("complained");
    expect(statusForEventType("email.opened")).toBeNull();
  });
});
