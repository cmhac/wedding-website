import { toPlainText } from "@react-email/components";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RenderedEmail } from "../src/lib/email/templates";

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/**
 * Renders an email body to the HTML and plain text a template returns. React
 * DOM's static renderer is used directly (rather than the React Email `render`
 * helper, which loads it with a dynamic import) so templates render the same
 * in the app and in the Jest tests.
 */
export function renderEmail(
  subject: string,
  element: ReactElement,
): RenderedEmail {
  const markup = renderToStaticMarkup(element);
  return {
    subject,
    html: `${DOCTYPE}${markup}`,
    text: toPlainText(markup),
  };
}
