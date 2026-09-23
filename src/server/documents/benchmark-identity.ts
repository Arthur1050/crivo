/**
 * Identidade de um benchmark de teto (lote-12 — T34, DOCLIM-01 AC11): o que,
 * se mudar, invalida a medição. Derivada das FONTES versionadas do agente,
 * não da memória de quem roda o benchmark — assim `check` e `persist` chegam
 * ao mesmo valor a partir do mesmo commit.
 *
 * Pura: recebe o texto das fontes. Quem lê os arquivos é o script.
 */

import { createHash } from "node:crypto";
import type { BenchmarkIdentity } from "./context-ceiling";

export const AGENT_TOOL_NAMES = [
  "registrar_qualificacao",
  "escalar_para_humano",
  "consultar_documentos",
  "buscar_imoveis",
  "responder_lead",
  "agendar_reuniao",
] as const;

function lf(text: string) {
  return text.replace(/\r\n/g, "\n");
}

function sha256(text: string) {
  return createHash("sha256").update(lf(text)).digest("hex");
}

/** Id do modelo do nó `lmChatOpenAi` do agente: o snapshot datado. */
export function extractModelId(principalSource: string): string {
  const at = principalSource.indexOf("@n8n/n8n-nodes-langchain.lmChatOpenAi");
  const match = principalSource.slice(at).match(/value:\s*"([^"]+)"/);
  if (at < 0 || !match) throw new Error("Modelo do agente não encontrado em principal.ts.");
  return match[1];
}

/** Janela de memória do agente (`contextWindowLength` da memória Postgres). */
export function extractMemoryWindow(principalSource: string): number {
  const at = principalSource.indexOf("@n8n/n8n-nodes-langchain.memoryPostgresChat");
  const match = principalSource.slice(at).match(/contextWindowLength:\s*(\d+)/);
  if (at < 0 || !match) throw new Error("Janela de memória do agente não encontrada em principal.ts.");
  return Number(match[1]);
}

/**
 * Catálogo de tools como o modelo o enxerga: nome e descrição de cada tool, e
 * os parâmetros `$fromAI` do bloco dela. Mudar qualquer um muda o hash.
 */
export function extractToolCatalog(principalSource: string): string {
  return AGENT_TOOL_NAMES.map((name) => {
    const at = principalSource.indexOf(`name: "${name}"`);
    if (at < 0) throw new Error(`Tool ${name} não encontrada em principal.ts.`);
    const end = principalSource.indexOf("\n});", at);
    const block = principalSource.slice(at, end < 0 ? undefined : end);
    const description = block.match(/(?:toolDescription|description):\s*((?:\s*"(?:[^"\\]|\\.)*"\s*\+?)+)/)?.[1] ?? "";
    const params = [...block.matchAll(/(?:\$fromAI|fromAi)\(\s*['"]([^'"]+)['"]\s*,\s*['"]((?:[^'"\\]|\\.)*)['"]/g)]
      .map((match) => `${match[1]}=${match[2]}`)
      .join("|");
    return `${name}\n${description.trim()}\n${params}`;
  }).join("\n---\n");
}

export function deriveBenchmarkIdentity(input: {
  principalSource: string;
  /** Módulos que compõem o system message, na ordem do inline. */
  systemMessageSources: string[];
  /** `activeVersionId` do workflow publicado no n8n. */
  workflowVersion: string;
}): BenchmarkIdentity {
  // O checkout no Windows pode trazer CRLF: a identidade é do conteúdo.
  const principalSource = lf(input.principalSource);
  return {
    modelId: extractModelId(principalSource),
    workflowVersion: input.workflowVersion,
    systemMessageHash: sha256(input.systemMessageSources.join("\n")),
    toolsHash: sha256(extractToolCatalog(principalSource)),
    memoryWindow: extractMemoryWindow(principalSource),
  };
}
