import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import {
  ADMIN_PATH,
  FAILURE_PATH,
  allowedNext,
  guestPath,
  redirectTo as redirect,
} from "@/lib/auth/redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return redirect(FAILURE_PATH);

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect(FAILURE_PATH);

    const session = await getSession();
    if (!session) return redirect(FAILURE_PATH);

    const fallback = session.kind === "staff" ? ADMIN_PATH : guestPath();
    return redirect(
      allowedNext(url.searchParams.get("next"), session.kind) ?? fallback,
    );
  } catch {
    return redirect(FAILURE_PATH);
  }
}
