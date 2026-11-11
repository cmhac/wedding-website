/**
 * Shown on every admin page while the text provider is not configured. Plain
 * wording; email sign-in and invitations are unaffected.
 */
export function SmsBanner() {
  return (
    <p role="status" className="alert alert-warn">
      Text messaging is not set up. Texts are off. Sign-in and invitations by
      email still work. See the setup instructions in docs/manual-setup.md.
    </p>
  );
}
