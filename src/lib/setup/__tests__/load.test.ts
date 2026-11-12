/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
import { loadSetup } from "../load";
import { log } from "@/lib/log";

jest.mock("@/lib/log", () => ({ log: { error: jest.fn(), info: jest.fn() } }));

type Reply = { data: unknown; error?: unknown };

function fakeDb(replies: Record<string, Reply>, calls: string[] = []) {
  const chain = (name: string) => {
    const reply = replies[name] ?? { data: null };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: () => Promise.resolve({ error: null, ...reply }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ error: null, ...reply }).then(ok),
    };
    return q;
  };
  return {
    from: (table: string) => {
      calls.push(table);
      return chain(table);
    },
    rpc: (fn: string) => {
      calls.push(`rpc:${fn}`);
      return Promise.resolve({
        error: null,
        ...(replies[`rpc:${fn}`] ?? { data: null }),
      });
    },
  };
}

const base = {
  settings: {
    data: {
      wedding_event_id: "e1",
      rsvp_open: false,
      default_rsvp_deadline: null,
      save_the_date_place: "Seattle",
      save_the_date_note: "Invitation to follow",
      sms_enabled: false,
    },
  },
  "rpc:get_save_the_date": { data: { date: "2027-06-12", revision: 1 } },
  events: {
    data: [{ id: "e1", name: "Ceremony", starts_at: "2027-06-12T23:00:00Z" }],
  },
  setup_guide_state: { data: null },
  setup_confirmations: { data: [{ step_key: "sending_domain" }] },
};

const env = {
  NEXT_PUBLIC_SITE_URL: "https://example.test",
  RESEND_API_KEY: "SENTINEL-KEY-123",
  EMAIL_FROM: "Hi <hi@example.test>",
  INVITE_LINK_SECRET: "SENTINEL-LINK-456",
  CRON_SECRET: "SENTINEL-CRON-789",
};

describe("loadSetup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads settings, the person's state, confirmations and events, and returns the view", async () => {
    const calls: string[] = [];
    const view = await loadSetup(
      fakeDb(base, calls) as never,
      "user-1",
      "couple",
      env,
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        "settings",
        "events",
        "setup_guide_state",
        "setup_confirmations",
        "rpc:get_save_the_date",
      ]),
    );
    expect(view?.requiredOpen).toBe(0);
    expect(view?.mode).toBe("hidden");
    expect(view?.events).toEqual([
      { id: "e1", name: "Ceremony", date: "2027-06-12" },
    ]);
    expect(view?.steps.find((s) => s.key === "sending_domain")?.status).toBe(
      "done",
    );
  });

  it("shows the full banner for a person with no stored state when something is missing", async () => {
    const view = await loadSetup(fakeDb(base) as never, "user-1", "planner", {
      ...env,
      CRON_SECRET: "",
    });
    expect(view?.mode).toBe("full");
    expect(view?.requiredOpen).toBe(1);
  });

  it("reads the state from the person's own row, so another browser sees the same", async () => {
    const stored = {
      ...base,
      setup_guide_state: {
        data: {
          skipped_steps: ["schedule_key"],
          last_step: "schedule_key",
          left_guide: true,
          seen_required: ["schedule_key"],
        },
      },
    };
    const view = await loadSetup(fakeDb(stored) as never, "user-1", "couple", {
      ...env,
      CRON_SECRET: "",
    });
    expect(view?.mode).toBe("compact");
    expect(view?.skippedCount).toBe(1);
    expect(view?.resumeKey).toBe("schedule_key");
  });

  it("returns null and logs only the failing read's name when a read fails", async () => {
    const failing = {
      ...base,
      settings: {
        data: null,
        error: { message: "boom: someone@example.test" },
      },
    };
    const view = await loadSetup(
      fakeDb(failing) as never,
      "user-1",
      "couple",
      env,
    );
    expect(view).toBeNull();
    expect(log.error).toHaveBeenCalledWith("setup_read_failed", {
      code: "settings",
    });
    expect(JSON.stringify((log.error as jest.Mock).mock.calls)).not.toContain(
      "someone@example.test",
    );
  });

  it("never puts a secret value in the result", async () => {
    const view = await loadSetup(
      fakeDb(base) as never,
      "user-1",
      "couple",
      env,
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain("SENTINEL");
    expect(text).not.toContain("hi@example.test");
  });
});
