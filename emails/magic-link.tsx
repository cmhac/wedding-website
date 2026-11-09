import {
  Body,
  Container,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { renderEmail } from "./render";
import type { EmailTemplate, MagicLinkProps } from "../src/lib/email/templates";

/**
 * First-draft sign-in email, written for Chris and Hannah to polish: plain
 * wording, no brand styling. The link goes to the page that signs the reader in
 * (single use, and it expires), so the wording says to use it soon.
 */

const WORDING = {
  guest: {
    subject: "Your sign-in link for our wedding site",
    preview: "Use this link to get back to your RSVP.",
    lead: "Here is your sign-in link for our wedding site. It takes you straight to your RSVP.",
    action: "Open your RSVP",
    note: "The link works once and expires soon. If you did not ask for it, you can ignore this email.",
  },
  staff: {
    subject: "Your sign-in link for the admin console",
    preview: "Use this link to sign in to the admin console.",
    lead: "Here is your sign-in link for the wedding admin console.",
    action: "Sign in",
    note: "The link works once and expires soon. If you did not ask for it, you can ignore this email.",
  },
} as const;

function Message({ sign_in_url, audience }: MagicLinkProps) {
  const words = WORDING[audience === "staff" ? "staff" : "guest"];
  return (
    <Html lang="en">
      <Preview>{words.preview}</Preview>
      <Body>
        <Container>
          <Text>{words.lead}</Text>
          <Text>
            <Link href={sign_in_url}>{words.action}</Link>
          </Text>
          <Text>{`Or paste this address into your browser: ${sign_in_url}`}</Text>
          <Text>{words.note}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const template: EmailTemplate<MagicLinkProps> = async (props) => {
  const words = WORDING[props.audience === "staff" ? "staff" : "guest"];
  const element = (
    <Message sign_in_url={props.sign_in_url} audience={props.audience} />
  );
  return renderEmail(words.subject, element);
};

export default template;
