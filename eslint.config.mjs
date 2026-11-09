import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

const boundaryMap = JSON.parse(readFileSync(new URL("./scripts/boundary/map.json", import.meta.url), "utf8"));
const transitional = JSON.parse(readFileSync(new URL("./scripts/boundary/transitional.json", import.meta.url), "utf8"));
const testGlobs = ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"];

function globPattern(glob) {
  const directory = glob.endsWith("/**");
  const base = directory ? glob.slice(0, -3) : glob;
  const pattern = base.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*")
    .replace(/\\\.(?:[cm]?[jt]sx?)$/, "(?:\\.[cm]?[jt]sx?)?");
  return pattern + (directory ? "(?:/(?!\\.\\.(?:/|$)).*)?" : "");
}

function restrictions(origin, file) {
  const targets = boundaryMap.filter((destination) =>
    origin.layer === "core" && ["vertical", "app"].includes(destination.layer)
    || origin.layer === "vertical" && destination.layer === "app"
    || origin.package === "@core/client" && destination.package === "@core/server"
  );
  const directory = posix.dirname(file ?? origin.glob);
  const patterns = targets.flatMap((target) => {
    const relative = posix.relative(directory, target.glob);
    return [globPattern(`@/${target.glob}`), globPattern(relative.startsWith(".") ? relative : `./${relative}`)];
  });
  if (origin.package === "@core/client") patterns.push("server-only");
  const exceptions = transitional.filter((entry) => entry.path === file && entry.term.startsWith("import:"))
    .flatMap((entry) => {
      const target = entry.term.slice(7);
      const relative = posix.relative(directory, target);
      return [globPattern(`@/${target}`), globPattern(relative.startsWith(".") ? relative : `./${relative}`)];
    });
  const allow = exceptions.length ? `(?!(?:${exceptions.join("|")})$)` : "";
  return ["error", { patterns: [{ regex: `^${allow}(?:${patterns.join("|")})$`, message: "Import fora da direção da fronteira do núcleo." }] }];
}

const boundaryRules = boundaryMap.flatMap((rule, index) => rule.layer === "app" ? [] : [{
  files: [rule.glob],
  ignores: [...testGlobs, ...boundaryMap.slice(0, index).map((previous) => previous.glob)],
  rules: { "no-restricted-imports": restrictions(rule) },
}]);
for (const file of new Set(transitional.filter((entry) => entry.term.startsWith("import:")).map((entry) => entry.path))) {
  const rule = boundaryMap.find((rule) => new RegExp(`^${globPattern(rule.glob)}$`).test(file));
  if (rule && rule.layer !== "app") boundaryRules.push({ files: [file], ignores: testGlobs, rules: { "no-restricted-imports": restrictions(rule, file) } });
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaryRules,
  {
    // Os modelos de workflow recebem declarações e usos ao expandir os blocos.
    files: ["n8n/workflows/*.ts"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scaffolds da CLI da Astryx (git-ignored, nunca fazem parte do app).
    "scratch/**",
    "n8n/verticals/*/blocks/**",
    // Projeto próprio (AD-041): lint, tsconfig e dependências na pasta `vitrine/`.
    "vitrine/**",
  ]),
]);

export default eslintConfig;
