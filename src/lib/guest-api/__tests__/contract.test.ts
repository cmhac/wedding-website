/** @jest-environment node */
import { existsSync } from "node:fs";
import {
  endpointsInMarkdown,
  endpointsOnDisk,
} from "@/lib/__tests__/fixtures/endpoint-tables";
import { AuthError } from "@/lib/auth/guards";

const mockSignInWithOtp = jest.fn();
const mockRpc = jest.fn();
const mockRequireGuest = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp: mockSignInWithOtp, signOut: async () => ({}) },
  }),
}));
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));
let allow = true;
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: () => ({ check: () => allow }),
}));

jest.mock("@/lib/sign-in-timing", () => ({
  withMinimumDuration: async (_ms: number, work: () => Promise<unknown>) => {
    await work().catch(() => {});
  },
}));

import { POST as signIn } from "@/app/api/guest/sign-in/route";
import { POST as signOut } from "@/app/api/guest/sign-out/route";
import { GET as getRsvp, PUT as putRsvp } from "@/app/api/guest/rsvp/route";
import { POST as plusOne } from "@/app/api/guest/plus-one/route";
import { POST as optOut } from "@/app/api/guest/opt-out/route";
import {
  errorBodySchema,
  optOutResponseSchema,
  rsvpResponseSchema,
  signInResponseSchema,
} from "../schemas";

const GUEST = "11111111-1111-4111-8111-111111111111";
const CONTRACT = "specs/001-guest-data-model/contracts/guest-api.md";
const DOC = "docs/guest-api.md";

const json = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const RSVP = {
  household: {
    display_name: "The Fakes",
    plus_one_allowance: 1,
    message_to_couple: null,
    reminders_opt_out: false,
  },
  guests: [],
  dietary_categories: [{ key: "nuts", label: "Nuts", kind: "allergen" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  allow = true;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  mockRequireGuest.mockResolvedValue({ supabase: { rpc: mockRpc } });
  mockRpc.mockResolvedValue({ data: RSVP, error: null });
});

describe("guest API documentation matches the route handlers", () => {
  const onDisk = endpointsOnDisk("app/api/guest");

  it("the contract table lists exactly the guest routes on disk, plus the callback", () => {
    const listed = endpointsInMarkdown(CONTRACT).filter(
      (e) => e !== "GET /auth/callback",
    );
    expect(listed).toEqual(onDisk);
    expect(endpointsInMarkdown(CONTRACT)).toContain("GET /auth/callback");
    expect(existsSync("src/app/auth/callback/route.ts")).toBe(true);
  });

  it("the published document lists the same endpoints as the contract", () => {
    expect(endpointsInMarkdown(DOC)).toEqual(endpointsInMarkdown(CONTRACT));
  });
});

describe("guest API responses parse against the exported schemas", () => {
  it("sign-in: 202 neutral message, 422 and 429 errors", async () => {
    const ok = await signIn(
      json("/api/guest/sign-in", "POST", { email: "a@example.com" }),
    );
    expect(ok.status).toBe(202);
    expect(signInResponseSchema.safeParse(await ok.json()).success).toBe(true);

    const bad = await signIn(
      json("/api/guest/sign-in", "POST", { email: "nope" }),
    );
    expect(bad.status).toBe(422);
    expect(errorBodySchema.safeParse(await bad.json()).success).toBe(true);

    allow = false;
    const limited = await signIn(
      json("/api/guest/sign-in", "POST", { email: "a@example.com" }),
    );
    expect(limited.status).toBe(429);
    expect(errorBodySchema.safeParse(await limited.json()).success).toBe(true);
  });

  it("sign-out: 204 with no body", async () => {
    const res = await signOut();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("rsvp GET and PUT: 200 body parses; 401 and 403 are error bodies", async () => {
    const put = () =>
      putRsvp(
        json("/api/guest/rsvp", "PUT", {
          guests: [{ guest_id: GUEST, responses: [] }],
        }),
      );
    for (const call of [() => getRsvp(), put]) {
      const ok = await call();
      expect(ok.status).toBe(200);
      expect(rsvpResponseSchema.safeParse(await ok.json()).success).toBe(true);

      mockRequireGuest.mockRejectedValueOnce(
        new AuthError(401, "unauthenticated"),
      );
      const unauth = await call();
      expect(unauth.status).toBe(401);
      expect(errorBodySchema.safeParse(await unauth.json()).success).toBe(true);

      mockRequireGuest.mockRejectedValueOnce(new AuthError(403, "forbidden"));
      const forbidden = await call();
      expect(forbidden.status).toBe(403);
      expect(errorBodySchema.safeParse(await forbidden.json()).success).toBe(
        true,
      );
    }
  });

  it("rsvp PUT: 422 carries issues; closed RSVPs answer 409 rsvp_closed", async () => {
    const invalid = await putRsvp(
      json("/api/guest/rsvp", "PUT", { guests: "x" }),
    );
    expect(invalid.status).toBe(422);
    const body = await invalid.json();
    expect(errorBodySchema.safeParse(body).success).toBe(true);
    expect(body.error.issues.length).toBeGreaterThan(0);

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "rsvp_closed", code: "P0001" },
    });
    const closed = await putRsvp(
      json("/api/guest/rsvp", "PUT", {
        guests: [{ guest_id: GUEST, responses: [] }],
      }),
    );
    expect(closed.status).toBe(409);
    const closedBody = await closed.json();
    expect(errorBodySchema.safeParse(closedBody).success).toBe(true);
    expect(closedBody.error.code).toBe("rsvp_closed");
  });

  it("opt-out: 200 body parses; 401 and 422 are error bodies", async () => {
    mockRpc.mockResolvedValue({ data: { opt_out: true }, error: null });
    const ok = await optOut(
      json("/api/guest/opt-out", "POST", { opt_out: true }),
    );
    expect(ok.status).toBe(200);
    expect(optOutResponseSchema.safeParse(await ok.json()).success).toBe(true);

    const invalid = await optOut(
      json("/api/guest/opt-out", "POST", { opt_out: "yes" }),
    );
    expect(invalid.status).toBe(422);
    expect(errorBodySchema.safeParse(await invalid.json()).success).toBe(true);

    mockRequireGuest.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    const unauth = await optOut(
      json("/api/guest/opt-out", "POST", { opt_out: true }),
    );
    expect(unauth.status).toBe(401);
    expect(errorBodySchema.safeParse(await unauth.json()).success).toBe(true);
  });

  it("plus-one: 401 and 422 are error bodies", async () => {
    mockRequireGuest.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    const unauth = await plusOne(
      json("/api/guest/plus-one", "POST", {
        guest_id: GUEST,
        first_name: "A",
        last_name: "B",
      }),
    );
    expect(unauth.status).toBe(401);
    expect(errorBodySchema.safeParse(await unauth.json()).success).toBe(true);

    const invalid = await plusOne(
      json("/api/guest/plus-one", "POST", { guest_id: "x" }),
    );
    expect(invalid.status).toBe(422);
    expect(errorBodySchema.safeParse(await invalid.json()).success).toBe(true);
  });
});
