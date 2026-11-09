/** @jest-environment node */
import { renderToStaticMarkup } from "react-dom/server";
import SiteRootLayout, { metadata } from "../layout";
import { THEME_INIT_SCRIPT } from "@/lib/site/theme";

describe("site root layout", () => {
  it("asks search engines not to index the placeholder", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("applies a saved theme before first paint with the inline script in the head", () => {
    const html = renderToStaticMarkup(
      <SiteRootLayout>
        <p>child</p>
      </SiteRootLayout>,
    );
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain("<script>");
    expect(head).toContain(THEME_INIT_SCRIPT);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<p>child</p>");
  });
});
