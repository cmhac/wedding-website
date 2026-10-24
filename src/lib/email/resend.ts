import { Resend } from "resend";

/**
 * Resend client. Server-only: `RESEND_API_KEY` must never reach the browser, so
 * import this module only from route handlers and server code.
 */

let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(key);
  }
  return client;
}
