import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Guest data is personal data: log only through src/lib/log.ts, which
    // drops personal fields. Scripts write with process.stdout/stderr.
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    ignores: ["src/lib/log.ts", "**/__tests__/**"],
    rules: { "no-console": "error" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "supabase/functions/**",
  ]),
]);
