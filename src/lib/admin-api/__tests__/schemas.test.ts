import {
  createHouseholdRequestSchema,
  createHouseholdResponseSchema,
  errorBodySchema,
  importResponseSchema,
  updateHouseholdRequestSchema,
  updateHouseholdResponseSchema,
} from "../schemas";

const guest = { first_name: "Ann", last_name: "Example" };

describe("createHouseholdRequestSchema", () => {
  it("accepts a household with guests and applies defaults", () => {
    const r = createHouseholdRequestSchema.parse({
      display_name: "Test Household",
      contact_email: "test@example.com",
      guests: [guest],
    });
    expect(r.plus_one_allowance).toBe(0);
    expect(r.guests).toHaveLength(1);
  });

  it("accepts a null contact email for a paper-only household", () => {
    expect(
      createHouseholdRequestSchema.safeParse({
        display_name: "Paper",
        contact_email: null,
        guests: [guest],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["no guests", { display_name: "X", guests: [] }],
    ["blank name", { display_name: " ", guests: [guest] }],
    [
      "bad email",
      { display_name: "X", contact_email: "nope", guests: [guest] },
    ],
    [
      "negative allowance",
      { display_name: "X", plus_one_allowance: -1, guests: [guest] },
    ],
    [
      "guest without last name",
      { display_name: "X", guests: [{ first_name: "Ann" }] },
    ],
  ])("rejects %s", (_label, body) => {
    expect(createHouseholdRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("updateHouseholdRequestSchema", () => {
  it("accepts clearing the contact email", () => {
    expect(
      updateHouseholdRequestSchema.safeParse({ contact_email: null }).success,
    ).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(updateHouseholdRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects fields it does not know", () => {
    expect(
      updateHouseholdRequestSchema.safeParse({ auth_user_id: "x" }).success,
    ).toBe(false);
  });
});

describe("response schemas", () => {
  const household = {
    id: "5f1c2b8e-1111-4222-8333-944455556666",
    display_name: "Test Household",
    contact_email: null,
    plus_one_allowance: 0,
    paper_only: true,
  };

  it("parses the create and update responses", () => {
    expect(
      createHouseholdResponseSchema.safeParse({
        household,
        guest_ids: [],
      }).success,
    ).toBe(true);
    expect(updateHouseholdResponseSchema.safeParse({ household }).success).toBe(
      true,
    );
  });

  it("parses the import response", () => {
    expect(
      importResponseSchema.safeParse({
        created: { households: 1, guests: 2, invitations: 3 },
        errors: [{ row: 4, field: "email", message: "Invalid" }],
      }).success,
    ).toBe(true);
  });

  it("parses the shared error body", () => {
    expect(
      errorBodySchema.safeParse({
        error: { code: "email_in_use", message: "In use." },
      }).success,
    ).toBe(true);
  });
});

describe("seed-shaped ids", () => {
  it("accepts a uuid-shaped user id that is not an RFC version 1-8 uuid", async () => {
    const { staffUserIdSchema } = await import("../staff-schemas");
    expect(
      staffUserIdSchema.safeParse("10000000-0000-0000-0000-000000000002")
        .success,
    ).toBe(true);
  });
});
