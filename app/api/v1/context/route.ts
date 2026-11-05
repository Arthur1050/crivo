import { PROBLEM_CODE } from "../../../../src/lib/vocabulary";
import { Buffer } from "node:buffer";
import { DocumentContextBudgetExceeded, getDirectDocumentContext } from "../../../../src/server/integration/context";
import {
  MAX_BODY_BYTES,
  parseContextQuery,
} from "../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../src/kit/integration";
import { withIntegrationRoute } from "../../../../src/kit/integration";

/** O corpus é sempre fresco e nunca pode ficar em cache intermediário. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `POST /api/v1/context` — corpus documental direto do tenant (DOCCTX-01,
 * DOCPROVA-01). Passou a POST porque a pergunta real do lead é dado pessoal:
 * em query string ela acabaria em log de acesso, histórico e referer. O corpo
 * carrega `{modality, question}`; o tenant continua vindo exclusivamente da
 * credencial de serviço resolvida por `withIntegrationRoute`, nunca do modelo
 * nem do corpo (AC12).
 *
 * Handler fino: o wrapper já autenticou e já agenda o registro de qualquer
 * recusa — e esse registro grava só `pathname`, método, status e `code`, então
 * a pergunta não chega ao banco de recusas. A resposta também não a ecoa.
 */
export const POST = withIntegrationRoute(async (request, auth) => {
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return problem(
      413,
      PROBLEM_CODE.body_too_large,
      `Corpo da requisição excede o limite de ${MAX_BODY_BYTES} bytes.`
    );
  }

  let json: unknown;
  try {
    json = bodyText.trim() === "" ? {} : JSON.parse(bodyText);
  } catch {
    return problem(400, PROBLEM_CODE.invalid_payload, "Corpo da requisição não é JSON válido.");
  }

  const parsed = parseContextQuery(json);
  if (!parsed.ok) {
    return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);
  }

  try {
    const envelope = await getDirectDocumentContext(auth.tenantId, parsed.dto);
    return Response.json(envelope, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DocumentContextBudgetExceeded) return problem(400, PROBLEM_CODE.invalid_payload, "Contexto documental excede o orçamento disponível após a reserva proativa.");
    return problem(503, PROBLEM_CODE.service_unavailable, "Leitura documental temporariamente indisponível.");
  }
});

/**
 * O GET legado (`?modality=`, shape com `content: null`) foi o caminho de
 * rollback enquanto o agente publicado migrava para o POST. Removido no
 * lote-12 (T36) depois da prova conversacional: responde 405 como qualquer
 * verbo sem suporte, sem nenhum fallback para o contrato antigo.
 */
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
