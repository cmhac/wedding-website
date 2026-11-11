// `respond_by` is a short date such as "Sep 1" so the text fits one segment.
export default function rsvpReminder(props: {
  personal_link: string;
  respond_by: string | null;
}): string {
  const by = props.respond_by ? ` RSVP by ${props.respond_by}` : " please RSVP";
  return `Chris & Hannah's wedding:${by} ${props.personal_link} STOP to opt out`;
}
