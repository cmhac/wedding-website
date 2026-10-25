import { formatPacific } from "./time";

/** The status line after settings are saved; `iso` is the stored deadline or null. */
export function savedSettingsMessage(iso: string | null): string {
  return iso
    ? `Saved. Default deadline is ${formatPacific(iso, { date: true, time: true })}.`
    : "Saved. There is no default deadline.";
}
