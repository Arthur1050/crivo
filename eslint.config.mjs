import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";

const boundaryMap = JSON.parse(readFileSync(new URL("./scripts/boundary/map.json", import.meta.url), "utf8"));
const testGlobs = ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"];

function globPattern(glob) {
  const directory = glob.endsWith("/**");
  const base = directory ? glob.slice(0, -3) : glob;
  const pattern = base.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*")
    .replace(/\\\.(?:[cm]?[jt]sx?)$/, "(?:\\.[cm]?[jt]sx?)?");
  return pattern + (directory ? "(?:/(?!\\.\\.(?:/|$)).*)?" : "");
}

function restrictions(origin, directory) {
  const targets = boundaryMap.filter((destination) =>
    origin.layer === "core" && ["vertical", "app"].includes(destination.layer)
    || origin.layer === "vertical" && destination.layer === "app"
    || origin.package === "@core/client" && destination.package === "@core/server"
  );
  const patterns = targets.flatMap((target) => {
    const relative = posix.relative(directory, target.glob);
    return [globPattern(`@/${target.glob}`), globPattern(relative.startsWith(".") ? relative : `./${relative}`)];
  });
  if (origin.package === "@core/client") patterns.push("server-only");
  return ["error", { patterns: [{ regex: `^(?:${patterns.join("|")})$`, message: "Import fora da direção da fronteira do núcleo." }] }];
}

// O caminho relativo proibido depende da pasta de quem importa: uma entrada por pasta real da regra.
function directoriesOf(glob) {
  if (!glob.endsWith("/**")) return [{ directory: posix.dirname(glob), files: glob }];
  const walk = (directory) => existsSync(directory) ? [directory, ...readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
    .flatMap((entry) => walk(`${directory}/${entry.name}`))] : [];
  return walk(glob.slice(0, -3)).map((directory) => ({ directory, files: `${directory}/*` }));
}

const boundaryRules = boundaryMap.flatMap((rule, index) => rule.layer === "app" ? [] : directoriesOf(rule.glob).map(({ directory, files }) => ({
  files: [files],
  ignores: [...testGlobs, ...boundaryMap.slice(0, index).map((previous) => previous.glob)],
  rules: { "no-restricted-imports": restrictions(rule, directory) },
})));

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
