import { render, screen } from "@testing-library/react";

const mockGetSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));

const mockState = jest.fn();
jest.mock("@/lib/sms/state", () => ({
  getSmsState: (...a: unknown[]) => mockState(...a),
}));
const mockPrompt = jest.fn();
jest.mock("@/lib/sms/consent", () => ({
  getConsentPrompt: (...a: unknown[]) => mockPrompt(...a),
}));

import HomePage, { dynamic } from "../page";

async function show() {
  render(await HomePage());
}

describe("home page", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockState.mockReset();
    mockPrompt.mockReset();
    mockState.mockResolvedValue({
      configured: false,
      enabled: false,
      available: false,
    });
  });

  it("is read on every request, because it depends on the session cookie", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each(["guest", "staff"])(
    "shows the placeholder to a %s session",
    async (kind) => {
      mockGetSession.mockResolvedValue({ kind });
      await show();
      expect(screen.getByText("Coming soon 👀")).toBeInTheDocument();
    },
  );

  it("does not show the placeholder with no session", async () => {
    mockGetSession.mockResolvedValue(null);
    await show();
    expect(screen.queryByText("Coming soon 👀")).toBeNull();
  });

  it("treats an error reading the session as signed out", async () => {
    mockGetSession.mockRejectedValue(new Error("down"));
    await show();
    expect(screen.queryByText("Coming soon 👀")).toBeNull();
  });

  it("asks a signed-in guest about their numbers only while texting is available", async () => {
    mockState.mockResolvedValue({
      configured: true,
      enabled: true,
      available: true,
    });
    mockGetSession.mockResolvedValue({ kind: "guest", supabase: {} });
    mockPrompt.mockResolvedValue({
      available: true,
      pending: [{ id: "p1", masked: "(•••) •••-0123" }],
    });
    await show();
    expect(
      screen.getByRole("heading", { name: "Would you like text updates?" }),
    ).toBeInTheDocument();
  });

  it("never reads the numbers while texting is not available", async () => {
    mockGetSession.mockResolvedValue({ kind: "guest", supabase: {} });
    await show();
    expect(mockPrompt).not.toHaveBeenCalled();
    expect(screen.getByText("Coming soon 👀")).toBeInTheDocument();
  });

  it("never asks staff", async () => {
    mockState.mockResolvedValue({
      configured: true,
      enabled: true,
      available: true,
    });
    mockGetSession.mockResolvedValue({ kind: "staff", supabase: {} });
    await show();
    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it("shows the phone-aware prompt to a visitor only when texting is available", async () => {
    mockState.mockResolvedValue({
      configured: true,
      enabled: true,
      available: true,
    });
    mockGetSession.mockResolvedValue(null);
    await show();
    expect(screen.getByLabelText("Email or mobile number")).toBeInTheDocument();
  });
});
