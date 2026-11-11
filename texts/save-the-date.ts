// First-draft wording for Chris and Hannah to polish, in their description of it.
// It is often the first text a guest gets, so it says who it is from and carries
// the required disclosures (rates, help, stop). It may take two text segments
// (at most 306 standard characters); the preview shows the count. The link is
// the household's personal link with the save the date landing; no link
// shortener is used.
export default function saveTheDate(props: { personal_link: string }): string {
  return `Hi, it's Chris & Hannah! Time to save the date: ${props.personal_link} Msg&data rates may apply. Reply HELP for help, STOP to opt out`;
}
