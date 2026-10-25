import { redirect } from "next/navigation";
import { SignInForm } from "@/components/admin/forms/SignInForm";
import { getSession } from "@/lib/auth/session";

export default async function SignInPage() {
  const session = await getSession();
  if (session?.kind === "staff") redirect("/admin");
  return (
    <div className="page-center">
      <div className="row">
        <span className="brand-mark" aria-hidden="true">
          W
        </span>
        <div>
          <strong>Wedding admin</strong>
          <div className="muted small">v0 test console</div>
        </div>
      </div>
      <div className="card card-narrow">
        <div className="card-b stack">
          <div>
            <h1 className="page-title">Staff sign-in</h1>
            <p className="page-sub">
              We email you a one-time link. Couple and planner accounts only.
            </p>
          </div>
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
