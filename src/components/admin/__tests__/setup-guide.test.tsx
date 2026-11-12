import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SetupGuide, type SetupActions } from "../SetupGuide";
import { AdminShell } from "../AdminShell";
import { buildSetupView } from "@/lib/setup/view";
import type { SetupInputs } from "@/lib/setup/status";
import type { GuideState } from "@/lib/setup/banner";

expect.extend(toHaveNoViolations);

let search = "";
jest.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(search),
}));

const allSet: SetupInputs = {
  settings: {
    weddingEventId: "e1",
    weddingEventDate: "2027-06-12",
    rsvpOpen: false,
    defaultDeadline: "2027-04-01T00:00:00Z",
    place: "Seattle",
  },
  env: {
    siteUrl: "https://example.test",
    emailKey: true,
    emailFrom: true,
    linkKey: true,
    scheduleKey: true,
    webhookKey: true,
  },
  sms: { configured: true, enabled: true },
  confirmed: ["sending_domain"],
};

const extras = {
  events: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ceremony",
      date: "2027-06-12",
    },
  ],
  note: "",
  deadlineLocal: "",
};

type Over = {
  env?: Partial<SetupInputs["env"]>;
  settings?: Partial<SetupInputs["settings"]>;
  sms?: SetupInputs["sms"];
  confirmed?: string[];
};

function view(
  over: Over = {},
  state: GuideState | null = null,
  role: "couple" | "planner" = "couple",
) {
  const inputs: SetupInputs = {
    ...allSet,
    sms: over.sms ?? allSet.sms,
    confirmed: over.confirmed ?? allSet.confirmed,
    env: { ...allSet.env, ...over.env },
    settings: { ...allSet.settings, ...over.settings },
  };
  return buildSetupView(inputs, state, role, extras);
}

function actions(): SetupActions {
  const ok = jest.fn().mockResolvedValue({ ok: true });
  return {
    leave: jest.fn(ok),
    resume: jest.fn(ok),
    skip: jest.fn(ok),
    restart: jest.fn(ok),
    recordPosition: jest.fn(ok),
    confirm: jest.fn(ok),
    unconfirm: jest.fn(ok),
    checkAgain: jest.fn(ok),
    saveValue: jest.fn(ok),
    saveSmsSwitch: jest.fn(ok),
  } as unknown as SetupActions;
}

const missingEventAndEmail = () =>
  view({
    env: { emailKey: false, emailFrom: false },
    settings: { weddingEventId: null, weddingEventDate: null },
  });

beforeEach(() => {
  search = "";
  window.history.replaceState(null, "", "/admin");
});

describe("the full banner", () => {
  it("shows the count and a Start setup button while a required step is open", () => {
    render(<SetupGuide view={missingEventAndEmail()} actions={actions()} />);
    const banner = screen.getByRole("status", { name: "Setup" });
    expect(banner).toHaveTextContent(
      "Setup isn’t finished: 3 of 5 required steps done",
    );
    expect(
      within(banner).getByRole("button", { name: "Start setup" }),
    ).toBeInTheDocument();
  });

  it("shows nothing when no required step is open", () => {
    render(<SetupGuide view={view()} actions={actions()} />);
    expect(screen.queryByRole("status", { name: "Setup" })).toBeNull();
  });

  it("never raises the banner for recommended steps alone", () => {
    render(
      <SetupGuide
        view={view({
          settings: { place: null },
          sms: { configured: false, enabled: false },
        })}
        actions={actions()}
      />,
    );
    expect(screen.queryByRole("status", { name: "Setup" })).toBeNull();
  });
});

