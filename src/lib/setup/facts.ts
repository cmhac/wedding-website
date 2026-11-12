/**
 * Small facts both the setup guide and the save the date readiness list need,
 * so the two cannot disagree. Presence only: no value is returned.
 */
export type EnvLike = Record<string, string | undefined>;

export const present = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export function emailConfigured(env: EnvLike): boolean {
  return present(env.RESEND_API_KEY) && present(env.EMAIL_FROM);
}

export function siteUrlOf(env: EnvLike): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
}
