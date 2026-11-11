import type { ReadinessItem } from "@/lib/campaigns/readiness";
import { Badge } from "./primitives";

const WORDS: Record<ReadinessItem["status"], string> = {
  ready: "Ready",
  warn: "Check",
  blocked: "Blocked",
};
const VARIANT = { ready: "ok", warn: "warn", blocked: "bad" } as const;

/**
 * The save the date's readiness list in plain words. A blocked item holds back
 * the real send, with its reason; a "check" item only warns. Presentational: the
 * items come from the server.
 */
export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  const blocked = items.some((i) => i.status === "blocked");
  return (
    <div className="stack-sm">
      {blocked ? (
        <p className="strong">
          The real send is held back until everything blocked is fixed.
        </p>
      ) : null}
      <ul className="plain stack-sm">
        {items.map((item) => (
          <li key={item.key}>
            <div className="row">
              <Badge variant={VARIANT[item.status]}>{WORDS[item.status]}</Badge>
              <span className="strong">{item.label}</span>
            </div>
            <div className="muted small">{item.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
