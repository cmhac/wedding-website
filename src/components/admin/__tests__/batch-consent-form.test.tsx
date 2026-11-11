import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BatchConsentForm, BATCH_FORM_ID } from "../forms/BatchConsentForm";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const mockBatch = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  setBatchConsent: (...a: unknown[]) => mockBatch(...a),
}));

const counts = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    counts: {
      marked: 4,
      cleared: 0,
      already: 1,
      declined_skipped: 2,
      households_without_phone: 3,
      households: 6,
      dry_run: true,
      ...over,
    },
  },
});

function renderWithRows() {
  return render(
    <>
      <BatchConsentForm matchingIds={["h1", "h2", "h3"]} />
      <input type="checkbox" name="household" value="h1" form={BATCH_FORM_ID} />
      <input type="checkbox" name="household" value="h2" form={BATCH_FORM_ID} />
      <input type="checkbox" name="household" value="h3" form={BATCH_FORM_ID} />
    </>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBatch.mockResolvedValue(counts());
});

describe("BatchConsentForm", () => {
  it("asks for at least one household before doing anything", async () => {
    renderWithRows();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText("Choose at least one household."),
    ).toBeInTheDocument();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("reviews the checked households first, changing nothing, then confirms", async () => {
    renderWithRows();
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[2]);
    fireEvent.change(screen.getByLabelText("Where the consent came from"), {
      target: { value: "address form" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    await waitFor(() =>
      expect(mockBatch).toHaveBeenCalledWith({
        household_ids: ["h1", "h3"],
        mode: "mark",
        note: "address form",
        override_declined: false,
        dry_run: true,
      }),
    );
    expect(
      await screen.findByText(/4 numbers will be marked/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 already consented/)).toBeInTheDocument();
    expect(screen.getByText(/2 declined/)).toBeInTheDocument();
    expect(
      screen.getByText(/3 households have no phone number/),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    mockBatch.mockResolvedValue(counts({ dry_run: false }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(mockBatch).toHaveBeenLastCalledWith({
        household_ids: ["h1", "h3"],
        mode: "mark",
        note: "address form",
        override_declined: false,
        dry_run: false,
      }),
    );
    expect(
      await screen.findByText(/Done: 4 numbers marked/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("uses every household matching the filter when asked", async () => {
    renderWithRows();
    fireEvent.change(screen.getByLabelText("Households"), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(mockBatch.mock.calls[0][0].household_ids).toEqual([
        "h1",
        "h2",
        "h3",
      ]),
    );
  });

  it("skips declined numbers unless the override is ticked", async () => {
    renderWithRows();
    fireEvent.change(screen.getByLabelText("Households"), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByText(/2 declined/);
    fireEvent.click(
      screen.getByLabelText("Also mark numbers that declined at the site"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(mockBatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ override_declined: true, dry_run: false }),
      ),
    );
  });

  it("can clear marks instead", async () => {
    renderWithRows();
    fireEvent.change(screen.getByLabelText("Households"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "clear" },
    });
    mockBatch.mockResolvedValue(counts({ marked: 0, cleared: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText(/5 numbers will be cleared/),
    ).toBeInTheDocument();
    expect(mockBatch.mock.calls[0][0].mode).toBe("clear");
  });

  it("shows a plain message when the batch is refused, and stays on review", async () => {
    mockBatch.mockResolvedValue({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "x" },
    });
    renderWithRows();
    fireEvent.change(screen.getByLabelText("Households"), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText("You do not have access to this."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("lets you start over from the review", async () => {
    renderWithRows();
    fireEvent.change(screen.getByLabelText("Households"), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("button", { name: "Confirm" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
  });
});
