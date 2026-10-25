import Link from "next/link";
import { Card, PageHeader } from "./primitives";

export function AccessDenied() {
  return (
    <div className="stack">
      <PageHeader title="You do not have access to this" />
      <Card>
        <p>
          This part of the console is only for signed-in staff.{" "}
          <Link href="/admin/sign-in">Go to sign in</Link>
        </p>
      </Card>
    </div>
  );
}
