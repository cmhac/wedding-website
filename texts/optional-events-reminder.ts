export default function optionalEventsReminder(props: {
  personal_link: string;
}): string {
  return `Chris & Hannah's wedding: optional events: ${props.personal_link} STOP to opt out`;
}
