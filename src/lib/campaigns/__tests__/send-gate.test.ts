/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
const mockReadiness = jest.fn();
jest.mock("../readiness", () => ({
  ...jest.requireActual("../readiness"),
  loadReadiness: (...a: unknown[]) => mockReadiness(...a),
}));
jest.mock("@/lib/sms/state", () => ({
  getSmsState: async () => ({
    configured: true,
    enabled: true,
    available: true,
  }),
}));

import { sendGate } from "../send-gate";
import { createFakeDb } from "./fixtures/fake-db";

const campaign = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  message_type_key: "save_the_date",
  channel: "both",
  is_test: false,
  ...over,
});
const db = (row: Record<string, unknown> | null) =>
  createFakeDb({ campaigns: row ? [row] : [] }) as never;

beforeEach(() => {
  mockReadiness.mockReset();
  mockReadiness.mockResolvedValue([
    { key: "a", label: "A", status: "ready", detail: "" },
  ]);
});

describe("sendGate", () => {
  it("lets a ready save the date through", async () => {
    expect(await sendGate(db(campaign()), "c1")).toBeNull();
    expect(mockReadiness.mock.calls[0][1]).toMatchObject({ channel: "both" });
  });

  it("stops a save the date with a hard gap, naming the reason", async () => {
    mockReadiness.mockResolvedValue([
      {
        key: "date",
        label: "Wedding date",
        status: "blocked",
        detail: "The wedding date is not set.",
      },
    ]);
    expect(await sendGate(db(campaign()), "c1")).toMatchObject({
      key: "date",
      detail: "The wedding date is not set.",
    });
  });

  it("lets a warning through", async () => {
    mockReadiness.mockResolvedValue([
      { key: "rsvp", label: "RSVP", status: "warn", detail: "open" },
    ]);
    expect(await sendGate(db(campaign()), "c1")).toBeNull();
  });

  it("never gates a test send or another message type", async () => {
    mockReadiness.mockResolvedValue([
      { key: "date", label: "d", status: "blocked", detail: "x" },
    ]);
    expect(await sendGate(db(campaign({ is_test: true })), "c1")).toBeNull();
    expect(
      await sendGate(db(campaign({ message_type_key: "invitation" })), "c1"),
    ).toBeNull();
    expect(mockReadiness).not.toHaveBeenCalled();
  });

  it("leaves an unknown campaign to the sender to report", async () => {
    expect(await sendGate(db(null), "c1")).toBeNull();
  });
});
