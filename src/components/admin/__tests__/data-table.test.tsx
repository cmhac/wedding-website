import { render, screen, within } from "@testing-library/react";
import { DataTable } from "../DataTable";

type Row = { id: string; name: string; guests: number };

const columns = [
  { key: "name", header: "Household", cell: (r: Row) => r.name },
  {
    key: "guests",
    header: "Guests",
    numeric: true,
    cell: (r: Row) => String(r.guests),
  },
  {
    key: "actions",
    header: "Actions",
    hideHeader: true,
    cell: (r: Row) => <a href={`/admin/households/${r.id}`}>Open</a>,
  },
];
const rows: Row[] = [
  { id: "1", name: "The Examples", guests: 2 },
  { id: "2", name: "Sample Family", guests: 3 },
];

describe("DataTable", () => {
  it("renders a real table with column headers in the header row", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(3);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
    expect(headers[0]).toHaveTextContent("Household");
  });

  it("gives every cell a data-label equal to its column header", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      const cells = within(row).getAllByRole("cell");
      expect(cells.map((c) => c.getAttribute("data-label"))).toEqual([
        "Household",
        "Guests",
        "Actions",
      ]);
    }
    expect(screen.getByText("The Examples")).toBeInTheDocument();
  });

  it("marks numeric columns", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    const cell = screen.getByText("2").closest("td") as HTMLElement;
    const textCell = screen.getByText("The Examples").closest("td");
    expect(cell).toHaveClass("num");
    expect(textCell).not.toHaveClass("num");
    expect(screen.getByRole("columnheader", { name: "Guests" })).toHaveClass(
      "num",
    );
  });

  it("hides the actions header visually but keeps it readable", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    const header = screen.getByRole("columnheader", { name: "Actions" });
    expect(within(header).getByText("Actions")).toHaveClass("sr-only");
  });

  it("renders EmptyState instead of a table when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r: Row) => r.id}
        empty="No households match"
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No households match")).toBeInTheDocument();
  });
});