describe("the guide panel", () => {
  it("opens as a named dialog on the first open step and explains it", async () => {
    render(<SetupGuide view={missingEventAndEmail()} actions={actions()} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    const dialog = screen.getByRole("dialog", { name: "Setup guide" });
    expect(
      within(dialog).getByRole("heading", { name: "Wedding event" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("If you leave this unset:");
    expect(dialog).toHaveTextContent("3 of 5 required steps done");
  });

  it("lists every step with its state as text, not colour alone", async () => {
    render(<SetupGuide view={missingEventAndEmail()} actions={actions()} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /Site address\s*Done/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Email sending\s*Open/ }),
    ).toBeInTheDocument();
  });

  it("shows hosting instructions and Check again for an outside step, with no secret field", async () => {
    render(<SetupGuide view={missingEventAndEmail()} actions={actions()} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Email sending/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("RESEND_API_KEY");
    expect(dialog).toHaveTextContent("EMAIL_FROM");
    expect(
      within(dialog).getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(dialog).toHaveTextContent("redeploy");
  });

  it("calls Check again", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Email sending/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(a.checkAgain).toHaveBeenCalled();
  });

  it("saves a console step through the settings action and announces the step done", async () => {
    const a = actions();
    const { rerender } = render(
      <SetupGuide view={missingEventAndEmail()} actions={a} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Wedding event", { selector: "select" }),
      extras.events[0].id,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save and continue" }),
    );
    expect(a.saveValue).toHaveBeenCalled();
    const sent = (a.saveValue as jest.Mock).mock.calls[0][1] as FormData;
    expect(sent.get("step")).toBe("wedding_event");
    expect(sent.get("wedding_event_id")).toBe(extras.events[0].id);
    // The layout re-renders with the event now set.
    rerender(
      <SetupGuide
        view={view({ env: { emailKey: false, emailFrom: false } })}
        actions={a}
      />,
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((n) => /Wedding event is done/.test(n.textContent ?? "")),
      ).toBe(true),
    );
    expect(
      screen.getByRole("heading", { name: "Email sending" }),
    ).toBeInTheDocument();
  });

  it("says setup is complete when every required step is done and lists recommended ones", async () => {
    search = "setup=1";
    render(
      <SetupGuide
        view={view({ settings: { place: null }, confirmed: [] })}
        actions={actions()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Setup complete.");
    expect(dialog).toHaveTextContent("Recommended");
    expect(screen.queryByRole("status", { name: "Setup" })).toBeNull();
  });
});

describe("leaving, resuming and restarting", () => {
  it("closing records the step and the open required steps, and shows nothing blocking", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Close setup guide" }),
    );
    expect(a.leave).toHaveBeenCalled();
    const sent = (a.leave as jest.Mock).mock.calls[0][1] as FormData;
    expect(sent.get("step")).toBe("wedding_event");
    expect(sent.get("seen")).toBe("wedding_event,email_sending");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape and Not now close it too", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(a.leave).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(a.leave).toHaveBeenCalledTimes(2);
  });

  it("returns focus to the button that opened the guide", async () => {
    render(<SetupGuide view={missingEventAndEmail()} actions={actions()} />);
    const start = screen.getByRole("button", { name: "Start setup" });
    await userEvent.click(start);
    expect(
      screen.getByRole("button", { name: "Close setup guide" }),
    ).toHaveFocus();
    await userEvent.click(
      screen.getByRole("button", { name: "Close setup guide" }),
    );
    expect(start).toHaveFocus();
  });

  it("shows the compact reminder with progress and the skipped count after leaving", () => {
    const state: GuideState = {
      skipped_steps: ["wedding_event"],
      last_step: "wedding_event",
      left_guide: true,
      seen_required: ["wedding_event", "email_sending"],
    };
    render(
      <SetupGuide
        view={view(
          {
            env: { emailKey: false, emailFrom: false },
            settings: { weddingEventId: null, weddingEventDate: null },
          },
          state,
        )}
        actions={actions()}
      />,
    );
    const bar = screen.getByRole("status", { name: "Setup" });
    expect(bar).toHaveTextContent("Setup paused");
    expect(bar).toHaveTextContent("3 of 5 required steps done, 1 skipped");
    expect(
      within(bar).getByRole("button", { name: "Resume setup" }),
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "Restart" }),
    ).toBeInTheDocument();
  });

  it("Resume setup reopens on the saved step and clears the left state", async () => {
    const a = actions();
    const state: GuideState = {
      skipped_steps: [],
      last_step: "email_sending",
      left_guide: true,
      seen_required: ["wedding_event", "email_sending"],
    };
    render(
      <SetupGuide
        view={view(
          {
            env: { emailKey: false, emailFrom: false },
            settings: { weddingEventId: null, weddingEventDate: null },
          },
          state,
        )}
        actions={a}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Resume setup" }));
    expect(a.resume).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Email sending" }),
    ).toBeInTheDocument();
  });

  it("brings the full banner back when a new required step appears", () => {
    const state: GuideState = {
      skipped_steps: [],
      last_step: null,
      left_guide: true,
      seen_required: ["email_sending"],
    };
    render(
      <SetupGuide
        view={view(
          { env: { emailKey: false, emailFrom: false, linkKey: false } },
          state,
        )}
        actions={actions()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Start setup" }),
    ).toBeInTheDocument();
  });

  it("skips a step and moves on", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Skip this step" }),
    );
    expect(a.skip).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Email sending" }),
    ).toBeInTheDocument();
  });

  it("Restart setup calls restart", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Restart setup" }),
    );
    expect(a.restart).toHaveBeenCalled();
  });
});

