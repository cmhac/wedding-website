import {
  signInRequestSchema,
  rsvpSubmitSchema,
  plusOneRequestSchema,
  optOutRequestSchema,
  optOutResponseSchema,
  rsvpResponseSchema,
  errorBodySchema,
} from "../schemas";

const GUEST = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";

describe("guest API meals and dietary schemas", () => {
  const COURSE = "33333333-3333-4333-8333-333333333333";
  const DISH = "44444444-4444-4444-8444-444444444444";
  const guest = (extra: object) => ({
    guests: [{ guest_id: GUEST, responses: [], ...extra }],
  });

  it("accepts meals, dietary entries, and dietary notes", () => {
    expect(
      rsvpSubmitSchema.safeParse(
        guest({
          dietary_notes: null,
          dietary: [{ category_key: "nuts", severity: "allergy" }],
          meals: [{ course_id: COURSE, dish_id: DISH }],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an unknown severity and non-uuid meal ids", () => {
    expect(
      rsvpSubmitSchema.safeParse(
        guest({ dietary: [{ category_key: "nuts", severity: "mild" }] }),
      ).success,
    ).toBe(false);
    expect(
      rsvpSubmitSchema.safeParse(
        guest({ meals: [{ course_id: "x", dish_id: DISH }] }),
      ).success,
    ).toBe(false);
  });

  it("parses a response that carries a menu with a selection", () => {
    const parsed = rsvpResponseSchema.safeParse({
      household: {
        display_name: "The Fakes",
        plus_one_allowance: 0,
        message_to_couple: null,
        reminders_opt_out: false,
      },
      guests: [
        {
          id: GUEST,
          first_name: "A",
          last_name: "B",
          is_placeholder: false,
          dietary: [],
          invitations: [
            {
              status: "attending",
              event: {
                id: EVENT,
                slug: "x",
                name: "X",
                starts_at: "2027-01-01T00:00:00Z",
                is_required: true,
                deadline: null,
                closed: false,
              },
              menu: {
                status: "published",
                courses: [
                  {
                    id: COURSE,
                    name: "Main",
                    requires_choice: true,
                    dishes: [{ id: DISH, name: "Fake dish", tags: [] }],
                  },
                ],
                selection: [{ course_id: COURSE, dish_id: DISH }],
              },
            },
          ],
        },
      ],
      dietary_categories: [{ key: "nuts", label: "Nuts", kind: "allergen" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("guest API request schemas", () => {
  it("accepts a valid sign-in email and rejects a malformed one", () => {
    expect(
      signInRequestSchema.safeParse({ email: "a@example.com" }).success,
    ).toBe(true);
    expect(signInRequestSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });

  it("accepts an RSVP payload and reports the path of a bad status", () => {
    const ok = rsvpSubmitSchema.safeParse({
      message_to_couple: null,
      guests: [
        {
          guest_id: GUEST,
          responses: [{ event_id: EVENT, status: "attending" }],
        },
      ],
    });
    expect(ok.success).toBe(true);

    const bad = rsvpSubmitSchema.safeParse({
      guests: [
        {
          guest_id: GUEST,
          responses: [{ event_id: EVENT, status: "pending" }],
        },
      ],
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual([
      "guests",
      0,
      "responses",
      0,
      "status",
    ]);
  });

  it("rejects non-uuid ids and an empty guest list", () => {
    expect(
      rsvpSubmitSchema.safeParse({
        guests: [{ guest_id: "x", responses: [] }],
      }).success,
    ).toBe(false);
    expect(rsvpSubmitSchema.safeParse({ guests: [] }).success).toBe(false);
  });

  it("limits the message length", () => {
    expect(
      rsvpSubmitSchema.safeParse({
        message_to_couple: "x".repeat(5001),
        guests: [{ guest_id: GUEST, responses: [] }],
      }).success,
    ).toBe(false);
  });

  it("requires a trimmed, non-empty plus-one name", () => {
    expect(
      plusOneRequestSchema.safeParse({
        guest_id: GUEST,
        first_name: "  Sam ",
        last_name: "Fake",
      }).data?.first_name,
    ).toBe("Sam");
    expect(
      plusOneRequestSchema.safeParse({
        guest_id: GUEST,
        first_name: " ",
        last_name: "Fake",
      }).success,
    ).toBe(false);
  });

  it("requires opt_out to be a boolean", () => {
    expect(optOutRequestSchema.safeParse({ opt_out: true }).success).toBe(true);
    expect(optOutRequestSchema.safeParse({ opt_out: "yes" }).success).toBe(
      false,
    );
    expect(optOutRequestSchema.safeParse({}).success).toBe(false);
    expect(optOutResponseSchema.safeParse({ opt_out: false }).success).toBe(
      true,
    );
  });
});

describe("guest API response schemas", () => {
  it("accepts the documented RSVP read shape", () => {
    const body = {
      household: {
        display_name: "The Fakes",
        plus_one_allowance: 1,
        message_to_couple: null,
        reminders_opt_out: false,
      },
      guests: [
        {
          id: GUEST,
          first_name: "Sam",
          last_name: "Fake",
          is_placeholder: false,
          invitations: [
            {
              status: "pending",
              event: {
                id: EVENT,
                slug: "welcome-party",
                name: "Welcome party",
                starts_at: "2027-06-01T18:00:00Z",
                venue_name: "Fake Hall",
                is_required: false,
                group_key: "wedding-weekend",
                display_order: 1,
                deadline: null,
                closed: false,
              },
            },
          ],
        },
      ],
    };
    expect(rsvpResponseSchema.safeParse(body).success).toBe(true);
  });

  it("accepts the shared error shape", () => {
    expect(
      errorBodySchema.safeParse({
        error: { code: "rsvp_closed", message: "Closed." },
      }).success,
    ).toBe(true);
  });
});
