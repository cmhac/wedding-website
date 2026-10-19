/**
 * Runs `work` and does not settle until at least `minMs` have passed, so the
 * response time of a sign-in request does not depend on whether the address is
 * known (a known address sends an email and takes longer). Errors from `work`
 * are swallowed here: callers answer the same neutral way either way.
 *
 * Next's `after()` is not used because the sign-in call must set the PKCE
 * code-verifier cookie on the response, which cannot happen once it is sent.
 */
export async function withMinimumDuration(
  minMs: number,
  work: () => Promise<unknown>,
): Promise<void> {
  const pad = new Promise<void>((resolve) => setTimeout(resolve, minMs));
  try {
    await work();
  } catch {
    // The caller logs its own outcome code; nothing leaks from here.
  }
  await pad;
}
