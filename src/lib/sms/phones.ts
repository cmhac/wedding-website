import "server-only";
import { callRpc } from "@/lib/guest-api/request";
import { parseUsPhone } from "./phone";
import { isSmsConfigured, type EnvLike } from "./state";

/**
 * Staff phone management (research: Phone numbers are contacts, with one
 * validation path). The number is validated as a United States number here,
 * then written by the service-role functions, which staff cannot call
 * directly. Nothing returns or logs a number in a failure result.
 */

export type PhoneFailureCode =
  | "invalid_phone"
  | "not_us_phone"
  | "phone_in_use"
  | "texting_not_configured"
  | "not_found"
  | "failed";

export type PhoneFailure = { ok: false; code: PhoneFailureCode };

function fromDatabase(error: { message?: string } | null): PhoneFailure {
  switch (error?.message) {
    case "phone_in_use":
      return { ok: false, code: "phone_in_use" };
    case "not_found":
      return { ok: false, code: "not_found" };
    case "invalid_payload":
      return { ok: false, code: "invalid_phone" };
    default:
      return { ok: false, code: "failed" };
  }
}

function validate(
  input: string,
  env: EnvLike,
): { ok: true; e164: string } | PhoneFailure {
  if (!isSmsConfigured(env))
    return { ok: false, code: "texting_not_configured" };
  const parsed = parseUsPhone(input);
  if (parsed.ok) return parsed;
  return {
    ok: false,
    code: parsed.reason === "not_us" ? "not_us_phone" : "invalid_phone",
  };
}

export async function addPhone(
  admin: unknown,
  householdId: string,
  input: string,
  env: EnvLike = process.env,
): Promise<{ ok: true; contactId: string; e164: string } | PhoneFailure> {
  const phone = validate(input, env);
  if (!phone.ok) return phone;
  const { data, error } = await callRpc(admin, "add_phone_contact", {
    household_id: householdId,
    value: phone.e164,
  });
  if (error) return fromDatabase(error);
  return { ok: true, contactId: String(data), e164: phone.e164 };
}

export async function changePhone(
  admin: unknown,
  householdId: string,
  contactId: string,
  input: string,
  env: EnvLike = process.env,
): Promise<{ ok: true; e164: string } | PhoneFailure> {
  const phone = validate(input, env);
  if (!phone.ok) return phone;
  const { error } = await callRpc(admin, "update_phone_contact", {
    household_id: householdId,
    contact_id: contactId,
    value: phone.e164,
  });
  if (error) return fromDatabase(error);
  return { ok: true, e164: phone.e164 };
}

export async function removePhone(
  admin: unknown,
  householdId: string,
  contactId: string,
): Promise<{ ok: true; paperOnly: boolean } | PhoneFailure> {
  const { data, error } = await callRpc(admin, "remove_phone_contact", {
    household_id: householdId,
    contact_id: contactId,
  });
  if (error) return fromDatabase(error);
  return {
    ok: true,
    paperOnly: (data as { paper_only?: boolean } | null)?.paper_only === true,
  };
}
