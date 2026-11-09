/**
 * Masks an email address for guests: the first character, then `•••`, then the
 * domain (`a•••@example.com`). Guests see their household's addresses so they
 * know which ones are on file, but a forwarded link never exposes a full address.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${address[0]}•••${address.slice(at)}`;
}
