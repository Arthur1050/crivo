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
    // Scaffolds da CLI da Astryx (git-ignored, nunca fazem parte do app).
    "scratch/**",
    // Projeto próprio (AD-041): lint, tsconfig e dependências na pasta `vitrine/`.
    "vitrine/**",
  ]),
]);

export default eslintConfig;
