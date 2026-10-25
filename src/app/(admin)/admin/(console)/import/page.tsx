import { ImportForm } from "@/components/admin/forms/ImportForm";
import { PageHeader } from "@/components/admin/primitives";

export default function ImportPage() {
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
