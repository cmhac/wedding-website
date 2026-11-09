/**
 * Test stand-in for `@react-email/render`. The real `render` loads React DOM's
 * server renderer with a dynamic `import()`, which Jest's CommonJS runtime
 * refuses without `--experimental-vm-modules`. This version renders with a
 * plain `require` and otherwise reuses the real package's functions, so the
 * email templates produce the same HTML and plain text in tests.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS test shim */
const real = require("../node_modules/@react-email/render/dist/node/index.cjs");
const { renderToStaticMarkup } = require("react-dom/server");

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

async function render(node, options) {
  const html = renderToStaticMarkup(node);
  if (options && options.plainText) {
    return real.toPlainText(html, options.htmlToTextOptions);
  }
  const document = `${DOCTYPE}${html.replace(/<!DOCTYPE.*?>/, "")}`;
  return options && options.pretty ? real.pretty(document) : document;
}

module.exports = { ...real, render };
