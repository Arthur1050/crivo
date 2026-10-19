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
 * slug, o status e o nome do erro vão para o log: nunca o segredo nem a URL.
 *
 * Configuração (AD-049): `VITRINE_PUBLIC_URL` aceita host sem esquema
 * (`vitrine.exemplo.com` vira `https://vitrine.exemplo.com`), `https://` e
 * `http://`; outro esquema (`ftp:`, `javascript:`, `//host`), credencial na URL
 * ou valor que `new URL` recusa não envia nada e registra `erro=UrlInvalida`.
 * Caminho na base é mantido (`https://x/prefixo` → `https://x/prefixo/api/revalidar`);
 * query e fragmento são descartados. Segredo com caractere fora do ASCII
 * imprimível (0x21-0x7E) depois do `trim` não envia nada e registra
 * `erro=SegredoInvalido`. Antes, o `fetch` lançava `TypeError` sem dizer a causa
 * (R14 do L16c: a variável estava sem `https://`).
 */

export const REVALIDATION_TIMEOUT_MS = 3000;

const ESQUEMA_HTTP = /^https?:\/\//i;
/** `algo:` seguido de algo que não é porta (`localhost:3000` é host com porta). */
const OUTRO_ESQUEMA = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
const SEGREDO_VALIDO = /^[\x21-\x7E]+$/;

/**
 * Base pública da vitrine normalizada (`https://host[/caminho]`, sem `/` final,
 * sem query nem fragmento), ou nulo quando ausente ou inválida. Função pura,
 * usada pelo aviso de revalidação e pelo link "Abrir vitrine" de Configurações.
 */
export function normalizarBaseDaVitrine(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim();
  if (bruto === "") return null;
  let candidata: string;
  if (ESQUEMA_HTTP.test(bruto)) {
    candidata = bruto;
  } else if (bruto.startsWith("/") || bruto.startsWith("\\") || OUTRO_ESQUEMA.test(bruto)) {
    return null;
  } else {
    candidata = `https://${bruto}`;
  }
  let url: URL;
  try {
    url = new URL(candidata);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname === "" || url.username !== "" || url.password !== "") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

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
    const base = normalizarBaseDaVitrine(baseUrl);
    if (base === null) {
      safeLog(logger.warn, `[vitrine] revalidação falhou: slug=${slug} erro=UrlInvalida`);
      return "falhou";
    }
    if (!SEGREDO_VALIDO.test(secret)) {
      safeLog(logger.warn, `[vitrine] revalidação falhou: slug=${slug} erro=SegredoInvalido`);
      return "falhou";
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
        (deps.fetch ?? fetch)(`${base}/api/revalidar`, {
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
