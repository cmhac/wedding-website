/** @jest-environment node */
import { NextRequest, NextResponse } from "next/server";

const updateSession = jest.fn();
jest.mock("@/lib/supabase/middleware", () => ({
  updateSession: (r: NextRequest) => updateSession(r),
}));

import { config, proxy } from "../proxy";

describe("proxy", () => {
  it("refreshes the session and returns that response", async () => {
    const response = NextResponse.next();
    updateSession.mockResolvedValue(response);
    const request = new NextRequest("http://localhost:3000/admin");
    await expect(proxy(request)).resolves.toBe(response);
    expect(updateSession).toHaveBeenCalledWith(request);
  });

  it("skips static assets", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/_next/image")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
    expect(pattern.test("/logo.png")).toBe(false);
    expect(pattern.test("/admin")).toBe(true);
    expect(pattern.test("/api/guest/rsvp")).toBe(true);
  });
});
