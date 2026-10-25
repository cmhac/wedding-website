import { AccessDenied } from "@/components/admin/AccessDenied";
import { HouseholdCreateForm } from "@/components/admin/forms/HouseholdCreateForm";
import { PageHeader } from "@/components/admin/primitives";
import { loadEventOptions } from "@/lib/admin/data/households";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

export default async function NewHouseholdPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const events = await loadEventOptions(session.supabase);
  return (
    <>
      <PageHeader
        title="New household"
        description="Add a household with its guests. Leave the contact email empty for a paper-only household."
      />
      <HouseholdCreateForm events={events} />
    </>
  );
}
