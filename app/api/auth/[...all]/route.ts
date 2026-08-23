import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/src/server/auth/config";

/**
 * Handler catch-all do better-auth (spec.md — AUTH-01). Publica os endpoints
 * da biblioteca sob `/api/auth/**`: login, logout, sessão, convite e
 * redefinição de senha.
 *
 * Fica fora do `proxy.ts` de propósito (o matcher exclui `api` inteiro): este
 * handler não pode exigir a sessão que ele mesmo emite. É também um caminho
 * independente do contrato de integração `/api/v1/**`, que segue na credencial
 * de serviço com `X-Crivo-Tenant` (SEC-01 do lote-7; AD-021).
 */
export const { GET, POST } = toNextJsHandler(auth);
