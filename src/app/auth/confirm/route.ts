import { getSession } from "@/lib/auth/session";
import {
  ADMIN_PATH,
  FAILURE_PATH,
  allowedNext,
  guestPath,
  redirectTo,
} from "@/lib/auth/redirect";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Completes a typed-address sign-in link (research R5): exchanges the emailed
 * single-use `token_hash` for a session and redirects like `/auth/callback`.
 *
 * `GET` is the link in the email. `POST` takes the same fields as a form, so a
 * frontend can show a "Continue" page first: a mail scanner that only opens the
 * link then does not use the token up. Every failure redirects to the one
 * failure path with no detail.
 */
async function confirm(fields: {
  token_hash: string | null;
  type: string | null;
  next: string | null;
}): Promise<Response> {
  if (!fields.token_hash || fields.type !== "email") {
    return redirectTo(FAILURE_PATH);
  }
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: fields.token_hash,
      type: "email",
    });
    if (error) return redirectTo(FAILURE_PATH);

    const session = await getSession();
    if (!session) return redirectTo(FAILURE_PATH);

    const fallback = session.kind === "staff" ? ADMIN_PATH : guestPath();
    return redirectTo(allowedNext(fields.next, session.kind) ?? fallback);
  } catch {
    return redirectTo(FAILURE_PATH);
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return confirm({
    token_hash: params.get("token_hash"),
    type: params.get("type"),
    next: params.get("next"),
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(FAILURE_PATH);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : null;
  };
  return confirm({
    token_hash: field("token_hash"),
    type: field("type"),
    next: field("next"),
  });
}
