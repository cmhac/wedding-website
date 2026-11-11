import { ConsentStep } from "./ConsentStep";
import { Placeholder } from "./Placeholder";
import { SignInPrompt } from "./SignInPrompt";

/**
 * What `/` shows: the sign-in prompt when signed out; when signed in, the
 * one-time text-consent step if the household has numbers to answer for
 * (only while texting is available), otherwise the placeholder.
 */
export function Home({
  signedIn,
  smsAvailable = false,
  consent,
}: {
  signedIn: boolean;
  smsAvailable?: boolean;
  consent?: { id: string; masked: string }[];
}) {
  if (!signedIn) return <SignInPrompt smsAvailable={smsAvailable} />;
  if (consent && consent.length > 0) return <ConsentStep pending={consent} />;
  return <Placeholder />;
}
