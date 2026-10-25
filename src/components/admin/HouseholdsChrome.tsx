import Link from "next/link";
import { PageHeader, TabLinks } from "./primitives";

// The heading, the Import and New household links, and the two view tabs.
// Shared by the household list and the possible-duplicates view.

export function HouseholdsChrome({
  description,
  duplicateCount,
  current,
}: {
  description: string;
  duplicateCount: number;
  current: "all" | "duplicates";
}) {
  return (
    <>
      <PageHeader
        title="Households"
        description={description}
        actions={
          <>
            <Link href="/admin/import" className="btn">
              Import
            </Link>
            <Link href="/admin/households/new" className="btn btn-primary">
              New household
            </Link>
          </>
        }
      />
      <TabLinks
        label="Household views"
        basePath="/admin/households"
        param="view"
        tabs={[
          { value: "all", label: "All households" },
          {
            value: "duplicates",
            label: `Possible duplicates (${duplicateCount})`,
          },
        ]}
        current={current}
      />
    </>
  );
}
