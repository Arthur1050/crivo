import { posix } from "node:path";
import ts from "typescript";
import marketTerms from "./market-terms.json";

export type Layer = "core" | "vertical" | "app";
export type CorePackage = "@core/db" | "@core/server" | "@core/agent" | "@core/client" | "@core/vertical-kit";
export interface BoundaryRule {
  glob: string;
  layer: Layer;
  package?: CorePackage;
}
export interface Violation {
  file: string;
  line: number;
  message: string;
}

export interface TransitionalEntry {
  path: string;
  term: string;
  reason: string;
  removedIn: string;
  category: string;
}

export type Sources = Readonly<Record<string, string>>;

interface CodeToken {
  text: string;
  node: ts.Node;
  ast: ts.SourceFile;
}

function codeTokens(file: string, source: string): CodeToken[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const tokens: CodeToken[] = [];
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteralLike(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      tokens.push({ text: node.text, node, ast });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return tokens;
}

function applyExceptions(candidates: (Violation & { term: string })[], transitional: readonly TransitionalEntry[], prefix: string): Violation[] {
  const used = new Set<TransitionalEntry>();
  const violations: Violation[] = [];
  for (const candidate of candidates) {
    const entry = transitional.find((entry) => entry.path === candidate.file && entry.term === candidate.term);
    if (entry) used.add(entry);
    else violations.push({ file: candidate.file, line: candidate.line, message: candidate.message });
  }
  for (const entry of transitional.filter((entry) => entry.term.startsWith(prefix))) {
    if (!used.has(entry)) violations.push({ file: entry.path, line: 1, message: `Exceção sem ocorrência: ${entry.path} -> ${entry.term}` });
  }
  return violations;
}

export function checkMarketTerms(sources: Sources, rules: readonly BoundaryRule[], transitional: readonly TransitionalEntry[] = []): Violation[] {
  const candidates: (Violation & { term: string })[] = [];
  for (const [file, source] of Object.entries(sources)) {
    if (isTest(file) || !/\.[cm]?[jt]sx?$/.test(file) || classifyFile(file, rules)?.layer !== "core") continue;
    for (const token of codeTokens(file, source)) {
      for (const term of marketTerms) {
        if (!token.text.toLowerCase().includes(term)) continue;
        const position = token.node.getStart(token.ast) + Math.max(0, token.node.getText(token.ast).toLowerCase().indexOf(term));
        candidates.push({ file, line: token.ast.getLineAndCharacterOfPosition(position).line + 1,
          term: `market:${term}`, message: `Termo de mercado "${term}" em ${file}` });
      }
    }
  }
  return applyExceptions(candidates, transitional, "market:");
}

function importsOf(file: string, source: string): { target: string; line: number }[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: { target: string; line: number }[] = [];
  function visit(node: ts.Node) {
    const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0] : undefined;
    if (literal && ts.isStringLiteral(literal)) {
      imports.push({ target: literal.text, line: ast.getLineAndCharacterOfPosition(literal.getStart(ast)).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return imports;
}

function resolveImport(file: string, target: string, sources: Sources): string | undefined {
  const base = target.startsWith("@/") ? target.slice(2)
    : target.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), target)) : undefined;
  if (!base) return undefined;
  return [base, ...[".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json"].map((extension) => base + extension),
    ...[".ts", ".tsx", ".mjs", ".js"].map((extension) => `${base}/index${extension}`)]
    .find((candidate) => candidate in sources);
}

export function checkImports(sources: Sources, rules: readonly BoundaryRule[], transitional: readonly TransitionalEntry[] = []): Violation[] {
  const violations: Violation[] = [];
  const used = new Set<TransitionalEntry>();
  for (const [file, source] of Object.entries(sources)) {
    if (isTest(file) || !/\.[cm]?[jt]sx?$/.test(file)) continue;
    const origin = classifyFile(file, rules);
    if (!origin) continue;
    for (const item of importsOf(file, source)) {
      const target = item.target === "server-only" ? item.target : resolveImport(file, item.target, sources);
      if (!target) continue;
      const destination = classifyFile(target, rules);
      const prohibited = origin.layer === "core" && (destination?.layer === "vertical" || destination?.layer === "app")
        || origin.layer === "vertical" && destination?.layer === "app"
        || origin.package === "@core/client" && (target === "server-only" || destination?.package === "@core/server");
      if (!prohibited) continue;
      const entry = transitional.find((entry) => entry.path === file && entry.term === `import:${target}`);
      if (entry) used.add(entry);
      else violations.push({ file, line: item.line, message: `Import proibido: ${file} -> ${target}` });
    }
  }
  for (const entry of transitional.filter((entry) => entry.term.startsWith("import:"))) {
    if (!used.has(entry)) violations.push({ file: entry.path, line: 1, message: `Exceção sem ocorrência: ${entry.path} -> ${entry.term}` });
  }
  return violations;
}

export function matchesGlob(file: string, glob: string): boolean {
  const pattern = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*");
  return new RegExp(`^${pattern}$`).test(file.replace(/\\/g, "/"));
}

export function isTest(file: string): boolean {
  return file.includes("/__tests__/") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export function classifyFile(file: string, rules: readonly BoundaryRule[]): BoundaryRule | undefined {
  // Testes herdam a classificação do módulo, mesmo quando uma regra estreita
  // aparece antes da regra da pasta inteira.
  const target = isTest(file)
    ? file.replace("/__tests__/", "/").replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, "$2")
    : file;
  return rules.find((rule) => matchesGlob(target, rule.glob));
}

export function checkClassification(files: readonly string[], rules: readonly BoundaryRule[]): Violation[] {
  const violations: Violation[] = [];
  const sourceFiles = files.filter((file) => !isTest(file));
  for (const file of sourceFiles) {
    const rule = classifyFile(file, rules);
    if (!rule) violations.push({ file, line: 1, message: `Arquivo sem classificação: ${file}` });
    else if (rule.layer === "core" && !rule.package) {
      violations.push({ file, line: 1, message: `Arquivo core sem pacote: ${file}` });
    }
  }
  for (const rule of rules) {
    if (!sourceFiles.some((file) => matchesGlob(file, rule.glob))) {
      violations.push({ file: rule.glob, line: 1, message: `Regra órfã: ${rule.glob}` });
    }
  }
  return violations;
}

