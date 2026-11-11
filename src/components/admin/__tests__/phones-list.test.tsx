import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhonesList } from "../PhonesList";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
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
  },
  {
    id: "p2",
    value: "+12025550124",
    deliveryProblem: true,
    consent: "declined",
    consentAt: "2027-02-02T18:00:00Z",
  },
  {
    id: "p3",
    value: "+12025550125",
    deliveryProblem: false,
    consent: "not_asked",
    consentAt: null,
  },
];

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

  it("offers no way to opt a number in: there is no consent control", () => {
    render(<PhonesList householdId="h1" phones={phones} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /opt in|consent/i }),
    ).toBeNull();
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
