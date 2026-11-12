import { render, screen, within } from "@testing-library/react";
import { SaveTheDate } from "../SaveTheDate";
import type { SaveTheDate as Details } from "@/lib/calendar/details";

const details: Details = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 2,
  calendar: {
    google: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    outlook: "https://outlook.live.com/calendar/0/deeplink/compose?x=1",
    file: "/api/guest/save-the-date/calendar",
  },
};

describe("SaveTheDate", () => {
  it("shows the couple, the date as a long date, the place and the note", () => {
    render(<SaveTheDate details={details} consent={[]} />);
    expect(screen.getByText("Chris & Hannah")).toBeInTheDocument();
    expect(
      screen.getByText("Saturday, September 18, 2027"),
    ).toBeInTheDocument();
    expect(screen.getByText("Napa Valley, California")).toBeInTheDocument();
    expect(screen.getByText("Invitation to follow")).toBeInTheDocument();
  });

  it("offers Google Calendar, Outlook and the file for Apple and others", () => {
    render(<SaveTheDate details={details} consent={[]} />);
    expect(
      screen.getByRole("link", { name: "Google Calendar" }),
    ).toHaveAttribute("href", details.calendar!.google);
    expect(screen.getByRole("link", { name: "Outlook" })).toHaveAttribute(
      "href",
      details.calendar!.outlook,
    );
    const file = screen.getByRole("link", {
      name: "Apple Calendar or other",
    });
    expect(file).toHaveAttribute("href", details.calendar!.file);
    expect(file).toHaveAttribute("download");
  });

  it("shows only the couple and 'Details coming soon' when there is no date", () => {
    render(
      <SaveTheDate
        details={{ ...details, date: null, calendar: null }}
        consent={[]}
      />,
    );
    expect(screen.getByText("Chris & Hannah")).toBeInTheDocument();
    expect(screen.getByText("Details coming soon")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /calendar|outlook/i }),
    ).toBeNull();
  });

  it("copes without names, a place or a note", () => {
    render(
      <SaveTheDate
        details={{
          ...details,
          couple_names: null,
          place: null,
          note: null,
        }}
        consent={[]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Save the date",
    );
  });

  it("has no navigation, RSVP or household information", () => {
    const { container } = render(
      <SaveTheDate details={details} consent={[]} />,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.textContent).not.toMatch(/rsvp|household|@/i);
  });

  it("shows the text consent step below the date only when there are numbers to ask about", () => {
    const { rerender } = render(<SaveTheDate details={details} consent={[]} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(
      <SaveTheDate
        details={details}
        consent={[{ id: "n1", masked: "(•••) •••-0123" }]}
      />,
    );
    const date = screen.getByText("Saturday, September 18, 2027");
    const box = screen.getByRole("checkbox");
    expect(
      date.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(box).not.toBeChecked();
  });

  it("keeps the small controls and the legal links", () => {
    render(<SaveTheDate details={details} consent={[]} />);
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms" })).toBeInTheDocument();
    expect(
      within(document.body).getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
