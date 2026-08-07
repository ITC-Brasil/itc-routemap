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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Assets gerados/minificados da skill graphify (nao sao codigo do projeto).
    ".graphify/**",
    // Protótipo de design (design/handoff): referência visual, não código do
    // projeto. Nada ali é importado pelo app — support.js é o runtime do
    // protótipo e usa ReactDOM.render, que o lint reprova com razão.
    "design/**",
  ]),
]);

export default eslintConfig;
