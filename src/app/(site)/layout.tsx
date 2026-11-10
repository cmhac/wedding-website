import type { Metadata } from "next";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/lib/site/theme";
import "./site.css";

export const metadata: Metadata = {
  title: "Chris & Hannah",
  // A placeholder: not for search engines until the real site replaces it.
  robots: { index: false, follow: false },
};

// Root layout for the site route group, as (admin) has its own. There is
// deliberately no src/app/layout.tsx, so nothing is imposed on the designer's
// site. The inline script applies a saved light/dark choice before first paint.
export default function SiteRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
