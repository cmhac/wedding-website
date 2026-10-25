import type { ImportResponse } from "@/lib/admin-api/schemas";
import Link from "next/link";
import { DataTable, type Column } from "./DataTable";
import { Alert, Card, StatTile } from "./primitives";

export type ImportOutcome =
  | { ok: true; fileName: string; data: ImportResponse }
  /** The whole file was refused; `message` is the server's plain message. */
  | { ok: false; message: string };

type ImportRowError = ImportResponse["errors"][number];

const columns: Column<ImportRowError>[] = [
  { key: "row", header: "Row", numeric: true, cell: (e) => e.row },
  { key: "field", header: "Field", cell: (e) => e.field },
  { key: "message", header: "Problem", cell: (e) => e.message },
];

export function ImportResultView({ outcome }: { outcome: ImportOutcome }) {
  if (!outcome.ok) {
    return (
      <Alert variant="error">{outcome.message} Nothing was imported.</Alert>
    );
  }
  const { data, fileName } = outcome;
  const { created, errors, source } = data;
  return (
    <div className="stack">
      {source.format === "xlsx" && source.sheet ? (
        <Alert variant="info">
          Read sheet <strong>&quot;{source.sheet.name}&quot;</strong> from{" "}
          <strong>{fileName}</strong> (the first of {source.sheet.count}{" "}
          {source.sheet.count === 1 ? "sheet" : "sheets"}).
        </Alert>
      ) : null}
      {errors.length === 0 ? (
        <Alert variant="ok">All rows imported.</Alert>
      ) : null}
      <div className="stats">
        <StatTile value={created.households} label="Households created" />
        <StatTile value={created.guests} label="Guests created" />
        <StatTile value={created.invitations} label="Invitations created" />
        {errors.length > 0 ? (
          <StatTile value={errors.length} label="Rows need fixing" />
        ) : null}
      </div>
      {errors.length > 0 ? (
        <Card heading="Rows that need fixing">
          <p className="muted small">
            Fix these in your file and import again.
          </p>
          <DataTable
            columns={columns}
            rows={errors}
            rowKey={(e) => `${e.row}-${e.field}-${e.message}`}
            empty="No rows need fixing."
          />
        </Card>
      ) : null}
      {created.households > 0 ? (
        <div className="row">
          <Link href="/admin/households" className="btn">
            View households
          </Link>
        </div>
      ) : null}
    </div>
  );
}
