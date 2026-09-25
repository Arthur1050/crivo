import { Buffer } from "node:buffer";
import { getDirectDocumentContext } from "../../../../src/server/integration/context";
import {
  MAX_BODY_BYTES,
  parseContextQuery,
} from "../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../src/server/integration/route";

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
      "corpo-grande-demais",
      `Corpo da requisição excede o limite de ${MAX_BODY_BYTES} bytes.`
    );
  }

  let json: unknown;
  try {
    json = bodyText.trim() === "" ? {} : JSON.parse(bodyText);
  } catch {
    return problem(400, "payload-invalido", "Corpo da requisição não é JSON válido.");
  }

  const parsed = parseContextQuery(json);
  if (!parsed.ok) {
    return problem(400, "payload-invalido", parsed.detail);
  }

  const envelope = await getDirectDocumentContext(auth.tenantId, parsed.dto);
  return Response.json(envelope, { headers: NO_STORE });
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
