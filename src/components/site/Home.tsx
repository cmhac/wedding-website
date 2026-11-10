import { Placeholder } from "./Placeholder";
import { SignInPrompt } from "./SignInPrompt";

/** What `/` shows: the placeholder when signed in, otherwise the sign-in prompt. */
export function Home({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <Placeholder /> : <SignInPrompt />;
}
