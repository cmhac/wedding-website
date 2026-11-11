// First-draft wording for Chris to polish. One text segment: at most 160
// characters of the standard alphabet with the real link in it (see the text
// templates contract). Keep it consistent with the sample texts registered with
// the carriers.
export default function smsSignIn(props: { sign_in_url: string }): string {
  return `Chris & Hannah's wedding sign-in: ${props.sign_in_url} Expires in 15 min. STOP to opt out.`;
}
