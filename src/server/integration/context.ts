import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { documentCategories, documents } from "../../db/schema";
import type { CategoryColor, Modality } from "../data";

export type ContextModality = "novo" | "usado";

export interface ContextDocumentCategory {
  name: string;
  color: CategoryColor;
}

/** Documento de contexto do tenant (design.md — `src/server/integration/
 * context.ts`, INT-06). `content` é sempre `null` no v1 — mock-first
 * (AD-004): o shape já reserva o campo, a Fase 9 troca a fonte sem mudar o
 * contrato. */
export interface ContextDocument {
  id: string;
  name: string;
  modality: Modality;
  category: ContextDocumentCategory | null;
  content: null;
}

/**
 * Leitura de contexto do tenant por modalidade (design.md — INT-06):
 * documentos cuja modalidade é a pedida OU `ambos`, excluindo expirados
 * (`expiresAt IS NULL OR expiresAt > now()`) — mesmo que o job de TTL (T9)
 * ainda não tenha rodado, a leitura nunca devolve um documento vencido
 * (LGPD-02 AC2). Junta a categoria (nome + cor) quando existe; documentos
 * sem categoria entram com `category: null` (mesmo padrão de `getDocuments`
 * — leftJoin, nunca inner).
 */
export async function getContext(
  tenantId: string,
  modality: ContextModality
): Promise<ContextDocument[]> {
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      modality: documents.modality,
      categoryName: documentCategories.name,
      categoryColor: documentCategories.color,
    })
    .from(documents)
    .leftJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .where(
      and(
        eq(documents.tenantId, tenantId),
        or(eq(documents.modality, modality), eq(documents.modality, "ambos")),
        or(isNull(documents.expiresAt), gt(documents.expiresAt, new Date()))
      )
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    modality: row.modality,
    category:
      row.categoryName !== null && row.categoryColor !== null
        ? { name: row.categoryName, color: row.categoryColor }
        : null,
    content: null,
  }));
}
