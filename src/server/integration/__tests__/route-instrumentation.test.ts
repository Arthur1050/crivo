import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { INSTRUMENTED } from "../route";

/**
 * Varredura de instrumentação (lote-9 — SAUDE-01/T17, design.md — Risks &
 * Concerns: "Route file novo sob `app/api/v1/**\/route.ts` pode esquecer o
 * wrapper e ficar sem instrumentação"). Descobre os route files por
 * varredura de diretório — NUNCA por lista fixa — para que um arquivo de
 * rota novo sob `/api/v1` seja coberto automaticamente, sem exigir que
 * alguém lembre de atualizar este teste.
 *
 * "Instrumentado" aqui não significa especificamente `withIntegrationRoute`:
 * a marca `INSTRUMENTED` também é aplicada por `methodNotAllowed()`
 * (`problem.ts`, T9) e pelo catch-all `notFound()`
 * (`app/api/v1/[...unmatched]/route.ts`, T10), que gravam recusa por um
 * caminho mais direto (sem autenticação nem delegação a um handler de
 * negócio). O que este teste exige é só que TODO export de verbo HTTP tenha
 * sido conscientemente instrumentado, por qualquer um dos três caminhos.
 */

const HTTP_VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const APP_V1_DIR = path.resolve(__dirname, "../../../../app/api/v1");

/** Varre `dir` recursivamente e devolve o caminho absoluto de todo
 * `route.ts` encontrado — a fonte da verdade é o sistema de arquivos, nunca
 * uma lista mantida à mão. */
function findRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }
  return files;
}

describe("app/api/v1/**/route.ts — instrumentação obrigatória (T17)", () => {
  it("descobre ao menos os 7 route files conhecidos sob /api/v1 (prova de que a varredura funciona)", () => {
    const routeFiles = findRouteFiles(APP_V1_DIR);
    // 6 rotas do contrato + o catch-all `[...unmatched]`. Não é uma lista
    // fixa de caminhos — só o teto mínimo esperado, para detectar uma
    // varredura quebrada (ex.: diretório errado) sem acoplar ao inventário.
    expect(routeFiles.length).toBeGreaterThanOrEqual(7);
  });

  it("todo export de verbo HTTP carrega a marca INSTRUMENTED, sem exceção", async () => {
    const routeFiles = findRouteFiles(APP_V1_DIR);
    const missing: string[] = [];

    for (const filePath of routeFiles) {
      // eslint-disable-next-line no-await-in-loop -- varredura sequencial de poucos arquivos, clareza > paralelismo aqui.
      const mod: Record<string, unknown> = await import(
        /* @vite-ignore */ pathToFileURL(filePath).href
      );
      const relative = path.relative(APP_V1_DIR, filePath).replace(/\\/g, "/");

      for (const verb of HTTP_VERBS) {
        const handler = mod[verb];
        if (handler === undefined) continue; // rota não implementa esse verbo — nada a exigir.

        const isInstrumented =
          typeof handler === "function" &&
          (handler as unknown as Record<symbol, unknown>)[INSTRUMENTED] === true;

        if (!isInstrumented) {
          missing.push(`${relative} exporta ${verb} sem a marca INSTRUMENTED`);
        }
      }
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });
});
