import Link from "next/link";
import type { DuplicatePair } from "@/lib/admin/data/households";
import { DataTable } from "./DataTable";
import { HouseholdsChrome } from "./HouseholdsChrome";
import { Alert, Card } from "./primitives";

export function DuplicatesView({
  pairs,
  description = "",
}: {
  pairs: DuplicatePair[];
  /** The page subtitle, for example "118 households, 231 guests". */
  description?: string;
}) {
  const link = (household: { id: string; displayName: string }) => (
    <Link href={`/admin/households/${household.id}`}>
      {household.displayName}
    </Link>
  );
  return (
    <>
      <HouseholdsChrome
        description={description}
        duplicateCount={pairs.length}
        current="duplicates"
      />
      <Card heading="Possible duplicates">
        <div className="stack">
          <Alert variant="info">
            These are flagged only. Nothing is merged automatically. Open each
            household and edit or delete one by hand.
          </Alert>
          <DataTable
            columns={[
              { key: "a", header: "Household A", cell: (p) => link(p.a) },
              { key: "b", header: "Household B", cell: (p) => link(p.b) },
              { key: "why", header: "Why flagged", cell: (p) => p.reason },
            ]}
            rows={pairs}
            rowKey={(p) => `${p.a.id}:${p.b.id}`}
            empty="No possible duplicates."
          />
        </div>
      </Card>
    </>
  );
}
