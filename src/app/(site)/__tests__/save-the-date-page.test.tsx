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
class Redirected extends Error {
  constructor(public readonly to: string) {
    super("redirect");
  }
}
jest.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

import SaveTheDatePage, { dynamic } from "../save-the-date/page";

const rpc = jest.fn();
const details = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 1,
  wedding_event_set: true,
};

async function show() {
  render(await SaveTheDatePage());
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  rpc.mockImplementation(async (fn: string) =>
    fn === "get_save_the_date"
      ? { data: details, error: null }
      : { data: null, error: null },
  );
  mockGetSession.mockResolvedValue({ kind: "guest", supabase: { rpc } });
  mockState.mockResolvedValue({
    configured: false,
    enabled: false,
    available: false,
  });
  mockPrompt.mockResolvedValue({ available: false, pending: [] });
});

describe("the save the date page", () => {
  it("is read on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("sends a visitor who is not signed in to the sign-in prompt, showing nothing", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(SaveTheDatePage()).rejects.toMatchObject({ to: "/" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats an error reading the session as signed out", async () => {
    mockGetSession.mockRejectedValue(new Error("down"));
    await expect(SaveTheDatePage()).rejects.toMatchObject({ to: "/" });
  });

  it("shows a guest the card and records that the household opened the site", async () => {
    await show();
    expect(
      screen.getByText("Saturday, September 18, 2027"),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_save_the_date");
    expect(rpc).toHaveBeenCalledWith("record_household_opened");
  });

  it("shows staff the card without recording an open", async () => {
    mockGetSession.mockResolvedValue({ kind: "staff", supabase: { rpc } });
    await show();
    expect(
      screen.getByText("Saturday, September 18, 2027"),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("record_household_opened");
  });

  it("still shows the card when recording the open fails", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_household_opened") throw new Error("boom");
      return { data: details, error: null };
    });
    await show();
    expect(
      screen.getByText("Saturday, September 18, 2027"),
    ).toBeInTheDocument();
  });

  it("shows 'Details coming soon' when the details cannot be read", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "get_save_the_date"
        ? { data: null, error: { message: "boom" } }
        : { data: null, error: null },
    );
    await show();
    expect(screen.getByText("Details coming soon")).toBeInTheDocument();
  });

  it("offers the consent step below the date only while texting is available", async () => {
    mockPrompt.mockResolvedValue({
      available: true,
      pending: [{ id: "n1", masked: "(•••) •••-0123" }],
    });
    await show();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(mockPrompt).not.toHaveBeenCalled();

    mockState.mockResolvedValue({
      configured: true,
      enabled: true,
      available: true,
    });
    document.body.innerHTML = "";
    await show();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });
});
