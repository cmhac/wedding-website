import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportResponse } from "@/lib/admin-api/schemas";
import { ImportForm } from "../forms/ImportForm";
import { ImportResultView } from "../ImportResultView";

const mockImportGuestsFile = jest.fn();
jest.mock("@/lib/admin-api/client", () => ({
  importGuestsFile: (...a: unknown[]) => mockImportGuestsFile(...a),
}));

const withErrors: ImportResponse = {
  created: { households: 41, guests: 87, invitations: 203 },
  errors: [
    { row: 14, field: "contact_email", message: "Not a valid email address." },
    { row: 22, field: "events", message: "No event called after-party." },
  ],
  source: {
    format: "xlsx",
    sheet: { name: "Guest list", index: 1, count: 2 },
  },
};
const clean: ImportResponse = {
  created: { households: 44, guests: 92, invitations: 215 },
  errors: [],
  source: { format: "csv" },
};

beforeEach(() => jest.clearAllMocks());

describe("ImportResultView", () => {
  it("names the sheet that was read for an Excel file", () => {
    render(
      <ImportResultView
        outcome={{ ok: true, fileName: "guests-sample.xlsx", data: withErrors }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      'Read sheet "Guest list" from guests-sample.xlsx (the first of 2 sheets).',
    );
  });

  it("has no sheet sentence for a CSV", () => {
    render(
      <ImportResultView
        outcome={{ ok: true, fileName: "guests.csv", data: clean }}
      />,
    );
    expect(screen.queryByText(/Read sheet/)).not.toBeInTheDocument();
  });

  it("shows four tiles and an error table of Row, Field, Problem", () => {
    render(
      <ImportResultView
        outcome={{ ok: true, fileName: "guests-sample.xlsx", data: withErrors }}
      />,
    );
    expect(screen.getByText("Households created")).toBeInTheDocument();
    expect(screen.getByText("Guests created")).toBeInTheDocument();
    expect(screen.getByText("Invitations created")).toBeInTheDocument();
    expect(screen.getByText("Rows need fixing")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("203")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Row", "Field", "Problem"]);
    expect(within(table).getByText("14")).toBeInTheDocument();
    expect(within(table).getByText("contact_email")).toBeInTheDocument();
    expect(
      within(table).getByText("Not a valid email address."),
    ).toBeInTheDocument();
    expect(screen.queryByText("All rows imported.")).not.toBeInTheDocument();
  });

  it("says All rows imported. for a clean import and shows three tiles", () => {
    render(
      <ImportResultView
        outcome={{ ok: true, fileName: "guests.csv", data: clean }}
      />,
    );
    expect(screen.getByText("All rows imported.")).toBeInTheDocument();
    expect(screen.queryByText("Rows need fixing")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a whole-file error as a plain message and says nothing was imported", () => {
    render(
      <ImportResultView
        outcome={{
          ok: false,
          message: "This file could not be read. Upload a .csv or .xlsx file.",
        }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "This file could not be read. Upload a .csv or .xlsx file.",
    );
    expect(alert).toHaveTextContent("Nothing was imported.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ImportForm", () => {
  const file = (name: string) =>
    new File(["x"], name, { type: "application/octet-stream" });

  it("has a labelled file input that accepts .csv and .xlsx", () => {
    render(<ImportForm />);
    const input = screen.getByLabelText("File (.csv or .xlsx)");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", ".csv,.xlsx");
  });

  it("disables Import until a file is chosen", async () => {
    render(<ImportForm />);
    const button = screen.getByRole("button", { name: "Import file" });
    expect(button).toBeDisabled();
    await userEvent.upload(
      screen.getByLabelText("File (.csv or .xlsx)"),
      file("guests-sample.xlsx"),
    );
    expect(button).toBeEnabled();
  });

  it("sends the chosen file and shows the result", async () => {
    mockImportGuestsFile.mockResolvedValue({ ok: true, data: withErrors });
    render(<ImportForm />);
    await userEvent.upload(
      screen.getByLabelText("File (.csv or .xlsx)"),
      file("guests-sample.xlsx"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import file" }));
    expect(mockImportGuestsFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "guests-sample.xlsx" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Read sheet "Guest list"/,
    );
    expect(screen.getByText("Rows need fixing")).toBeInTheDocument();
  });

  it("shows the server's message and Nothing was imported. when the file is rejected", async () => {
    mockImportGuestsFile.mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: "invalid_file", message: "The file is empty." },
    });
    render(<ImportForm />);
    await userEvent.upload(
      screen.getByLabelText("File (.csv or .xlsx)"),
      file("a.csv"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import file" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The file is empty.");
    expect(alert).toHaveTextContent("Nothing was imported.");
  });

  it("disables the button while the upload is running", async () => {
    let finish: (v: unknown) => void = () => {};
    mockImportGuestsFile.mockReturnValue(new Promise((r) => (finish = r)));
    render(<ImportForm />);
    await userEvent.upload(
      screen.getByLabelText("File (.csv or .xlsx)"),
      file("a.csv"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Import file" }));
    expect(screen.getByRole("button", { name: "Import file" })).toBeDisabled();
    finish({ ok: true, data: clean });
    expect(await screen.findByText("All rows imported.")).toBeInTheDocument();
  });
});
