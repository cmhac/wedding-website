/**
 * Logger for server code. Guest data is personal data (FR-026), so it accepts
 * only ids, codes, and counts: primitive values under keys that are not
 * personal-data names. Anything else is dropped before writing.
 */

const FORBIDDEN = ["email", "name", "address", "dietary", "token", "body"];
const EMAIL_LIKE = /\S+@\S+/;

export type LogFields = Record<string, string | number | boolean | null>;

function sanitize(fields: LogFields = {}): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN.some((f) => lower.includes(f))) continue;
    if (value !== null && typeof value === "object") continue;
    if (typeof value === "function" || typeof value === "undefined") continue;
    if (typeof value === "string" && EMAIL_LIKE.test(value)) continue;
    out[key] = value;
  }
  return out;
}

function write(
  level: "info" | "warn" | "error",
  event: string,
  fields?: LogFields,
) {
  const line = JSON.stringify({ level, event, ...sanitize(fields) });
  console[level](line);
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
