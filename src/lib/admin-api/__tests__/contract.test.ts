/** @jest-environment node */
import { existsSync } from "node:fs";
import {
  endpointsInMarkdown,
  endpointsOnDisk,
} from "@/lib/__tests__/fixtures/endpoint-tables";
import { AuthError } from "@/lib/auth/guards";

const mockSignInWithOtp = jest.fn();
const mockRequireStaff = jest.fn();
const mockRequireCouple = jest.fn();
jest.mock("@/lib/log");
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp: mockSignInWithOtp, signOut: async () => ({}) },
  }),
}));
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
  requireCouple: () => mockRequireCouple(),
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

import { POST as signIn } from "@/app/api/admin/sign-in/route";
import { POST as signOut } from "@/app/api/admin/sign-out/route";
import { POST as createHouseholdRoute } from "@/app/api/admin/households/route";
import {
  PATCH as patchHousehold,
  DELETE as deleteHouseholdRoute,
} from "@/app/api/admin/households/[id]/route";
import { POST as importRoute } from "@/app/api/admin/guests/import/route";
import { POST as sendRoute } from "@/app/api/admin/campaigns/[id]/send/route";
import { GET as exportRoute } from "@/app/api/admin/exports/[kind]/route";
import { POST as grantStaff } from "@/app/api/admin/staff/route";
import { DELETE as revokeStaff } from "@/app/api/admin/staff/[userId]/route";
import {
  createHouseholdResponseSchema,
  errorBodySchema,
  importResponseSchema,
  updateHouseholdResponseSchema,
} from "../schemas";
import { sendCampaignResponseSchema } from "../campaign-schemas";
import { grantStaffResponseSchema } from "../staff-schemas";

const CONTRACT = "specs/001-guest-data-model/contracts/admin-api.md";
const DOC = "docs/admin-api.md";
const ID = "11111111-1111-4111-8111-111111111111";

const ctx = <T extends object>(params: T) => ({
  params: Promise.resolve(params),
});
const json = (method: string, body: unknown = {}) =>
  new Request("http://localhost:3000/api/admin/x", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  allow = true;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  mockRequireStaff.mockResolvedValue({ supabase: {} });
  mockRequireCouple.mockResolvedValue({ supabase: {} });
});

describe("admin API documentation matches the route handlers", () => {
  it("the contract table lists exactly the admin routes on disk, plus the callback", () => {
    const listed = endpointsInMarkdown(CONTRACT).filter(
      (e) => e !== "GET /auth/callback",
    );
    expect(listed).toEqual(endpointsOnDisk("app/api/admin"));
    expect(endpointsInMarkdown(CONTRACT)).toContain("GET /auth/callback");
    expect(existsSync("src/app/auth/callback/route.ts")).toBe(true);
  });

  it("the published document lists the same endpoints as the contract", () => {
    expect(endpointsInMarkdown(DOC)).toEqual(endpointsInMarkdown(CONTRACT));
  });
});

describe("admin API responses parse against the exported schemas", () => {
  it("sign-in: neutral 202, 422, 429; sign-out 204", async () => {
    const ok = await signIn(json("POST", { email: "staff@example.com" }));
    expect(ok.status).toBe(202);
    expect(typeof (await ok.json()).message).toBe("string");

    const bad = await signIn(json("POST", { email: "nope" }));
    expect(bad.status).toBe(422);
    expect(errorBodySchema.safeParse(await bad.json()).success).toBe(true);

    allow = false;
    const limited = await signIn(json("POST", { email: "staff@example.com" }));
    expect(limited.status).toBe(429);
    expect(errorBodySchema.safeParse(await limited.json()).success).toBe(true);

    expect((await signOut()).status).toBe(204);
  });

  const guarded: [string, "staff" | "couple", () => Promise<Response>][] = [
    ["POST households", "staff", () => createHouseholdRoute(json("POST"))],
    [
      "PATCH households/[id]",
      "staff",
      () => patchHousehold(json("PATCH"), ctx({ id: ID })),
    ],
    [
      "DELETE households/[id]",
      "staff",
      () => deleteHouseholdRoute(json("DELETE"), ctx({ id: ID })),
    ],
    ["POST guests/import", "staff", () => importRoute(json("POST"))],
    [
      "POST campaigns/[id]/send",
      "staff",
      () => sendRoute(json("POST"), ctx({ id: ID })),
    ],
    [
      "GET exports/[kind]",
      "staff",
      () => exportRoute(json("GET"), ctx({ kind: "guests" })),
    ],
    ["POST staff", "couple", () => grantStaff(json("POST"))],
    [
      "DELETE staff/[userId]",
      "couple",
      () => revokeStaff(json("DELETE"), ctx({ userId: ID })),
    ],
  ];

  it.each(guarded)(
    "%s: 401 and 403 are error bodies",
    async (_name, guard, call) => {
      const mock = guard === "couple" ? mockRequireCouple : mockRequireStaff;
      mock.mockRejectedValueOnce(new AuthError(401, "unauthenticated"));
      const unauth = await call();
      expect(unauth.status).toBe(401);
      expect(errorBodySchema.safeParse(await unauth.json()).success).toBe(true);

      mock.mockRejectedValueOnce(new AuthError(403, "forbidden"));
      const forbidden = await call();
      expect(forbidden.status).toBe(403);
      expect(errorBodySchema.safeParse(await forbidden.json()).success).toBe(
        true,
      );
    },
  );

  it("success bodies in the contract parse against their schemas", () => {
    const household = {
      id: ID,
      display_name: "The Fakes",
      contact_email: null,
      plus_one_allowance: 0,
      paper_only: true,
    };
    expect(
      createHouseholdResponseSchema.safeParse({
        household,
        guest_ids: [ID],
      }).success,
    ).toBe(true);
    expect(updateHouseholdResponseSchema.safeParse({ household }).success).toBe(
      true,
    );
    expect(
      importResponseSchema.safeParse({
        created: { households: 1, guests: 2, invitations: 3 },
        errors: [{ row: 4, field: "email", message: "Not valid" }],
      }).success,
    ).toBe(true);
    expect(
      sendCampaignResponseSchema.safeParse({
        campaign_id: ID,
        queued: 0,
        sent: 1,
        skipped: { no_email: 0, opted_out: 0, other: 0 },
        failed: 0,
      }).success,
    ).toBe(true);
    expect(
      grantStaffResponseSchema.safeParse({
        staff: { user_id: ID, role: "planner", display_name: "Fake Planner" },
      }).success,
    ).toBe(true);
  });
});
