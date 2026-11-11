import { LegalLinks } from "./LegalLinks";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";

/** The signed-in view: one centered line and the small controls. Plain on purpose. */
export function Placeholder() {
  return (
    <>
      <main className="stage">
        <p className="line">Coming soon 👀</p>
      </main>
      <div className="controls">
        <ThemeToggle />
        <SignOutButton />
      </div>
      <LegalLinks />
    </>
  );
}
