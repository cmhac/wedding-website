import { AccessDenied } from "@/components/admin/AccessDenied";
import { ImportForm } from "@/components/admin/forms/ImportForm";
import { PageHeader } from "@/components/admin/primitives";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

export default async function ImportPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  return (
    <>
      <PageHeader
        title="Import guest list"
        description="Upload a CSV or Excel file with one row per guest."
      />
      <ImportForm />
    </>
  );
}
