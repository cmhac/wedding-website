/** @jest-environment node */
import registry from "../index";
import { getText, renderText } from "@/lib/sms/texts";

const SITE = "https://hannahandchris.wedding";
const link = `${SITE}/i/${"A".repeat(22)}.${"b".repeat(43)}`;
const timed = `${SITE}/t/${"A".repeat(22)}.1abcde.${"b".repeat(22)}`;

const props = {
  sms_sign_in: { sign_in_url: timed },
  sms_confirmation: {},
  rsvp_reminder: { personal_link: link, respond_by: "Sep 1" },
  update: { personal_link: link },
  optional_events_reminder: { personal_link: link },
} as const;

// The standard text alphabet (GSM-7): one segment holds 160 of these.
const GSM7 =
  /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

describe("text registry", () => {
  it("registers exactly the texts the product sends", () => {
    expect(Object.keys(registry).sort()).toEqual(
      [
        "optional_events_reminder",
        "rsvp_reminder",
        "sms_confirmation",
        "sms_sign_in",
        "update",
      ].sort(),
    );
  });

  it("has no text for the invitation or the save the date", () => {
    expect(Object.keys(registry)).not.toContain("invitation");
    expect(Object.keys(registry)).not.toContain("save_the_date");
    expect(() => getText("invitation")).toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
  });
});

describe.each(Object.keys(props) as (keyof typeof props)[])(
  "text %s",
  (key) => {
    const text = renderText(key, props[key] as never);

    it("is one segment: at most 160 characters of the standard alphabet", () => {
      expect(text.length).toBeLessThanOrEqual(160);
      expect(GSM7.test(text)).toBe(true);
    });

    it("says who it is from", () => {
      expect(text).toMatch(/Chris & Hannah's wedding|hannahandchris\.wedding/);
    });

    it("tells the guest how to stop", () => {
      expect(text).toMatch(/STOP/);
    });

    it("contains no guest name", () => {
      expect(text).not.toMatch(/Dear |Hi [A-Z][a-z]+,/);
    });
  },
);

describe("what each text must contain", () => {
  it("the sign-in text carries the link and says it expires", () => {
    const t = renderText("sms_sign_in", props.sms_sign_in);
    expect(t).toContain(timed);
    expect(t).toMatch(/expires/i);
  });

  it("the confirmation has the required disclosures", () => {
    const t = renderText("sms_confirmation", {});
    expect(t).toContain("Msg & data rates may apply");
    expect(t).toContain("Reply HELP for help, STOP to opt out");
    expect(t).toMatch(/about a dozen/i);
  });

  it("the reminder, update and optional-events texts carry the link", () => {
    for (const key of [
      "rsvp_reminder",
      "update",
      "optional_events_reminder",
    ] as const) {
      expect(renderText(key, props[key] as never)).toContain(link);
    }
  });
});

describe("renderText failures", () => {
  it("throws template_missing for an unregistered key", () => {
    expect(() => renderText("nope", {} as never)).toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
  });

  it("throws template_failed when a text throws", () => {
    const broken = {
      boom: () => {
        throw new Error("x");
      },
    };
    expect(() => renderText("boom", {} as never, broken)).toThrow(
      expect.objectContaining({ code: "template_failed" }),
    );
  });
});
