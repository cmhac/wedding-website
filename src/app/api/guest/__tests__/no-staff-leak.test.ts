/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const mockRpc = jest.fn();
const mockRequireGuest = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));

import { GET as getRsvp, PUT as putRsvp } from "../rsvp/route";
import { POST as postPlusOne } from "../plus-one/route";
import { POST as postOptOut } from "../opt-out/route";

const GUEST = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";

/** Keys that belong to staff, other households, or internals. */
const FORBIDDEN_KEYS = [
  "notes",
  "address",
  "household_id",
  "auth_user_id",
  "contact_email",
  "messages",
  "audit_log",
  "rsvp_history",
  "meal_selection_history",
  "changed_by",
  "responded_by",
  "invited_by",
  "chosen_by",
  "rsvp_deadline_override",
  "delivery_problem",
];

function keysDeep(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      found.push(k);
      keysDeep(v, found);
    }
  }
  return found;
}

/** A response shaped like the contract: what the database function may return. */
const CONTRACT_RSVP = {
  household: {
    display_name: "The Fakes",
    plus_one_allowance: 1,
    message_to_couple: null,
    reminders_opt_out: false,
  },
  guests: [
    {
      id: GUEST,
      first_name: "Ada",
      last_name: "Fake",
      is_placeholder: false,
      dietary_notes: null,
      dietary: [],
      invitations: [
        {
          status: "attending",
          event: {
            id: EVENT,
            slug: "ceremony",
            name: "Ceremony",
            starts_at: "2027-06-01T12:00:00Z",
            venue_name: "Fake Hall",
            is_required: true,
            group_key: null,
            display_order: 1,
            deadline: null,
            closed: false,
          },
          menu: { status: "published", courses: [], selection: [] },
        },
      ],
    },
  ],
  dietary_categories: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireGuest.mockResolvedValue({ supabase: { rpc: mockRpc } });
  mockRpc.mockResolvedValue({ data: CONTRACT_RSVP, error: null });
});

const json = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("guest API never exposes staff-only data", () => {
  it("a contract-shaped RSVP body has no staff keys and only one household", async () => {
    const body = await (await getRsvp()).json();
    const keys = keysDeep(body);
    for (const forbidden of FORBIDDEN_KEYS)
      expect(keys).not.toContain(forbidden);
    expect(body.household.display_name).toBe("The Fakes");
    expect(body).not.toHaveProperty("households");
    expect(body.guests.every((g: { id: string }) => g.id === GUEST)).toBe(true);
  });

  it("no guest route accepts a household id from the client", async () => {
    await putRsvp(
      json("/api/guest/rsvp", "PUT", {
        household_id: "99999999-9999-4999-8999-999999999999",
        guests: [{ guest_id: GUEST, responses: [] }],
      }),
    );
    const payload = mockRpc.mock.calls[0][1].payload;
    expect(keysDeep(payload)).not.toContain("household_id");
  });

  it("error bodies carry only the contract shape, never database text", async () => {
    const dbText = "row for household notes SECRET-NOTE audit_log";
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: dbText, details: dbText, hint: dbText },
    });
    const responses = [
      await getRsvp(),
      await putRsvp(
        json("/api/guest/rsvp", "PUT", {
          guests: [{ guest_id: GUEST, responses: [] }],
        }),
      ),
      await postPlusOne(
        json("/api/guest/plus-one", "POST", {
          guest_id: GUEST,
          first_name: "Sam",
          last_name: "Fake",
        }),
      ),
      await postOptOut(json("/api/guest/opt-out", "POST", { opt_out: true })),
    ];
    for (const res of responses) {
      const text = await res.text();
      expect(text).not.toContain("SECRET-NOTE");
      expect(text).not.toContain("audit_log");
      expect(Object.keys(JSON.parse(text))).toEqual(["error"]);
    }
  });
});

describe("guest route handlers are structurally limited", () => {
  const root = join(__dirname, "..");
  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === "__tests__") return [];
      if (statSync(path).isDirectory()) return routeFiles(path);
      return name === "route.ts" ? [path] : [];
    });
  }

  it("never uses the service-role client or reads tables directly", () => {
    const files = routeFiles(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/createAdminSupabase|supabase\/admin/);
      expect(source).not.toMatch(/\.from\(/);
    }
  });

  it("only calls the guest database functions", () => {
    const allowed = new Set([
      "get_my_rsvp",
      "submit_household_rsvp",
      "name_plus_one",
      "set_reminders_opt_out",
    ]);
    const called = new Set<string>();
    for (const file of routeFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/callRpc\(\s*[\w.]+,\s*"([a-z_]+)"/g)) {
        called.add(m[1]);
      }
    }
    expect(called.size).toBeGreaterThan(0);
    for (const name of called) {
      expect(allowed.has(name)).toBe(true);
    }
  });
});
