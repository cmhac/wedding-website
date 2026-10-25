import type { AnsweredBy } from "@/lib/admin/attribution";
import { formatPacific } from "@/lib/admin/time";
import { Badge } from "./primitives";

/** Who answered an RSVP or chose a meal, as a badge with plain-English text. */
export function AnsweredByBadge({ answeredBy }: { answeredBy: AnsweredBy }) {
  switch (answeredBy.kind) {
    case "guest":
      return <Badge>Guest</Badge>;
    case "staff": {
      const when = answeredBy.at ? formatPacific(answeredBy.at) : "";
      return (
        <Badge variant="staff">
          Recorded by staff
          {" ("}
          {when ? `${answeredBy.name}, ${when}` : answeredBy.name}
          {")"}
        </Badge>
      );
    }
    case "former_staff":
      return <Badge variant="staff">Staff (former member)</Badge>;
    case "system":
      return <Badge>System</Badge>;
    case "unknown":
      return <Badge variant="warn">Unknown</Badge>;
    case "shared_account":
      return <Badge variant="warn">Staff or household (same account)</Badge>;
    case "not_answered":
      return <Badge>Not answered</Badge>;
  }
}
