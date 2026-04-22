import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev-runtime*/**",
    ".next-playwright/**",
    "tmp_check_banks.js",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "node_modules/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
