import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";

/** Percorre os imports reais para que uma dependência indireta também falhe. */
export function sourceGraph(entry: string) {
  const sources: Record<string, string> = {};
  const externalImports: string[] = [];
  function visit(file: string) {
    if (Object.hasOwn(sources, file)) return;
    const source = readFileSync(file, "utf8");
    sources[file] = source;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function inspect(node: ts.Node) {
      const target = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (target && ts.isStringLiteral(target)) {
        const specifier = target.text;
        const base = specifier.startsWith("@/") ? specifier.slice(2)
          : specifier.startsWith(".") ? posix.join(posix.dirname(file), specifier) : null;
        if (base === null) externalImports.push(specifier);
        else {
          const resolved = [base, ...[".ts", ".tsx", ".mjs", ".mts", ".js", "/index.ts"].map(extension => base + extension)].find(candidate => existsSync(candidate) && /\.[cm]?[jt]sx?$/.test(candidate));
          if (!resolved) throw new Error(`Import não resolvido: ${file} -> ${specifier}`);
          visit(resolved);
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
  }
  visit(entry);
  return { sources, externalImports };
}
