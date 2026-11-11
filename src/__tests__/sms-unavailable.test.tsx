/**
 * With the text provider not configured (or switched off), nothing text-related
 * may show anywhere a guest or staff member looks, apart from the admin banner
 * and the two public legal pages (spec: User Story 8). Add every new screen to
 * `screens` so a future change cannot leak texting by accident.
 */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { Home } from "@/components/site/Home";
import { Placeholder } from "@/components/site/Placeholder";
import { SignInPrompt } from "@/components/site/SignInPrompt";
import { PrivacyPolicy } from "@/components/site/PrivacyPolicy";
import { TermsAndConditions } from "@/components/site/TermsAndConditions";
import { CampaignEditor } from "@/components/admin/forms/CampaignEditor";
import { HouseholdDetailView } from "@/components/admin/HouseholdDetailView";
import { ImportHelp } from "@/components/admin/ImportHelp";
import { SettingsView } from "@/components/admin/SettingsView";
import type { HouseholdDetail } from "@/lib/admin/data/households";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/admin",
}));
jest.mock("@/lib/admin/actions/households", () => ({
  updateHouseholdFields: jest.fn(),
}));
jest.mock("@/lib/admin/actions/guests", () => ({
  saveGuest: jest.fn(),
  removeGuest: jest.fn(),
  confirmRemoveGuest: jest.fn(),
  setGuestDietary: jest.fn(),
}));
jest.mock("@/lib/admin/actions/settings", () => ({
  saveSettings: jest.fn(),
  saveSmsSwitch: jest.fn(),
}));
jest.mock("@/lib/admin/actions/campaigns", () => ({
  previewAudience: jest.fn(),
  saveCampaign: jest.fn(),
  confirmCancel: jest.fn(),
  confirmSend: jest.fn(),
  sendCampaign: jest.fn(),
}));
jest.mock("@/lib/admin-api/client", () => ({
  updateHousehold: jest.fn(),
  deleteHousehold: jest.fn(),
  addContact: jest.fn(),
  updateContact: jest.fn(),
  removeContact: jest.fn(),
  addPhone: jest.fn(),
  updatePhone: jest.fn(),
  removePhone: jest.fn(),
}));

// Words that only texting uses. (Ordinary words like "Optional" are not listed.)
const TEXT_WORDS =
  /text message|texting|\btexts?\b|phone|mobile|opt in|opted in|consent|Twilio/i;
// The carriers' keywords are capitals; "stop" in ordinary prose is fine.
const TEXT_KEYWORDS = /\b(STOP|HELP|SMS)\b/;

const household: HouseholdDetail = {
  id: "h1",
  displayName: "The Examples",
  contacts: [
    { id: "c1", value: "household@example.test", deliveryProblem: false },
  ],
  phones: [
    {
      id: "p1",
      value: "+12025550123",
      deliveryProblem: false,
      consent: "opted_in",
      consentAt: "2027-02-01T18:00:00Z",
    },
  ],
  plusOneAllowance: 0,
  address: null,
  notes: null,
  messageToCouple: null,
  rsvpDeadlineOverride: null,
  remindersOptOut: false,
  deliveryProblem: false,
  defaultDeadline: null,
  guests: [],
} as never;

const settings = {
  default_rsvp_deadline: "",
  rsvp_open: true,
  wedding_event_id: "",
  sign_in_limit_per_address: 3,
  sign_in_window_minutes: 10,
  sign_in_limit_global_per_hour: 60,
  sms_enabled: true,
};

const screens: [string, () => ReactElement][] = [
  ["the sign-in prompt", () => <SignInPrompt />],
  ["the home page signed out", () => <Home signedIn={false} />],
  ["the home page signed in", () => <Home signedIn />],
  ["the placeholder", () => <Placeholder />],
  [
    "a signed-in guest with numbers on file (no consent step while unavailable)",
    () => <Home signedIn smsAvailable={false} consent={[]} />,
  ],
  [
    "the household screen",
    () => <HouseholdDetailView household={household} tab="details" />,
  ],
  ["the import help", () => <ImportHelp />],
  [
    "the settings screen",
    () => (
      <SettingsView
        role="couple"
        currentUserId="u1"
        settings={settings}
        events={[]}
        staff={[]}
      />
    ),
  ],
  [
    "the campaign editor",
    () => (
      <CampaignEditor
        messageTypes={[
          { key: "rsvp_reminder", label: "RSVP reminder", isEssential: false },
        ]}
        events={[]}
        households={[]}
      />
    ),
  ],
];

describe("with texting not configured", () => {
  it.each(screens)("%s shows nothing about texting", (_name, screen) => {
    const { container } = render(screen());
    expect(container.textContent).not.toMatch(TEXT_WORDS);
    expect(container.textContent).not.toMatch(TEXT_KEYWORDS);
  });

  it("still shows the text wording on the two public legal pages", () => {
    for (const page of [
      <PrivacyPolicy key="p" />,
      <TermsAndConditions key="t" />,
    ]) {
      const { container, unmount } = render(page);
      expect(container.textContent).toMatch(/STOP/);
      unmount();
    }
  });
});

describe("with texting configured, the same screens show it", () => {
  it("shows the phone-aware sign-in prompt, the phones, the switch and the channel", () => {
    const prompt = render(<SignInPrompt smsAvailable />);
    expect(prompt.container.textContent).toMatch(/mobile number/);
    prompt.unmount();
    const detail = render(
      <HouseholdDetailView household={household} tab="details" smsConfigured />,
    );
    expect(detail.container.textContent).toMatch(/Phone numbers/);
    detail.unmount();
    const sw = render(
      <SettingsView
        role="couple"
        currentUserId="u1"
        settings={settings}
        events={[]}
        staff={[]}
        smsConfigured
      />,
    );
    expect(sw.container.textContent).toMatch(/Text messaging/);
    sw.unmount();
    const ed = render(
      <CampaignEditor
        messageTypes={[
          { key: "rsvp_reminder", label: "RSVP reminder", isEssential: false },
        ]}
        events={[]}
        households={[]}
        smsConfigured
      />,
    );
    expect(ed.container.textContent).toMatch(
      /Texts go only to numbers that opted in/,
    );
  });
});
