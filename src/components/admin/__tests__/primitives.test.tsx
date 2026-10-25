import { render, screen } from "@testing-library/react";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeader,
  StatTile,
  TabLinks,
} from "../primitives";

describe("PageHeader", () => {
  it("renders a level 1 heading, description and actions", () => {
    render(
      <PageHeader
        title="Households"
        description="118 households"
        actions={<a href="/admin/import">Import</a>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Households" }),
    ).toBeInTheDocument();
    expect(screen.getByText("118 households")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import" })).toBeInTheDocument();
  });

  it("omits description and actions when not given", () => {
    render(<PageHeader title="Overview" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});

describe("Card", () => {
  it("renders an optional level 2 heading and children", () => {
    render(
      <Card heading="Possible duplicates">
        <p>Body</p>
      </Card>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Possible duplicates" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("renders without a heading", () => {
    render(
      <Card>
        <p>Body</p>
      </Card>,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("StatTile", () => {
  it("shows the number and label together", () => {
    render(<StatTile value="118" label="Households" />);
    const tile = screen.getByText("118").parentElement as HTMLElement;
    expect(tile).toHaveTextContent("118");
    expect(tile).toHaveTextContent("Households");
  });
});

describe("Badge", () => {
  it("always shows its text, whatever the variant", () => {
    render(<Badge variant="bad">Delivery problem</Badge>);
    expect(screen.getByText("Delivery problem")).toBeVisible();
  });

  it("works with the default variant", () => {
    render(<Badge>Possible duplicate</Badge>);
    expect(screen.getByText("Possible duplicate")).toBeVisible();
  });
});

describe("Alert", () => {
  it("uses role alert for errors", () => {
    render(<Alert variant="error">It broke</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("It broke");
  });

  it.each(["ok", "info"] as const)("uses role status for %s", (variant) => {
    render(<Alert variant={variant}>Fine</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Fine");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows the message", () => {
    render(<EmptyState>No households yet</EmptyState>);
    expect(screen.getByText("No households yet")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("binds a visible label to its control", () => {
    render(
      <Field id="q" label="Search">
        <input id="q" />
      </Field>,
    );
    expect(screen.getByLabelText("Search")).toBe(document.getElementById("q"));
  });

  it("links the hint with aria-describedby", () => {
    render(
      <Field id="q" label="Search" hint="Name or email">
        <input id="q" />
      </Field>,
    );
    expect(screen.getByLabelText("Search")).toHaveAccessibleDescription(
      "Name or email",
    );
  });

  it("links and announces the error", () => {
    render(
      <Field id="q" label="Search" hint="Name or email" error="Required">
        <input id="q" />
      </Field>,
    );
    const input = screen.getByLabelText("Search");
    expect(input).toHaveAccessibleDescription(/Required/);
    expect(input).toHaveAccessibleDescription(/Name or email/);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("marks the control invalid when there is an error", () => {
    render(
      <Field id="q" label="Search" error="Required">
        <input id="q" />
      </Field>,
    );
    expect(screen.getByLabelText("Search")).toBeInvalid();
  });
});

describe("TabLinks", () => {
  const tabs = [
    { value: "all", label: "All households" },
    { value: "dupes", label: "Possible duplicates" },
  ];

  it("renders a labelled nav with the current link marked", () => {
    render(
      <TabLinks
        label="Household views"
        basePath="/admin/households"
        param="view"
        tabs={tabs}
        current="dupes"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Household views" });
    expect(nav).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Possible duplicates" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "All households" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps the other query values in each link", () => {
    render(
      <TabLinks
        label="Household views"
        basePath="/admin/households"
        param="view"
        tabs={tabs}
        current="all"
        query={{ q: "exam", view: "all", empty: undefined }}
      />,
    );
    const href = screen
      .getByRole("link", { name: "Possible duplicates" })
      .getAttribute("href") as string;
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/admin/households");
    expect(url.searchParams.get("q")).toBe("exam");
    expect(url.searchParams.get("view")).toBe("dupes");
    expect(url.searchParams.has("empty")).toBe(false);
  });
});
