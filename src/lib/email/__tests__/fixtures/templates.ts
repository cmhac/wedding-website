import type {
  CampaignProps,
  EmailTemplate,
  MagicLinkProps,
} from "../../templates";

// Placeholder strings only; never real copy.
export const received: {
  magic_link: MagicLinkProps[];
  campaign: CampaignProps[];
} = {
  magic_link: [],
  campaign: [],
};

export const magicLinkFixture: EmailTemplate<MagicLinkProps> = (props) => {
  received.magic_link.push(props);
  return {
    subject: "fixture subject",
    html: `<p>fixture ${props.sign_in_url}</p>`,
    text: `fixture ${props.sign_in_url}`,
  };
};

export const campaignFixture: EmailTemplate<CampaignProps> = async (props) => {
  received.campaign.push(props);
  return {
    subject: "fixture subject",
    html: "<p>fixture</p>",
    text: "fixture",
  };
};

export const throwingFixture: EmailTemplate<unknown> = () => {
  throw new Error("boom with test@example.com");
};

export const fixtureRegistry = {
  magic_link: magicLinkFixture,
  invitation: campaignFixture,
  broken: throwingFixture,
};
