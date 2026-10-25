import { AuthError } from "@/components/admin/AuthError";

export default function AuthErrorPage() {
  return (
    <div className="page-center">
      <div className="card-narrow">
        <AuthError />
      </div>
    </div>
  );
}
