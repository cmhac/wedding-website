import { render } from "@react-email/components";
import type { ReactElement } from "react";
import type { RenderedEmail } from "../src/lib/email/templates";

/** Renders an email body to the HTML and plain text a template returns. */
export async function renderEmail(
  subject: string,
  element: ReactElement,
): Promise<RenderedEmail> {
  return {
    subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
