import { render, screen } from "@testing-library/react";
import { AdminShell } from "../AdminShell";
import { ConsoleShell } from "../ConsoleShell";

jest.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

const staff = { displayName: "Hannah", role: "couple" } as const;

const SampleBanner = () => <p role="status">Setup banner</p>;

describe("the banner in the console", () => {
  it("shows above the page on every page when the shell is given one", () => {
    render(
      <AdminShell
        current="households"
        staff={staff}
        signOutAction={jest.fn()}
        banner={<SampleBanner />}
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
        banner={<SampleBanner />}
      >
        <h1>Overview</h1>
      </ConsoleShell>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
