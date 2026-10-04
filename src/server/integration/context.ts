import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { documentCategories, documents, tenantDocumentContextLimits } from "../../db/schema";
import {
  buildCanonicalContext,
  measureCanonicalContext,
  type ContextBudgetDocument,
  type DocumentContextEnvelope,
  type DocumentModality,
} from "../documents/context-budget";

export interface DirectContextQuery {
  modality: DocumentModality;
  /**
   * Pergunta real do lead. No lote 12 o modo `direct` entrega o corpus inteiro,
   * então ela não filtra nada (DOCCTX-01 AC8) — trafega para que o contrato já
   * seja o definitivo quando a recuperação semântica existir.
   */
  question: string;
  reservedContextBytes?: number;
}
export class DocumentContextBudgetExceeded extends Error {}

/**
 * Corpus direto do tenant (DOCCTX-01, DOCLIM-01). Só entra documento `pronto`,
 * ativo e dentro da validade: `processando`, `falha` e `fora_do_agente` ficam
 * de fora, e um documento que venceu antes da rotina diária some do contexto no
 * mesmo instante lógico, mesmo que registro e original ainda existam (AC6).
 *
 * A montagem do envelope é delegada a `buildCanonicalContext`, a mesma função
 * que a admissão de T12 usa para medir o teto. Isso é o que garante que o que
 * foi medido e o que é servido sejam byte a byte a mesma serialização — se as
 * duas divergissem, um corpus admitido poderia estourar o teto na entrega.
 */
export async function getDirectDocumentContext(
  tenantId: string,
  query: DirectContextQuery,
  now = new Date()
): Promise<DocumentContextEnvelope> {
  if (query.reservedContextBytes !== undefined && (!Number.isSafeInteger(query.reservedContextBytes) || query.reservedContextBytes < 0)) throw new DocumentContextBudgetExceeded();
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      modality: documents.modality,
      extractedText: documents.extractedText,
      uploadedAt: documents.uploadedAt,
      categoryName: documentCategories.name,
      categoryColor: documentCategories.color,
    })
    .from(documents)
    .leftJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .where(
      and(
        eq(documents.tenantId, tenantId),
        eq(documents.status, "pronto"),
        isNull(documents.deletedAt),
        or(isNull(documents.expiresAt), gt(documents.expiresAt, now)),
        sql`${documents.extractedText} is not null`
      )
    );

  const corpus: ContextBudgetDocument[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    modality: row.modality,
    content: row.extractedText!,
    uploadedAt: row.uploadedAt,
    status: "pronto",
    category:
      row.categoryName !== null && row.categoryColor !== null
        ? { name: row.categoryName, color: row.categoryColor }
        : null,
  }));

  const envelope = buildCanonicalContext(corpus, query.modality);
  if (query.reservedContextBytes !== undefined) {
    const [limit] = await db.select({ maxResponseBytes: tenantDocumentContextLimits.maxResponseBytes }).from(tenantDocumentContextLimits)
      .where(and(eq(tenantDocumentContextLimits.tenantId, tenantId), eq(tenantDocumentContextLimits.queryModality, query.modality)));
    const available = Math.max(0, (limit?.maxResponseBytes ?? 0) - query.reservedContextBytes);
    if (measureCanonicalContext(envelope) > available) throw new DocumentContextBudgetExceeded();
  }
  return envelope;
}
