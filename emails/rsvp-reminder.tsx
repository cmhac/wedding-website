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
import { formatDate } from "./format";

/**
 * First-draft RSVP reminder, written for Chris and Hannah to polish: plain
 * wording, no brand styling. It says what is still waiting for an answer and
 * carries the household's personal link.
 */

function pendingLines(pending: CampaignProps["pending"]): string[] {
  const lines: string[] = [];
  if (pending.required_events > 0) {
    lines.push(
      `${pending.required_events} ${pending.required_events === 1 ? "event" : "events"} still need an answer.`,
    );
  }
  if (pending.optional_events > 0) {
    lines.push(
      `${pending.optional_events} optional ${pending.optional_events === 1 ? "event" : "events"} still ${pending.optional_events === 1 ? "needs" : "need"} an answer.`,
    );
  }
  if (pending.meals > 0) {
    lines.push(
      `${pending.meals} ${pending.meals === 1 ? "meal choice is" : "meal choices are"} still to pick.`,
    );
  }
  return lines;
}

function Message({
  household,
  pending,
  respond_by,
  personal_link,
}: CampaignProps) {
  const by = formatDate(respond_by);
  const lines = pendingLines(pending);
  return (
    <Html lang="en">
      <Preview>A reminder to send your RSVP.</Preview>
      <Body>
        <Container>
          <Text>{`Dear ${household.display_name},`}</Text>
          <Text>A quick reminder to send us your RSVP.</Text>
          {lines.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
          <Text>
            <Link href={personal_link}>Tap here to respond</Link>
          </Text>
          <Text>{`Or paste this address into your browser: ${personal_link}`}</Text>
          {by ? <Text>{`Please respond by ${by}.`}</Text> : null}
        </Container>
      </Body>
    </Html>
  );
}

const template: EmailTemplate<CampaignProps> = async (props) => {
  const element = <Message {...props} />;
  return renderEmail("A reminder to RSVP", element);
};

export default template;
