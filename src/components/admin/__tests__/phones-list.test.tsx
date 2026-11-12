import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhonesList } from "../PhonesList";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockConsent = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  setPhoneConsent: (...a: unknown[]) => mockConsent(...a),
  addPhone: (...a: unknown[]) => mockAdd(...a),
  updatePhone: (...a: unknown[]) => mockUpdate(...a),
  removePhone: (...a: unknown[]) => mockRemove(...a),
}));

const phones = [
  {
    id: "p1",
    value: "+12025550123",
    deliveryProblem: false,
    consent: "opted_in",
    consentAt: "2027-02-01T18:00:00Z",
    consentSource: "guest" as const,
    consentBy: null,
    consentNote: null,
    overrodeDecline: false,
  },
  {
    id: "p2",
    value: "+12025550124",
    deliveryProblem: true,
    consent: "declined",
    consentAt: "2027-02-02T18:00:00Z",
    consentSource: "guest" as const,
    consentBy: null,
    consentNote: null,
    overrodeDecline: false,
  },
  {
    id: "p3",
    value: "+12025550125",
    deliveryProblem: false,
    consent: "not_asked",
    consentAt: null,
    consentSource: null,
    consentBy: null,
    consentNote: null,
    overrodeDecline: false,
  },
];

const marked = {
  id: "p4",
  value: "+12025550126",
  deliveryProblem: false,
  consent: "opted_in",
  consentAt: "2027-02-03T18:00:00Z",
  consentSource: "staff" as const,
  consentBy: "Hannah",
  consentNote: "address form, October",
  overrodeDecline: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PhonesList", () => {
  it("shows each number formatted, with its opt-in state and any delivery problem", () => {
    render(<PhonesList householdId="h1" phones={phones} />);
    expect(screen.getByText("(202) 555-0123")).toBeInTheDocument();
    expect(screen.getByText(/Opted in/)).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
    expect(screen.getByText("Not asked")).toBeInTheDocument();
    expect(screen.getByText("Delivery problem")).toBeInTheDocument();
  });

  it("drops the flag once the number is corrected or removed (the data no longer carries it)", () => {
    const { rerender } = render(
      <PhonesList householdId="h1" phones={phones} />,
    );
    expect(screen.getByText("Delivery problem")).toBeInTheDocument();
    // A corrected number comes back unflagged and not asked.
    const corrected = phones.map((x) =>
      x.id === "p2"
        ? {
            ...x,
            deliveryProblem: false,
            consent: "not_asked",
            consentAt: null,
          }
        : x,
    );
    rerender(<PhonesList householdId="h1" phones={corrected} />);
    expect(screen.queryByText("Delivery problem")).toBeNull();
    // A removed number is gone with its flag.
    rerender(
      <PhonesList
        householdId="h1"
        phones={phones.filter((x) => x.id !== "p2")}
      />,
    );
    expect(screen.queryByText("Delivery problem")).toBeNull();
    expect(screen.queryByText("(202) 555-0124")).toBeNull();
  });

  it("has no checkbox, and offers a mark as consented button only for numbers that have not opted in", () => {
    render(<PhonesList householdId="h1" phones={phones} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Mark (202) 555-0123 as consented",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mark (202) 555-0125 as consented" }),
    ).toBeInTheDocument();
  });

  it("says a household with no numbers has none, without calling it paper only", () => {
    render(<PhonesList householdId="h1" phones={[]} />);
    expect(screen.getByText(/No phone numbers/)).toBeInTheDocument();
  });

  it("adds a number and refreshes", async () => {
    mockAdd.mockResolvedValue({ ok: true, data: { contact: { id: "p9" } } });
    render(<PhonesList householdId="h1" phones={[]} />);
    fireEvent.change(screen.getByLabelText("Add a phone number"), {
      target: { value: "(202) 555-0199" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add number" }));
    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith("h1", "(202) 555-0199"),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText(/Number added/)).toBeInTheDocument();
  });

  it("shows a plain message when the number is not a United States number", async () => {
    mockAdd.mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: "not_us_phone", message: "x" },
    });
    render(<PhonesList householdId="h1" phones={[]} />);
    fireEvent.change(screen.getByLabelText("Add a phone number"), {
      target: { value: "(416) 555-0123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add number" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only United States numbers are supported",
    );
  });

  it("changes a number and says its opt-in starts again", async () => {
    mockUpdate.mockResolvedValue({ ok: true, data: { contact: { id: "p1" } } });
    render(<PhonesList householdId="h1" phones={phones} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Change (202) 555-0123" }),
    );
    fireEvent.change(screen.getByLabelText("New number for (202) 555-0123"), {
      target: { value: "202-555-0177" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("h1", "p1", "202-555-0177"),
    );
    expect(
      await screen.findByText(/has not been asked about texts yet/),
    ).toBeInTheDocument();
  });

  it("removes a number after confirming", async () => {
    mockRemove.mockResolvedValue({ ok: true, data: { paper_only: false } });
    render(<PhonesList householdId="h1" phones={phones} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove (202) 555-0123" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove number" }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("h1", "p1"));
  });
});

describe("PhonesList consent marks", () => {
  beforeEach(() => {
    mockConsent.mockResolvedValue({
      ok: true,
      data: { counts: { marked: 1 } },
    });
  });

  it("shows how each answer was recorded, and who made a staff mark", () => {
    render(<PhonesList householdId="h1" phones={[...phones, marked]} />);
    expect(screen.getByText(/ticked by the guest/)).toBeInTheDocument();
    expect(screen.getByText(/marked by Hannah/)).toBeInTheDocument();
    expect(screen.getByText(/address form, October/)).toBeInTheDocument();
    expect(screen.getByText(/replaced a decline/i)).toBeInTheDocument();
  });

  it("marks a number not yet asked as consented, with a note, and sends no text", async () => {
    render(<PhonesList householdId="h1" phones={phones} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Mark (202) 555-0125 as consented" }),
    );
    fireEvent.change(screen.getByLabelText("Where the consent came from"), {
      target: { value: "address form" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark as consented" }));
    await waitFor(() =>
      expect(mockConsent).toHaveBeenCalledWith("h1", "p3", {
        mode: "mark",
        override_declined: false,
        note: "address form",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("asks first before marking a number that declined, then overrides", async () => {
    render(<PhonesList householdId="h1" phones={phones} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Mark (202) 555-0124 as consented" }),
    );
    expect(screen.getByText(/This number declined/)).toBeInTheDocument();
    expect(mockConsent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark it anyway" }));
    await waitFor(() =>
      expect(mockConsent).toHaveBeenCalledWith("h1", "p2", {
        mode: "mark",
        override_declined: true,
        note: "",
      }),
    );
  });

  it("clears a staff mark, and offers no clear for a guest's own tick", async () => {
    render(<PhonesList householdId="h1" phones={[phones[0], marked]} />);
    expect(
      screen.queryByRole("button", {
        name: "Clear consent mark for (202) 555-0123",
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear consent mark for (202) 555-0126",
      }),
    );
    await waitFor(() =>
      expect(mockConsent).toHaveBeenCalledWith("h1", "p4", { mode: "clear" }),
    );
  });

  it("shows a plain message when the change is refused", async () => {
    mockConsent.mockResolvedValue({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "x" },
    });
    render(<PhonesList householdId="h1" phones={phones} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Mark (202) 555-0125 as consented" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as consented" }));
    expect(
      await screen.findByText("You do not have access to this."),
    ).toBeInTheDocument();
  });
});
