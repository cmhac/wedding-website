import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./admin.css";

export const metadata: Metadata = { title: "Wedding admin" };

// Root layout for the admin console route group. There is deliberately no
// src/app/layout.tsx: the public site's layout belongs to the designer
// (see the page-structure decision in specs/002-admin-console-v0/research.md).
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
