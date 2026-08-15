import "server-only";
import { createHash } from "node:crypto";
import {
  resolveServiceApiKeyHash,
  resolveTenantIdByApiKeyHash,
  resolveTenantIdBySlug,
} from "../data";
import { problem } from "./problem";

export interface AuthResult {
  tenantId: string;
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Resolve o tenant a partir do header `Authorization: Bearer <chave>`
 * (design.md — `src/server/integration/auth.ts`, INT-01/SEC-01). Nunca lê o
 * corpo da requisição — `tenant_id` em qualquer payload é estruturalmente
 * inalcançável a partir daqui, por construção (a única fonte de tenant é a
 * chave ou o header `X-Crivo-Tenant`, nunca o payload). Retorna a `Response`
 * 401 já pronta em qualquer falha, para o handler apenas repassar
 * (`if (auth instanceof Response) return auth;`).
 *
 * Dois modos, nesta ordem (lote-7 — SEC-01, design.md — Auth de serviço):
 * 1. **Chave de serviço** (`service_api_keys`, cross-tenant): exige o header
 *    `X-Crivo-Tenant` com um slug conhecido; ausente ou desconhecido nunca
 *    cai em nenhum tenant default — sempre `401 tenant-nao-identificado`.
 * 2. **Chave de tenant** (`tenant_api_keys`, caminho original do lote-5):
 *    inalterado — o tenant vem só da chave, `X-Crivo-Tenant` é ignorado
 *    mesmo se presente e divergente.
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

  const serviceKeyId = await resolveServiceApiKeyHash(keyHash);
  if (serviceKeyId) {
    const slug = request.headers.get("x-crivo-tenant")?.trim();
    if (!slug) {
      return problem(
        401,
        "tenant-nao-identificado",
        "Chave de serviço exige o header X-Crivo-Tenant."
      );
    }

    const tenantId = await resolveTenantIdBySlug(slug);
    if (!tenantId) {
      return problem(
        401,
        "tenant-nao-identificado",
        "X-Crivo-Tenant não corresponde a nenhum tenant conhecido."
      );
    }

    return { tenantId };
  }

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
