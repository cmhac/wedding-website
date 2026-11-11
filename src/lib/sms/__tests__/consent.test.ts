/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/log");
const mockState = jest.fn();
jest.mock("../state", () => ({
  getSmsState: (...a: unknown[]) => mockState(...a),
}));
const mockSend = jest.fn();
jest.mock("../send", () => ({
  sendText: (...a: unknown[]) => mockSend(...a),
}));
import { log } from "@/lib/log";
import {
  answerConsent,
  getConsentPrompt,
  sendConfirmationText,
} from "../consent";

const contacts = [
  { id: "e1", kind: "email", value: "a@example.test", consent: null },
  { id: "p1", kind: "phone", value: "+12025550123", consent: "not_asked" },
  { id: "p2", kind: "phone", value: "+12025550124", consent: "opted_in" },
  { id: "p3", kind: "phone", value: "+12025550125", consent: "declined" },
  { id: "p4", kind: "phone", value: "+12025550126", consent: "not_asked" },
];

function guestDb(
  recordResult: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const rpc = jest.fn(async (fn: string) => {
    if (fn === "get_my_contacts") return { data: contacts, error: null };
    if (fn === "record_sms_consent") return recordResult;
    throw new Error(`unexpected ${fn}`);
  });
  return { db: { rpc } as never, rpc };
}

const loggedText = () =>
  JSON.stringify([
    ...(log.info as jest.Mock).mock.calls,
    ...(log.warn as jest.Mock).mock.calls,
    ...(log.error as jest.Mock).mock.calls,
  ]);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://hannahandchris.wedding";
  mockState.mockResolvedValue({
    configured: true,
    enabled: true,
    available: true,
  });
  mockSend.mockResolvedValue({ ok: true, sid: "SM1" });
});

describe("getConsentPrompt", () => {
  it("lists only the numbers not yet asked, masked", async () => {
    const { db } = guestDb();
    expect(await getConsentPrompt(db)).toEqual({
      available: true,
      pending: [
        { id: "p1", masked: "(•••) •••-0123" },
        { id: "p4", masked: "(•••) •••-0126" },
      ],
    });
  });

  it("shows nothing and reads nothing when texting is not available", async () => {
    mockState.mockResolvedValue({
      configured: false,
      enabled: false,
      available: false,
    });
    const { db, rpc } = guestDb();
    expect(await getConsentPrompt(db)).toEqual({
      available: false,
      pending: [],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a failed read as nothing to ask", async () => {
    const db = {
      rpc: jest.fn(async () => ({ data: null, error: { message: "x" } })),
    } as never;
    expect(await getConsentPrompt(db)).toEqual({
      available: true,
      pending: [],
    });
  });
});

describe("sendConfirmationText", () => {
  it("sends the registered confirmation to the number with the status callback", async () => {
    expect(await sendConfirmationText("+12025550123")).toEqual({ ok: true });
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe("+12025550123");
    expect(arg.body).toContain("Reply HELP for help, STOP to opt out");
    expect(arg.statusCallback).toBe(
      "https://hannahandchris.wedding/api/webhooks/twilio",
    );
  });

  it("returns a code and never throws when the send fails", async () => {
    mockSend.mockResolvedValue({ ok: false, code: "30006" });
    expect(await sendConfirmationText("+12025550123")).toEqual({
      ok: false,
      code: "30006",
    });
    mockSend.mockRejectedValue(new Error("boom +12025550123"));
    expect(await sendConfirmationText("+12025550123")).toEqual({
      ok: false,
      code: "exception",
    });
    expect(loggedText()).not.toContain("2025550123");
  });
});

describe("answerConsent", () => {
  it("records the answers and sends one confirmation for each number newly opted in", async () => {
    const { db, rpc } = guestDb({ data: ["p1"], error: null });
    const out = await answerConsent(db, [
      { id: "p1", opt_in: true },
      { id: "p4", opt_in: false },
    ]);
    expect(out).toEqual({ ok: true, saved: 2 });
    expect(rpc).toHaveBeenCalledWith("record_sms_consent", {
      answers: [
        { contact_id: "p1", opt_in: true },
        { contact_id: "p4", opt_in: false },
      ],
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("+12025550123");
  });

  it("sends nothing when nobody newly opted in", async () => {
    const { db } = guestDb({ data: [], error: null });
    await answerConsent(db, [{ id: "p4", opt_in: false }]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("keeps the recorded opt-in even if the confirmation fails", async () => {
    mockSend.mockResolvedValue({ ok: false, code: "30003" });
    const { db } = guestDb({ data: ["p1"], error: null });
    expect(await answerConsent(db, [{ id: "p1", opt_in: true }])).toEqual({
      ok: true,
      saved: 1,
    });
    expect(loggedText()).toContain("30003");
  });

  it("refuses while texting is not available, recording nothing", async () => {
    mockState.mockResolvedValue({
      configured: true,
      enabled: false,
      available: false,
    });
    const { db, rpc } = guestDb();
    expect(await answerConsent(db, [{ id: "p1", opt_in: true }])).toEqual({
      ok: false,
      code: "texting_unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a database failure as an error", async () => {
    const { db } = guestDb({
      data: null,
      error: { message: "x", code: "P0001" },
    });
    expect(await answerConsent(db, [{ id: "p1", opt_in: true }])).toEqual({
      ok: false,
      code: "record_failed",
    });
  });
});
