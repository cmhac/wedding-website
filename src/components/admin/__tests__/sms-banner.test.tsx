import { render, screen } from "@testing-library/react";
import { AdminShell } from "../AdminShell";
import { ConsoleShell } from "../ConsoleShell";
import { SmsBanner } from "../SmsBanner";

jest.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

const staff = { displayName: "Hannah", role: "couple" } as const;

describe("SmsBanner", () => {
  it("warns plainly that texting is not set up and that email still works", () => {
    render(<SmsBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      "Text messaging is not set up. Texts are off. Sign-in and invitations by email still work. See the setup instructions in docs/manual-setup.md.",
    );
  });
});

describe("the banner in the console", () => {
  it("shows above the page on every page when the shell is given one", () => {
    render(
      <AdminShell
        current="households"
        staff={staff}
        signOutAction={jest.fn()}
        banner={<SmsBanner />}
      >
        <h1>Households</h1>
      </AdminShell>,
    );
    const banner = screen.getByRole("status");
    const heading = screen.getByRole("heading", { name: "Households" });
    expect(
      banner.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows nothing extra without a banner", () => {
    render(
      <AdminShell current="households" staff={staff} signOutAction={jest.fn()}>
        <h1>Households</h1>
      </AdminShell>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("passes the banner through the console wrapper", () => {
    render(
      <ConsoleShell
        staff={staff}
        signOutAction={jest.fn()}
        banner={<SmsBanner />}
      >
        <h1>Overview</h1>
      </ConsoleShell>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
