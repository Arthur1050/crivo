import "server-only";
import type { RevalidationRequest } from "../../lib/storefront-contract";

/**
 * Aviso de revalidação da vitrine pública (lote-16a — VREV-01, AD-042).
 *
 * Depois de toda escrita que muda o que a vitrine mostra, o CRM avisa a vitrine
 * por `POST <VITRINE_PUBLIC_URL>/api/revalidar` com segredo compartilhado e o
 * slug no corpo. O aviso é melhor-esforço: tem timeout de 3 s, NÃO é repetido e
 * NUNCA lança nem falha a ação do gestor — falha vira um log `warn`. O cache da
 * vitrine expira sozinho em 5 min, que é o pior caso quando o aviso falha. Só o
 * slug, o status e o nome do erro vão para o log: nunca o segredo.
 */

export const REVALIDATION_TIMEOUT_MS = 3000;

export type RevalidationOutcome = "enviado" | "ignorado" | "falhou";

export interface RevalidationLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

export interface RevalidationDeps {
  fetch?: typeof fetch;
  config?: { VITRINE_PUBLIC_URL?: string; VITRINE_REVALIDATE_SECRET?: string };
  logger?: RevalidationLogger;
}

function safeLog(log: (message: string) => void, message: string): void {
  try {
    log(message);
  } catch {
    // O aviso nunca pode falhar a ação por causa do log.
  }
}

export async function requestStorefrontRevalidation(
  slug: string,
  deps: RevalidationDeps = {}
): Promise<RevalidationOutcome> {
  const logger = deps.logger ?? {
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
  };
  try {
    const config = deps.config ?? process.env;
    const baseUrl = (config.VITRINE_PUBLIC_URL ?? "").trim();
    const secret = (config.VITRINE_REVALIDATE_SECRET ?? "").trim();
    if (baseUrl === "" || secret === "") {
      safeLog(logger.info, `[vitrine] revalidação ignorada: slug=${slug} (vitrine não configurada)`);
      return "ignorado";
    }

    const body: RevalidationRequest = { slug };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const error = new Error("timeout");
        error.name = "TimeoutError";
        reject(error);
      }, REVALIDATION_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        (deps.fetch ?? fetch)(`${baseUrl.replace(/\/+$/, "")}/api/revalidar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timedOut,
      ]);
      if (response.status < 200 || response.status > 299) {
        safeLog(logger.warn, `[vitrine] revalidação falhou: slug=${slug} status=${response.status}`);
        return "falhou";
      }
      return "enviado";
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    safeLog(logger.warn, `[vitrine] revalidação falhou: slug=${slug} erro=${name}`);
    return "falhou";
  }
}
