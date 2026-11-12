import Link from "next/link";
import type { PreviewData } from "@/lib/admin/actions/campaigns";
import { DataTable, type Column } from "./DataTable";
import { Alert, Badge, Card, EmptyState } from "./primitives";

type PreviewRow = {
  householdId: string;
  name: string;
  /** Emails this household will get (one per address); absent when skipped. */
  addresses?: number;
  /** Absent for a household that will be emailed. */
  reason?: string;
};

const REASON_BADGE: Record<string, string> = {
  no_email: "No email",
  opted_out: "Opted out",
  already_responded: "Already responded",
  household_missing: "Household missing",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function skippedLine(skipped: PreviewData["skipped"]): string {
  const count = (reason: string) =>
    skipped.filter((s) => s.reason === reason).length;
  const noEmail = count("no_email");
  const optedOut = count("opted_out");
  const other = skipped.length - noEmail - optedOut;
  const parts = [
    noEmail ? `${noEmail} with no email (need a paper invite)` : "",
    optedOut ? `${optedOut} opted out` : "",
    other ? `${other} for another reason` : "",
  ].filter(Boolean);
  const lead = `${skipped.length} ${plural(skipped.length, "is", "are")} skipped`;
  return `${lead}: ${parts.join(", ")}`;
}

const COLUMNS: Column<PreviewRow>[] = [
  {
    key: "household",
    header: "Household",
    cell: (r) => (
      <Link href={`/admin/households/${encodeURIComponent(r.householdId)}`}>
        {r.name}
      </Link>
    ),
  },
  {
    key: "result",
    header: "Result",
    cell: (r) =>
      r.reason === undefined ? (
        <Badge variant="ok">
          {(r.addresses ?? 1) > 1
            ? `Will send ${r.addresses} emails`
            : "Will send"}
        </Badge>
      ) : (
        <Badge variant="warn">{REASON_BADGE[r.reason] ?? "Skipped"}</Badge>
      ),
  },
];

function textLines(texts: NonNullable<PreviewData["texts"]>) {
  const count = (reason: string) =>
    texts.notTexted.filter((n) => n.reason === reason).length;
  const total = texts.willText.reduce((n, r) => n + r.texts, 0);
  const notAsked = count("not_opted_in");
  const declined = count("declined");
  const noPhone = count("no_phone");
  const parts = [
    notAsked
      ? `${notAsked} not opted in (a household with only a phone and no opt-in needs you to reach them another way)`
      : "",
    declined ? `${declined} declined` : "",
    noPhone ? `${noPhone} with no phone number` : "",
  ].filter(Boolean);
  return {
    lead: `${texts.willText.length} ${plural(texts.willText.length, "household", "households")} will be texted (${total} ${plural(total, "text", "texts")} in all, only to numbers that opted in)`,
    skipped: parts.length ? `Not texted: ${parts.join(", ")}` : "",
  };
}

export function AudiencePreviewView({ preview }: { preview: PreviewData }) {
  const { willSend, skipped } = preview;
  if (willSend.length === 0 && skipped.length === 0) {
    return (
      <Card heading="Audience preview">
        <EmptyState>No households match this audience.</EmptyState>
      </Card>
    );
  }
  const rows: PreviewRow[] = [...willSend, ...skipped];
  const emails = willSend.reduce((n, r) => n + r.addresses, 0);
  return (
    <Card heading="Audience preview">
      <div className="stack-sm">
        <p className="strong">
          {willSend.length} {plural(willSend.length, "household", "households")}{" "}
          will be emailed
        </p>
        {emails > willSend.length ? (
          <p>{`${emails} emails in all, one per address`}</p>
        ) : null}
        {skipped.length ? <p>{skippedLine(skipped)}</p> : null}
        {preview.unreachable ? (
          <p>
            {preview.unreachable}{" "}
            {plural(
              preview.unreachable,
              "household cannot",
              "households cannot",
            )}{" "}
            be reached by this campaign (no email and no opted-in number): they
            depend on the post.
          </p>
        ) : null}
        {preview.sendWarning ? (
          <Alert variant="warn">{preview.sendWarning}</Alert>
        ) : null}
        {preview.texts ? <TextSummary texts={preview.texts} /> : null}
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.householdId}
          empty="No households."
        />
      </div>
    </Card>
  );
}

function TextSummary({ texts }: { texts: NonNullable<PreviewData["texts"]> }) {
  if (texts.switchedOff) {
    return <p>Texting is switched off: texts will be skipped.</p>;
  }
  const lines = textLines(texts);
  return (
    <>
      <p className="strong">{lines.lead}</p>
      {lines.skipped ? <p>{lines.skipped}</p> : null}
      {texts.preConsented ? (
        <p>
          {texts.preConsented}{" "}
          {plural(texts.preConsented, "number was", "numbers were")} consented
          by staff or the import, so they get the first message without signing
          in.
        </p>
      ) : null}
      {texts.segmentsPerText && texts.totalSegments ? (
        <p>
          {texts.segmentsPerText}{" "}
          {plural(texts.segmentsPerText, "segment", "segments")} each,{" "}
          {texts.totalSegments} in all
          {texts.minutes
            ? `; sending them all takes about ${texts.minutes} ${plural(texts.minutes, "minute", "minutes")}`
            : ""}
          .
        </p>
      ) : null}
    </>
  );
}
