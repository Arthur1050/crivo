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
