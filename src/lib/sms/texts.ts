import registry from "../../../texts";
import { TemplateError } from "@/lib/email/templates";

/**
 * Looks up and renders a registered text (contract: text wording). The error
 * codes match the email templates' so callers handle both the same way:
 * `template_missing` when nothing is registered, `template_failed` when the text
 * throws.
 */

export type TextRegistry = Record<
  string,
  ((props: never) => string) | undefined
>;

export function getText(
  key: string,
  texts: TextRegistry = registry as unknown as TextRegistry,
): (props: unknown) => string {
  const text = Object.prototype.hasOwnProperty.call(texts, key)
    ? texts[key]
    : undefined;
  if (typeof text !== "function")
    throw new TemplateError("template_missing", key);
  return text as (props: unknown) => string;
}

export function renderText(
  key: string,
  props: unknown,
  texts?: TextRegistry,
): string {
  const text = getText(key, texts);
  try {
    return text(props);
  } catch {
    throw new TemplateError("template_failed", key);
  }
}
