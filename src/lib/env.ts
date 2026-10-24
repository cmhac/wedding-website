import { z } from "zod";

const required = z.string().min(1);

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: required,
  RESEND_API_KEY: required,
  EMAIL_FROM: required,
  SEND_EMAIL_HOOK_SECRET: required,
  RESEND_WEBHOOK_SECRET: required,
  CRON_SECRET: required,
  // A relative path served by the screen builders, used to build email links.
  GUEST_RSVP_PATH: z
    .string()
    .regex(/^\/(?!\/)[^\s]*$/, "must be a relative path")
    .default("/rsvp"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

type Source = Record<string, string | undefined>;

function parse<T extends z.ZodType>(schema: T, source: Source): z.infer<T> {
  // Empty strings (as in a blank .env line) count as missing.
  const cleaned: Source = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== "") cleaned[key] = value;
  }
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;
  // Name the variables only; never include values.
  const names = [
    ...new Set(result.error.issues.map((i) => String(i.path[0] ?? "unknown"))),
  ];
  throw new Error(
    `Invalid or missing environment variables: ${names.join(", ")}`,
  );
}

/** Variables safe to expose to the browser. Pass `process.env` (the default). */
export function getPublicEnv(source: Source = process.env): PublicEnv {
  return parse(publicSchema, source);
}

/** All variables, for server code only. Throws naming the variables, never values. */
export function getServerEnv(source: Source = process.env): ServerEnv {
  return parse(serverSchema, source);
}
