import { audienceSchema } from "@/lib/campaigns/audience";
import {
  audienceFromForm,
  audienceToForm,
  describeAudience,
} from "../audience-form";

const HOUSEHOLD = "6f1d1f3e-2b0a-4c3a-9d55-0a7f6d8e9b10";

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const events = [
  { slug: "rehearsal", name: "Rehearsal" },
  { slug: "ceremony", name: "Ceremony" },
];

function audienceOf(entries: Array<[string, string]>) {
  const result = audienceFromForm(form(entries));
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.audience;
}

describe("audienceFromForm", () => {
  it("builds the everyone audience", () => {
    const audience = audienceOf([["audience_scope", "all"]]);
    expect(audience).toEqual({ scope: "all" });
    expect(audienceSchema.safeParse(audience).success).toBe(true);
  });

  it("builds a one-household audience", () => {
    const audience = audienceOf([
      ["audience_scope", "household"],
      ["household_id", HOUSEHOLD],
    ]);
    expect(audience).toEqual({ scope: "household", household_id: HOUSEHOLD });
    expect(audienceSchema.safeParse(audience).success).toBe(true);
  });

  it("asks for a household when none is given or the id is not valid", () => {
    for (const entries of [
      [["audience_scope", "household"]],
      [
        ["audience_scope", "household"],
        ["household_id", "nope"],
      ],
    ] as Array<Array<[string, string]>>) {
      const result = audienceFromForm(form(entries));
      expect(result).toEqual({
        ok: false,
        message: expect.stringMatching(/household/i),
      });
    }
  });

  it.each([
    [
      "invited_to_event",
      [
        ["filter_invited_to_event", "on"],
        ["invited_to_event", "rehearsal"],
      ],
      { invited_to_event: "rehearsal" },
    ],
    [
      "required_events_unanswered",
      [["filter_required_events_unanswered", "on"]],
      { required_events_unanswered: true },
    ],
    [
      "optional_event_unanswered",
      [
        ["filter_optional_event_unanswered", "on"],
        ["optional_event_unanswered", "welcome-party"],
      ],
      { optional_event_unanswered: "welcome-party" },
    ],
    [
      "meals_not_chosen",
      [["filter_meals_not_chosen", "on"]],
      { meals_not_chosen: true },
    ],
    [
      "not_yet_sent_message_type (follows the message type)",
      [
        ["filter_not_yet_sent_message_type", "on"],
        ["message_type_key", "rsvp_reminder"],
      ],
      { not_yet_sent_message_type: "rsvp_reminder" },
    ],
    [
      "delivery_problem",
      [["filter_delivery_problem", "on"]],
      { delivery_problem: true },
    ],
  ] as Array<[string, Array<[string, string]>, Record<string, unknown>]>)(
    "builds a filter audience for %s",
    (_name, entries, filters) => {
      const audience = audienceOf([["audience_scope", "filter"], ...entries]);
      expect(audience).toEqual({ scope: "filter", filters });
      expect(audienceSchema.safeParse(audience).success).toBe(true);
    },
  );

  it("combines several filters", () => {
    const audience = audienceOf([
      ["audience_scope", "filter"],
      ["filter_required_events_unanswered", "on"],
      ["filter_delivery_problem", "on"],
    ]);
    expect(audience).toEqual({
      scope: "filter",
      filters: { required_events_unanswered: true, delivery_problem: true },
    });
  });

  it("rejects a filter audience with no filter chosen", () => {
    expect(audienceFromForm(form([["audience_scope", "filter"]]))).toEqual({
      ok: false,
      message:
        "Choose at least one filter, or send to everyone or one household.",
    });
  });

  it("asks for an event when an event filter is ticked without one", () => {
    const result = audienceFromForm(
      form([
        ["audience_scope", "filter"],
        ["filter_invited_to_event", "on"],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/choose an event/i),
    });
  });

  it("rejects an unknown scope with a plain message", () => {
    const result = audienceFromForm(form([["audience_scope", "bogus"]]));
    expect(result.ok).toBe(false);
  });
});

describe("describeAudience", () => {
  it("describes everyone and one household", () => {
    expect(describeAudience({ scope: "all" }, events)).toBe("All households");
    expect(
      describeAudience({ scope: "household", household_id: HOUSEHOLD }, events),
    ).toBe("One household");
  });

  it("describes filters in words", () => {
    expect(
      describeAudience(
        { scope: "filter", filters: { required_events_unanswered: true } },
        events,
      ),
    ).toBe("Required answers outstanding");
    expect(
      describeAudience(
        { scope: "filter", filters: { invited_to_event: "rehearsal" } },
        events,
      ),
    ).toBe("Invited to Rehearsal");
  });

  it("joins several filters and falls back to the slug for an unknown event", () => {
    expect(
      describeAudience(
        {
          scope: "filter",
          filters: {
            invited_to_event: "gone-event",
            meals_not_chosen: true,
            delivery_problem: true,
          },
        },
        events,
      ),
    ).toBe("Invited to gone-event, meals not chosen, delivery problem");
  });
});

describe("audienceToForm", () => {
  it.each([
    [{ scope: "all" }],
    [{ scope: "household", household_id: HOUSEHOLD }],
    [
      {
        scope: "filter",
        filters: {
          invited_to_event: "rehearsal",
          required_events_unanswered: true,
          optional_event_unanswered: "welcome-party",
          meals_not_chosen: true,
          not_yet_sent_message_type: "invitation",
          delivery_problem: true,
        },
      },
    ],
  ])("round-trips %j", (audience) => {
    const values = audienceToForm(audience as never);
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.append(k, v);
    expect(audienceOf([...fd.entries()] as Array<[string, string]>)).toEqual(
      audience,
    );
  });
});
