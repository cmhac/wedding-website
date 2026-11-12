import { render, screen } from "@testing-library/react";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
  redirect: jest.fn(),
}));
jest.mock("@/lib/admin/session", () => ({
  requireStaffPage: jest.fn(async () => ({
    user: { id: "user-1" },
    role: "couple",
    supabase: {},
  })),
  isForbidden: () => false,
  getShellStaff: jest.fn(async () => ({
    displayName: "Hannah",
    role: "couple",
  })),
}));
jest.mock("@/lib/admin/actions/session", () => ({ signOut: jest.fn() }));
jest.mock("@/lib/admin/actions/settings", () => ({ saveSmsSwitch: jest.fn() }));
jest.mock("@/lib/admin/actions/setup", () => ({
  checkAgain: jest.fn(),
  confirmStep: jest.fn(),
  leaveGuide: jest.fn(),
  recordPosition: jest.fn(),
  restartGuide: jest.fn(),
  resumeGuide: jest.fn(),
  saveSetupValue: jest.fn(),
  skipStep: jest.fn(),
  unconfirmStep: jest.fn(),
}));
const loadSetup = jest.fn();
jest.mock("@/lib/setup/load", () => ({
  loadSetup: (...args: unknown[]) => loadSetup(...args),
}));

import ConsoleLayout from "../layout";
import { buildSetupView } from "@/lib/setup/view";

const inputs = {
  settings: {
    weddingEventId: null,
    weddingEventDate: null,
    rsvpOpen: true,
    defaultDeadline: null,
    place: null,
  },
  env: {
    siteUrl: "https://example.test",
    emailKey: true,
    emailFrom: true,
    linkKey: true,
    scheduleKey: true,
    webhookKey: true,
  },
  sms: { configured: false, enabled: false },
  confirmed: [],
};

describe("the console layout", () => {
  it("shows the setup banner above the page while a required step is open", async () => {
    loadSetup.mockResolvedValue(
      buildSetupView(inputs, null, "couple", {
        events: [],
        note: "",
        deadlineLocal: "",
      }),
    );
    render(await ConsoleLayout({ children: <h1>Overview</h1> }));
    expect(screen.getByRole("status", { name: "Setup" })).toHaveTextContent(
      "Setup isn’t finished",
    );
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(loadSetup).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "couple",
    );
  });

  it("still renders the page, without a banner, when the setup status cannot be read", async () => {
    loadSetup.mockResolvedValue(null);
    render(await ConsoleLayout({ children: <h1>Overview</h1> }));
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Setup" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Setup guide/ })).toBeNull();
  });

  it("no longer shows a separate texting banner", async () => {
    loadSetup.mockResolvedValue(null);
    render(await ConsoleLayout({ children: <h1>Overview</h1> }));
    expect(screen.queryByText(/Text messaging is not set up/)).toBeNull();
  });
});
