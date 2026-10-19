import { Webhook } from "standardwebhooks";

/**
 * Standard Webhooks verification for the Supabase Send Email hook. Always pass
 * the raw request body: re-serialised JSON will not match the signature.
 */

export class HookVerificationError extends Error {
  constructor() {
    super("invalid_signature");
    this.name = "HookVerificationError";
  }
}

type HeaderSource = Headers | Record<string, string | undefined>;

function headerRecord(headers: HeaderSource): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) out[key.toLowerCase()] = value;
    }
  }
  return out;
}

/** Returns the parsed payload, or throws `HookVerificationError`. */
export function verifyHook(
  rawBody: string,
  headers: HeaderSource,
  secret: string | undefined = process.env.SEND_EMAIL_HOOK_SECRET,
): unknown {
  if (!secret) throw new HookVerificationError();
  try {
    // Supabase shows the secret as `v1,whsec_<base64>`.
    const webhook = new Webhook(secret.replace(/^v1,/, ""));
    return webhook.verify(rawBody, headerRecord(headers));
  } catch {
    throw new HookVerificationError();
  }
}
