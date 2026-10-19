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
