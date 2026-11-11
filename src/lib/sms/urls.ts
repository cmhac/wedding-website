/** Where Twilio reports delivery, built from the public site address (not the request URL, which differs behind a proxy). */
export function statusCallbackUrl(
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string | undefined {
  const base = (siteUrl ?? "").replace(/\/+$/, "");
  return base ? `${base}/api/webhooks/twilio` : undefined;
}
