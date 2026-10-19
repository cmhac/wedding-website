import { audienceSchema, MESSAGE_TYPE_KEYS } from "../audience";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("audienceSchema", () => {
  it.each([
    { scope: "all" },
    { scope: "household", household_id: id },
    { scope: "filter", filters: { required_events_unanswered: true } },
    { scope: "filter", filters: { invited_to_event: "rehearsal" } },
    {
      scope: "filter",
      filters: {
        invited_to_event: "welcome-party",
        optional_event_unanswered: "welcome-party",
        meals_not_chosen: true,
        not_yet_sent_message_type: "invitation",
        delivery_problem: true,
      },
    },
  ])("accepts %j", (audience) => {
    expect(audienceSchema.safeParse(audience).success).toBe(true);
  });

  it.each([
    ["all with filters", { scope: "all", filters: { delivery_problem: true } }],
    ["all with household_id", { scope: "all", household_id: id }],
    ["household without id", { scope: "household" }],
    ["household with bad id", { scope: "household", household_id: "nope" }],
    [
      "household with filters",
      { scope: "household", household_id: id, filters: {} },
    ],
    ["filter without filters", { scope: "filter" }],
    ["filter with empty filters", { scope: "filter", filters: {} }],
    [
      "unknown filter key",
      { scope: "filter", filters: { favourite_colour: "red" } },
    ],
    ["unknown scope", { scope: "everyone" }],
    [
      "unknown message type",
      { scope: "filter", filters: { not_yet_sent_message_type: "spam" } },
    ],
    [
      "bad event slug",
      { scope: "filter", filters: { invited_to_event: "Not A Slug" } },
    ],
  ])("rejects %s", (_name, audience) => {
    expect(audienceSchema.safeParse(audience).success).toBe(false);
  });

  it("accepts every known message type key", () => {
    for (const key of MESSAGE_TYPE_KEYS) {
      expect(
        audienceSchema.safeParse({
          scope: "filter",
          filters: { not_yet_sent_message_type: key },
        }).success,
      ).toBe(true);
    }
  });
});
