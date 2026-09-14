import { timingSafeEqual } from "node:crypto";
import { runDailyMaintenance } from "../../../../src/server/integration/lgpd";
import { problem } from "../../../../src/server/integration/problem";

/**
 * `/api/cron/expire-documents` — job de TTL de documentos (design.md —
 * LGPD-02) e, desde o lote-9 (SAUDE-03), também de purga de recusas de
 * integração vencidas — mesma execução diária, sem novo agendamento (AC2).
 * Fora de `/api/v1`: autenticação própria via `CRON_SECRET` (Bearer), nunca
 * a API key de tenant — não faz parte do contrato do agente com o n8n.
 * Agendado diariamente pelo Vercel Cron (`vercel.json`).
 *
 * SPEC_DEVIATION: design.md/tasks.md descreviam só `POST`. A documentação
 * oficial da Vercel (Managing Cron Jobs, consultada nesta task) confirma que
 * o Vercel Cron sempre invoca o path configurado via **GET** — nunca POST —
 * e injeta automaticamente `Authorization: Bearer $CRON_SECRET` nessa
 * chamada. Um handler só-POST nunca seria de fato acionado pelo cron real em
 * produção. Reason: os dois verbos ficam expostos com a mesma lógica — GET
 * para o disparo automático da Vercel, POST preservado para invocação manual
 * (curl/CI), como o contrato original previa.
 */
async function handleExpireDocuments(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const provided = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1]?.trim();

  if (!secret || !provided) {
    return problem(401, "nao-autenticado", "Secret do cron ausente ou inválido.");
  }

  const providedBuffer = Buffer.from(provided);
  const secretBuffer = Buffer.from(secret);

  const isInvalid = providedBuffer.length !== secretBuffer.length || !timingSafeEqual(providedBuffer, secretBuffer);

  if (isInvalid) {
    return problem(401, "nao-autenticado", "Secret do cron ausente ou inválido.");
  }

  const result = await runDailyMaintenance(new Date());
  return Response.json(result);
}

export const GET = handleExpireDocuments;
export const POST = handleExpireDocuments;
