import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Personal invite links are derived, not stored (research R3). A link is
 * `/i/<token>` where the token is the household id (base64url, 22 characters),
 * a dot, and an HMAC-SHA256 (base64url, 43 characters) of "household id:link
 * version" keyed with INVITE_LINK_SECRET. The database stores only the version,
 * so a leak of it reveals no working link, and reissuing a link (a new version)
 * stops the old one at once. Nothing personal is in the token.
 *
 * Server-only: it reads the secret. Never log a token.
 */

const ID_LENGTH = 22;
const SIGNATURE_LENGTH = 43;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const UUID_HEX = /^[0-9a-f]{32}$/;

function secret(): string {
  const value = process.env.INVITE_LINK_SECRET;
  if (!value) throw new Error("INVITE_LINK_SECRET is not set");
  return value;
}

function sign(householdId: string, version: number): string {
  return createHmac("sha256", secret())
    .update(`${householdId}:${version}`)
    .digest("base64url");
}

export function encodeId(householdId: string): string {
  return Buffer.from(householdId.replaceAll("-", ""), "hex").toString(
    "base64url",
  );
}

export function decodeId(encoded: string): string | null {
  const hex = Buffer.from(encoded, "base64url").toString("hex");
  if (!UUID_HEX.test(hex)) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** The token for a household's link at the given version. */
export function inviteToken(householdId: string, version: number): string {
  return `${encodeId(householdId)}.${sign(householdId, version)}`;
}

function split(token: string): { id: string; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [id, signature] = parts;
  if (id.length !== ID_LENGTH || signature.length !== SIGNATURE_LENGTH) {
    return null;
  }
  if (!BASE64URL.test(id) || !BASE64URL.test(signature)) return null;
  return { id, signature };
}

/**
 * The household id a token names, from its shape alone: the signature is not
 * checked here. Use it to look up the household's current link version, then
 * check the token with `parseInviteToken`.
 */
export function householdIdFromToken(token: string): string | null {
  const parts = split(token);
  return parts ? decodeId(parts.id) : null;
}

/**
 * Checks a token against the household's current link version. Returns the
 * household id, or null for a malformed token, a bad signature, or a token for
 * another version (a superseded link).
 */
export function parseInviteToken(
  token: string,
  version: number,
): { householdId: string } | null {
  const parts = split(token);
  if (!parts) return null;
  const householdId = decodeId(parts.id);
  if (!householdId) return null;
  const expected = Buffer.from(sign(householdId, version));
  const given = Buffer.from(parts.signature);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? { householdId } : null;
}

/** The full personal link, as sent in an invitation or copied by staff. */
export function inviteLinkUrl(
  householdId: string,
  version: number,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL ?? "",
): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/i/${inviteToken(householdId, version)}`;
}
