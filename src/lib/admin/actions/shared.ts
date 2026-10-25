/**
 * Shared plumbing for the admin console's server actions. Plain TypeScript:
 * each action file carries its own "use server" and calls `runAdminAction`.
 * The helper checks the session, validates the form, runs the handler as the
 * signed-in staff member, maps refusals to plain English, and revalidates.
 */
import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getSession, type StaffRole } from "@/lib/auth/session";
import { log } from "@/lib/log";
import { messageFor, messageFromDbError } from "../messages";

/** What a form held when it was submitted, for refilling the fields. */
export type FormValues = Record<string, string | string[]>;

export type ActionResult<T = undefined> =
  | (T extends undefined
      ? { ok: true; data?: undefined }
      : { ok: true; data: T })
  | {
      ok: false;
      /** Always set; plain English. */
      message: string;
      /** Plain-English message per field name; only for invalid input. */
      fieldErrors?: Record<string, string>;
      /** The typed values, to refill the form; only once a form was read. */
      values?: FormValues;
    };

export type ActionContext<S extends z.ZodType> = {
  input: z.output<S>;
  supabase: SupabaseClient;
  user: User;
  role: StaffRole;
};

/** What a handler returns. Return nothing for plain success. */
export type HandlerResult<T = undefined> = {
  /** A Supabase/Postgres error to report; skips revalidation. */
  error?: { message?: string | null; code?: string | null } | null;
  /** Paths to revalidate on success. */
  revalidate?: string[];
  data?: T;
} | void;

export type RunOptions = {
  /** Only couple members may run the action; planners are refused. */
  coupleOnly?: boolean;
  /** Test seam: use this client instead of the cookie-based server client. */
  supabase?: SupabaseClient;
};

/** FormData to a plain object. Repeated keys become arrays; files and Next internals ($ACTION_...) are skipped. */
export function formDataToObject(formData: FormData): FormValues {
  const out: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else
      out[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
  }
  return out;
}

/** Fallback wording; a message written into the schema always wins. */
function plainFieldMessage(issue: z.core.$ZodRawIssue): string {
  const input = issue.input;
  const empty = input === undefined || input === null || input === "";
  switch (issue.code) {
    case "invalid_type":
      return empty ? "This is required." : "This is not a valid value.";
    case "too_small":
      return issue.origin === "string" && Number(issue.minimum) <= 1
        ? "This is required."
        : issue.origin === "string"
          ? "This is too short."
          : "This number is lower than allowed.";
    case "too_big":
      return issue.origin === "string"
        ? "This is too long."
        : "This number is higher than allowed.";
    case "invalid_format":
      return "This is not in the expected format.";
    case "invalid_value":
      return "Please choose one of the options.";
    default:
      return "This is not valid.";
  }
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"))
  );
}

export async function runAdminAction<S extends z.ZodType, T = undefined>(
  schema: S,
  formData: FormData,
  handler: (
    ctx: ActionContext<S>,
  ) => Promise<HandlerResult<T>> | HandlerResult<T>,
  options: RunOptions = {},
): Promise<ActionResult<T>> {
  try {
    const session = await getSession(options.supabase);
    if (!session) return { ok: false, message: messageFor("unauthenticated") };
    if (
      session.kind !== "staff" ||
      !session.role ||
      (options.coupleOnly && session.role !== "couple")
    ) {
      return { ok: false, message: messageFor("forbidden") };
    }

    const values = formDataToObject(formData);
    const parsed = schema.safeParse(values, { error: plainFieldMessage });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length
          ? issue.path.map(String).join(".")
          : "_form";
        fieldErrors[key] ??= issue.message;
      }
      return {
        ok: false,
        message: messageFor("invalid_request"),
        fieldErrors,
        values,
      };
    }

    const result = await handler({
      input: parsed.data,
      supabase: session.supabase,
      user: session.user,
      role: session.role,
    });

    if (result?.error) {
      return { ok: false, message: messageFromDbError(result.error), values };
    }
    for (const path of result?.revalidate ?? []) revalidatePath(path);
    return (
      result?.data === undefined
        ? { ok: true }
        : { ok: true, data: result.data }
    ) as ActionResult<T>;
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    log.error("admin_action_failed", { code: "server_error" });
    return { ok: false, message: messageFor("server_error") };
  }
}
