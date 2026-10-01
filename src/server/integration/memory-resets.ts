import "server-only";
import { listMemoryResets } from "../data";

/** Pedido de reconstrução da memória, como o n8n o lê (lote-14 — CONTRATO-01). */
export interface SerializedMemoryReset {
  leadId: string;
  waId: string;
  requestedAt: string;
}

/**
 * Pedidos do tenant a partir de `since`. Serviço fino sobre a DAL (mesmo
 * padrão de `messages.ts`): datas em ISO-8601, nada além do que o n8n precisa
 * para localizar a sessão (`tenantSlug:waId`).
 */
export async function findMemoryResets(
  tenantId: string,
  since: Date
): Promise<SerializedMemoryReset[]> {
  const resets = await listMemoryResets(tenantId, since);
  return resets.map((reset) => ({
    leadId: reset.leadId,
    waId: reset.waId,
    requestedAt: reset.requestedAt.toISOString(),
  }));
}
