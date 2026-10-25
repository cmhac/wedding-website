import { render, screen } from "@testing-library/react";
import { AnsweredByBadge } from "../AnsweredBy";

describe("AnsweredByBadge", () => {
  it("shows Guest for a guest answer", () => {
    render(<AnsweredByBadge answeredBy={{ kind: "guest" }} />);
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("shows who recorded a staff answer, with the name and Pacific time", () => {
    render(
      <AnsweredByBadge
        answeredBy={{
          kind: "staff",
          name: "Hannah",
          at: "2026-10-03T21:14:00Z",
        }}
      />,
    );
    expect(screen.getByText(/Recorded by staff/)).toBeInTheDocument();
    expect(screen.getByText(/Hannah, Oct 3, 2:14 PM PT/)).toBeInTheDocument();
  });

  it("shows a staff answer without a time when none is given", () => {
    render(<AnsweredByBadge answeredBy={{ kind: "staff", name: "Hannah" }} />);
    expect(screen.getByText(/Hannah/)).toBeInTheDocument();
    expect(screen.queryByText(/PT/)).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "former_staff" as const }, "Staff (former member)"],
    [{ kind: "system" as const }, "System"],
    [{ kind: "unknown" as const }, "Unknown"],
    [{ kind: "shared_account" as const }, "Staff or household (same account)"],
    [{ kind: "not_answered" as const }, "Not answered"],
  ])("shows the plain text for %j", (answeredBy, text) => {
    render(<AnsweredByBadge answeredBy={answeredBy} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("makes the staff variant visually and textually different from guest", () => {
    const { container: guest } = render(
      <AnsweredByBadge answeredBy={{ kind: "guest" }} />,
    );
    const { container: staff } = render(
      <AnsweredByBadge
        answeredBy={{
          kind: "staff",
          name: "Hannah",
          at: "2026-10-03T21:14:00Z",
        }}
      />,
    );
    expect(guest.querySelector(".badge")).not.toHaveClass("badge-staff");
    expect(staff.querySelector(".badge")).toHaveClass("badge-staff");
    expect(guest.textContent).not.toBe(staff.textContent);
  });
});
