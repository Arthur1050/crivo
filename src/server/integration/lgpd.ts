import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { documents, leads } from "../../db/schema";

export interface OptOutResult {
  optedOutAt: Date;
}

/**
 * Registra o opt-out de um lead (design.md — `src/server/integration/
 * lgpd.ts`, LGPD-01), idempotente: `SET opted_out_at = COALESCE(opted_out_at,
 * now())` preserva o timestamp original numa segunda chamada — nunca o
 * substitui por um "agora" mais recente. Retorna `null` quando nenhuma linha
 * corresponde a `tenantId` + `leadId` (lead inexistente ou de outro tenant —
 * 404 na rota).
 */
export async function optOutLead(
  tenantId: string,
  leadId: string
): Promise<OptOutResult | null> {
  const rows = await db
    .update(leads)
    .set({ optedOutAt: sql`coalesce(${leads.optedOutAt}, now())` })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .returning({ optedOutAt: leads.optedOutAt });

  const row = rows[0];
  if (!row) return null;
  // COALESCE(coluna, now()) nunca é null — now() sempre supre a ausência.
  return { optedOutAt: row.optedOutAt! };
}

export interface ExpireDocumentsResult {
  deletedByTenant: Record<string, number>;
  total: number;
}

/**
 * Deleta documentos expirados (design.md — LGPD-02): job de plataforma, sem
 * escopo de tenant único por definição — atravessa todos os tenants numa
 * chamada e reporta a contagem de deletados por tenant. `lte(expiresAt, now)`
 * já exclui documentos com `expiresAt IS NULL` por semântica de 3 valores do
 * SQL (`NULL <= x` nunca é verdadeiro), sem precisar de filtro extra.
 */
export async function expireDocuments(now: Date): Promise<ExpireDocumentsResult> {
  const deletedRows = await db
    .delete(documents)
    .where(lte(documents.expiresAt, now))
    .returning({ tenantId: documents.tenantId });

  const deletedByTenant: Record<string, number> = {};
  for (const row of deletedRows) {
    deletedByTenant[row.tenantId] = (deletedByTenant[row.tenantId] ?? 0) + 1;
  }
  return { deletedByTenant, total: deletedRows.length };
}
