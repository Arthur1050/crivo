/**
 * Referência dos workflows anteriores à extração do núcleo (L18a, T39 em `55027e5`).
 *
 * Os testes de `n8n/workflows/__tests__/` que usam este módulo comparam o gerado atual com a fonte de
 * `bf5e646`, lida do histórico por `git show bf5e646:n8n/...`, e não com a fonte atual: assim a referência
 * não muda junto com o que está sendo testado. O custo é depender do histórico do git: um clone raso
 * sem `bf5e646` quebra esses testes, e a primeira mudança legítima de workflow também.
 * A troca por asserções sobre `n8n/generated/` está no backlog do L18c (`.specs/ROADMAP-POS-PILOTO.md`),
 * já que a prova byte a byte do gerado fica em `scripts/__tests__/boundary-generated.test.ts`.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

type ReferenceWorkflow = { toJSON(): unknown };

const requireFromTest = createRequire(import.meta.url);

function baselineWorkflow(name: string, directory = "workflows"): ReferenceWorkflow {
  // As comparações de grafo e de nós mantêm a fonte anterior à extração
  // como referência independente da geração atual.
  const source = execFileSync("git", ["show", `bf5e646:n8n/${directory}/${name}.ts`], { encoding: "utf8" });
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const exports: { default?: ReferenceWorkflow } = {};
  const requireFromReference = (specifier: string) => {
    const generatedPrefix = "../generated/";
    if (specifier.startsWith(generatedPrefix)) {
      return { default: baselineWorkflow(specifier.slice(generatedPrefix.length), "generated") };
    }
    return requireFromTest(specifier);
  };
  new Function("exports", "require", outputText)(exports, requireFromReference);
  if (!exports.default) throw new Error(`Workflow de referência ausente: ${name}`);
  return exports.default;
}

export const principal = baselineWorkflow("principal");
export const scheduler = baselineWorkflow("scheduler");
export const reengagementContextual = baselineWorkflow("reengagement-contextual");
export const respondToLead = baselineWorkflow("tool-responder-lead");
