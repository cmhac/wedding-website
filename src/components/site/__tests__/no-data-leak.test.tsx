import { render } from "@testing-library/react";
import { Home } from "../Home";

// A visitor who is not signed in sees only fixed copy: no address, name, role
// or other data about households, guests or staff.
describe("Home for a visitor who is not signed in", () => {
  it("contains only the fixed sign-in copy", () => {
    const { container } = render(<Home signedIn={false} />);
    expect(container.textContent).toBe(
      "Sign in to see what's comingEnter the email address we invited, and we'll send you a link.Email addressEmail me a linkPrivacy Policy · Terms",
    );
    expect(container.querySelector("input")?.getAttribute("value")).toBe("");
  });
});

// The save the date page shows the card's facts only: nothing about a
// household, an address or a number, and no personal link.
describe("the save the date page", () => {
  it("contains only the card's facts and the calendar choices", async () => {
    const { SaveTheDate } = await import("../SaveTheDate");
    const { container } = render(
      <SaveTheDate
        details={{
          couple_names: "Chris & Hannah",
          date: "2027-09-18",
          place: "Napa Valley, California",
          note: "Invitation to follow",
          revision: 1,
          calendar: {
            google: "https://calendar.google.com/calendar/render?x=1",
            outlook: "https://outlook.live.com/calendar/0/deeplink/compose?x=1",
            file: "/api/guest/save-the-date/calendar",
          },
        }}
        consent={[]}
      />,
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.join(" ")).not.toMatch(/\/i\/|\/t\/|token|next=/);
    expect(container.textContent).not.toMatch(/@|\+1\d|household/i);
  });
});
