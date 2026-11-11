export default function invitation(props: { personal_link: string }): string {
  return `Chris & Hannah's wedding: you're invited! ${props.personal_link} STOP to opt out`;
}
