import {
  Body,
  Container,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { renderEmail } from "./render";
import type { CampaignProps, EmailTemplate } from "../src/lib/email/templates";
import { formatDate, formatWhen } from "./format";

/**
 * First-draft invitation email, written for Chris and Hannah to polish: plain
 * wording, no brand styling. Every address in a household gets this email, each
 * with the household's personal link, which signs the reader in on any device.
 */

function Message({
  household,
  events,
  respond_by,
  personal_link,
}: CampaignProps) {
  const by = formatDate(respond_by);
  return (
    <Html lang="en">
      <Preview>You are invited. Tap to respond.</Preview>
      <Body>
        <Container>
          <Text>{`Dear ${household.display_name},`}</Text>
          <Text>We would love to celebrate with you. You are invited to:</Text>
          {events.map((event) => (
            <Text key={event.slug}>
              {[event.name, formatWhen(event.starts_at), event.venue_name]
                .filter(Boolean)
                .join(", ")}
            </Text>
          ))}
          <Text>
            <Link href={personal_link}>Tap here to respond</Link>
          </Text>
          <Text>{`Or paste this address into your browser: ${personal_link}`}</Text>
          <Text>
            {by
              ? `Please respond by ${by}.`
              : "Please respond as soon as you can."}
          </Text>
          <Text>
            This link is personal to your household. Anyone in your household
            can use it, on any device.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const template: EmailTemplate<CampaignProps> = async (props) => {
  const element = <Message {...props} />;
  return renderEmail("You are invited", element);
};

export default template;
