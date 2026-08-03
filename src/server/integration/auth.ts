import "server-only";
import { createHash } from "node:crypto";
import { resolveTenantIdByApiKeyHash } from "../data";
import { problem } from "./problem";

export interface AuthResult {
  tenantId: string;
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Resolve o tenant a partir do header `Authorization: Bearer <chave>`
 * (design.md — `src/server/integration/auth.ts`, INT-01). Nunca lê o corpo
 * da requisição — `tenant_id` em qualquer payload é estruturalmente
 * inalcançável a partir daqui, por construção (a única fonte de tenant é a
 * chave). Retorna a `Response` 401 já pronta em qualquer falha, para o
 * handler apenas repassar (`if (auth instanceof Response) return auth;`).
 */
export async function authenticate(
  request: Request
): Promise<AuthResult | Response> {
  const header = request.headers.get("authorization");
  if (!header) {
    return problem(401, "nao-autenticado", "Header Authorization ausente.");
  }

  const match = BEARER_PATTERN.exec(header);
  const key = match?.[1]?.trim();
  if (!key) {
    return problem(
      401,
      "nao-autenticado",
      "Formato do header Authorization inválido. Use 'Bearer <chave>'."
    );
  }

  const keyHash = createHash("sha256").update(key).digest("hex");
  const tenantId = await resolveTenantIdByApiKeyHash(keyHash);
  if (!tenantId) {
    return problem(
      401,
      "nao-autenticado",
      "Chave de API inválida ou revogada."
    );
  }

  return { tenantId };
}
