import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * The one place that reads or formats phone numbers (research: Recognising
 * United States numbers). A number is accepted only if it is valid and its
 * country is the United States, and it is stored as E.164 (`+12025550123`).
 * Canadian and Caribbean numbers also start with +1, so they are told apart by
 * the library's area-code data. Never log a number.
 */

export type ParsedPhone =
  { ok: true; e164: string } | { ok: false; reason: "invalid" | "not_us" };

const PHONE_CHARS = /^[\d\s()+.\-]+$/;

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export function parseUsPhone(input: string): ParsedPhone {
  const value = (input ?? "").trim();
  if (!value || !PHONE_CHARS.test(value))
    return { ok: false, reason: "invalid" };
  const parsed = parsePhoneNumberFromString(value, "US");
  if (!parsed || parsed.ext || !parsed.isValid()) {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.country !== "US") return { ok: false, reason: "not_us" };
  return { ok: true, e164: parsed.number };
}

/**
 * True when a typed value is plausibly a phone number, so the sign-in prompt
 * can show the consent checkbox as soon as someone starts typing one. It is
 * only a hint for the screen: the server decides with `parseUsPhone`.
 */
export function looksLikePhone(value: string): boolean {
  const v = (value ?? "").trim();
  if (!v || v.includes("@")) return false;
  return PHONE_CHARS.test(v) && digitCount(v) >= 7;
}

/** `(•••) •••-0123`: only the last four digits of an E.164 number. */
export function maskPhone(e164: string): string {
  return /^\+1\d{10}$/.test(e164)
    ? `(•••) •••-${e164.slice(-4)}`
    : "(•••) •••-••••";
}
