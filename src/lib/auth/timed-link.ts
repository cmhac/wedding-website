import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeId, encodeId } from "./invite-link";

/**
 * The sign-in link in a text (research: The sign-in link in a text must
 * survive link previews). A messaging app may fetch a link before the guest
 * taps it, which would use up a single-use token, so this link is not single
 * use: it is valid for 15 minutes and works any number of times in that
 * window. It is `/t/<household id>.<expiry>.<signature>`: the household id
 * (22 characters), the expiry in base 36 seconds (6), and the first 128 bits of
 * an HMAC-SHA256 (22) over a message no other link signs, keyed with
 * INVITE_LINK_SECRET and including the household's current link version, so
 * reissuing a household's link or signing it out everywhere ends it. Short
 * on purpose: a text is one segment at 160 characters.
 *
 * Server-only: it reads the secret. Never log a token.
 */

export const TIMED_LINK_MINUTES = 15;
const SIGNATURE_LENGTH = 22;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const BASE36 = /^[0-9a-z]{6}$/;

function secret(): string {
  const value = process.env.INVITE_LINK_SECRET;
  if (!value) throw new Error("INVITE_LINK_SECRET is not set");
  return value;
}

function sign(householdId: string, version: number, expiry: number): string {
  return createHmac("sha256", secret())
    .update(`timed:${householdId}:${version}:${expiry}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);
}

export function timedToken(
  householdId: string,
  version: number,
  now: Date = new Date(),
): string {
  const expiry = Math.floor(now.getTime() / 1000) + TIMED_LINK_MINUTES * 60;
  return `${encodeId(householdId)}.${expiry.toString(36)}.${sign(householdId, version, expiry)}`;
}

/**
 * The household id a token names, from its shape alone: nothing is checked
 * here. Use it to look up the household's link version, then check the token
 * with `parseTimedToken`.
 */
export function householdIdFromTimedToken(token: string): string | null {
  const [id] = token.split(".");
  if (!id || id.length !== 22 || !BASE64URL.test(id)) return null;
  return decodeId(id);
}

/** The household id for a valid, unexpired token at this link version; otherwise null. */
export function parseTimedToken(
  token: string,
  version: number,
  now: Date = new Date(),
): { householdId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expiryText, signature] = parts;
  if (id.length !== 22 || !BASE64URL.test(id)) return null;
  if (!BASE36.test(expiryText)) return null;
  if (signature.length !== SIGNATURE_LENGTH || !BASE64URL.test(signature)) {
    return null;
  }
  const householdId = decodeId(id);
  if (!householdId) return null;
  const expiry = parseInt(expiryText, 36);
  if (Math.floor(now.getTime() / 1000) > expiry) return null;
  const expected = Buffer.from(sign(householdId, version, expiry));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? { householdId } : null;
}

export function timedLinkUrl(
  householdId: string,
  version: number,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL ?? "",
  now: Date = new Date(),
): string {
  return `${siteUrl.replace(/\/+$/, "")}/t/${timedToken(householdId, version, now)}`;
}
