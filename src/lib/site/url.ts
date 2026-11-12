/**
 * The site's own public address. Production sets `NEXT_PUBLIC_SITE_URL`. A
 * Vercel preview has a different address for every deployment, so it cannot be
 * set ahead of time: with none configured, a preview uses the address Vercel
 * gives that deployment (`VERCEL_URL`). Anywhere else an unset address stays
 * empty, so a missing setting is never papered over. The setup guide checks the
 * configured value itself, not this one.
 */
export function siteUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }
  return "";
}