describe("recommended steps and roles", () => {
  it("lets a planner see the texting switch read-only", async () => {
    search = "setup=1";
    render(
      <SetupGuide
        view={view(
          { sms: { configured: true, enabled: false } },
          null,
          "planner",
        )}
        actions={actions()}
      />,
    );
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: /Texting/ }));
    expect(
      screen.getByRole("checkbox", { name: /Texting is on/ }),
    ).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Only the couple can change this.",
    );
  });

  it("confirms and undoes a step checked by hand", async () => {
    search = "setup=1";
    const a = actions();
    const { rerender } = render(
      <SetupGuide view={view({ confirmed: [] })} actions={a} />,
    );
    await screen.findByRole("dialog");
    await userEvent.click(
      screen.getByRole("button", { name: /Sending domain verified/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "I’ve done this" }),
    );
    expect(a.confirm).toHaveBeenCalled();
    rerender(
      <SetupGuide view={view({ confirmed: ["sending_domain"] })} actions={a} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Sending domain verified/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(a.unconfirm).toHaveBeenCalled();
  });
});

describe("the navigation link", () => {
  const shell = (setup: { requiredOpen: number; recommendedOpen: number }) =>
    render(
      <AdminShell
        current="overview"
        staff={{ displayName: "Hannah", role: "couple" }}
        signOutAction={jest.fn()}
        setup={setup}
      >
        <h1>Overview</h1>
      </AdminShell>,
    );

  it("is always there and counts what is left", () => {
    shell({ requiredOpen: 2, recommendedOpen: 3 });
    const links = screen.getAllByRole("link", { name: /Setup guide/ });
    expect(links[0]).toHaveTextContent("2 left");
    expect(links[0]).toHaveAttribute("href", "?setup=1");
  });

  it("shows the recommended count once required steps are done", () => {
    shell({ requiredOpen: 0, recommendedOpen: 3 });
    expect(
      screen.getAllByRole("link", { name: /Setup guide/ })[0],
    ).toHaveTextContent("3 recommended");
  });

  it("has no count when nothing is left", () => {
    shell({ requiredOpen: 0, recommendedOpen: 0 });
    expect(
      screen.getAllByRole("link", { name: /Setup guide/ })[0],
    ).toHaveTextContent(/^Setup guide$/);
  });
});

describe("secrets", () => {
  it("renders names of hosting values but never a value", async () => {
    const { container } = render(
      <SetupGuide view={missingEventAndEmail()} actions={actions()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    expect(container.innerHTML + document.body.innerHTML).not.toMatch(
      /sk_|SENTINEL/,
    );
  });
});

describe("restart", () => {
  const stateWithSkips: GuideState = {
    skipped_steps: ["wedding_event"],
    last_step: "email_sending",
    left_guide: true,
    seen_required: ["wedding_event", "email_sending"],
  };

  it("from the compact reminder restarts and opens the guide on the first open step", async () => {
    const a = actions();
    render(
      <SetupGuide
        view={buildSetupView(
          {
            ...allSet,
            env: { ...allSet.env, emailKey: false, emailFrom: false },
            settings: {
              ...allSet.settings,
              weddingEventId: null,
              weddingEventDate: null,
            },
          },
          stateWithSkips,
          "couple",
          extras,
        )}
        actions={a}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(a.restart).toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "Setup guide" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Wedding event" }),
    ).toBeInTheDocument();
  });

  it("inside the panel moves to the first open step", async () => {
    const a = actions();
    render(<SetupGuide view={missingEventAndEmail()} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Email sending/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Email sending" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Restart setup" }),
    );
    expect(a.restart).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Wedding event" }),
    ).toBeInTheDocument();
  });
});

describe("automated accessibility check", () => {
  it("finds no violations in the full banner", async () => {
    const { container } = render(
      <SetupGuide view={missingEventAndEmail()} actions={actions()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations in the compact reminder", async () => {
    const { container } = render(
      <SetupGuide
        view={view(
          { env: { emailKey: false } },
          {
            skipped_steps: [],
            last_step: null,
            left_guide: true,
            seen_required: ["email_sending"],
          },
        )}
        actions={actions()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations in the open guide", async () => {
    const { container } = render(
      <SetupGuide view={missingEventAndEmail()} actions={actions()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start setup" }));
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(
      screen.getByRole("button", { name: /Email sending/ }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
