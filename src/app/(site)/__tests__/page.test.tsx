import { render, screen } from "@testing-library/react";

const mockGetSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));

import HomePage, { dynamic } from "../page";

async function show() {
  render(await HomePage());
}

describe("home page", () => {
  beforeEach(() => mockGetSession.mockReset());

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
});
