/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { AuthError } from "@/lib/auth/guards";

const mockRequireGuest = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));
const mockPrompt = jest.fn();
const mockAnswer = jest.fn();
jest.mock("@/lib/sms/consent", () => ({
  getConsentPrompt: (...a: unknown[]) => mockPrompt(...a),
  answerConsent: (...a: unknown[]) => mockAnswer(...a),
}));

import { GET, POST } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const post = (body: unknown, raw = false) =>
  new Request("http://localhost:3000/api/guest/sms-consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const supabase = { rpc: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireGuest.mockResolvedValue({ supabase });
  mockPrompt.mockResolvedValue({
    available: true,
    pending: [{ id: ID, masked: "(•••) •••-0123" }],
  });
  mockAnswer.mockResolvedValue({ ok: true, saved: 1 });
});

describe("GET /api/guest/sms-consent", () => {
  it("returns whether texting is available and the numbers still to ask about", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: true,
      pending: [{ id: ID, masked: "(•••) •••-0123" }],
    });
    expect(mockPrompt).toHaveBeenCalledWith(supabase);
  });

  it("returns an empty list while texting is not available", async () => {
    mockPrompt.mockResolvedValue({ available: false, pending: [] });
    expect(await (await GET()).json()).toEqual({
      available: false,
      pending: [],
    });
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
  ] as const)("answers %s without a guest session", async (status, code) => {
    mockRequireGuest.mockRejectedValue(new AuthError(status, code));
    expect((await GET()).status).toBe(status);
    expect(mockPrompt).not.toHaveBeenCalled();
  });
});

describe("POST /api/guest/sms-consent", () => {
  it("records the answers and returns how many were saved", async () => {
    const res = await POST(post({ answers: [{ id: ID, opt_in: true }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 1 });
    expect(mockAnswer).toHaveBeenCalledWith(supabase, [
      { id: ID, opt_in: true },
    ]);
  });

  it.each([
    ["no body", "{nope", true],
    ["no answers", { answers: [] }, false],
    [
      "too many answers",
      { answers: Array.from({ length: 11 }, () => ({ id: ID, opt_in: true })) },
      false,
    ],
    ["a non-boolean answer", { answers: [{ id: ID, opt_in: "yes" }] }, false],
    [
      "an id that is not a uuid",
      { answers: [{ id: "x", opt_in: true }] },
      false,
    ],
  ])("answers 422 for %s", async (_n, body, raw) => {
    expect((await POST(post(body, raw as boolean))).status).toBe(422);
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("answers 409 texting_unavailable while texting is not available", async () => {
    mockAnswer.mockResolvedValue({ ok: false, code: "texting_unavailable" });
    const res = await POST(post({ answers: [{ id: ID, opt_in: true }] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("texting_unavailable");
  });

  it("answers 500 when recording fails", async () => {
    mockAnswer.mockResolvedValue({ ok: false, code: "record_failed" });
    expect(
      (await POST(post({ answers: [{ id: ID, opt_in: true }] }))).status,
    ).toBe(500);
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
  ] as const)("answers %s without a guest session", async (status, code) => {
    mockRequireGuest.mockRejectedValue(new AuthError(status, code));
    expect(
      (await POST(post({ answers: [{ id: ID, opt_in: true }] }))).status,
    ).toBe(status);
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});
