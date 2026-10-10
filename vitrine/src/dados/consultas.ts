import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/conexao";
import { imoveis, lojas, type Imovel, type Loja } from "../db/views";

/**
 * Consultas da vitrine: puras, sem `next` e sem ler o ambiente (recebem o `db`).
 * Leem só `vitrine.lojas` e `vitrine.imoveis` (VSEG AC1) e filtram toda consulta
 * de imóvel pelo slug da loja pedida (VSEG AC2). O corte de visibilidade
 * (disponível e publicado, loja ativa) é da view, não daqui (AD-040).
 */

/** A loja visível do slug, ou `null` (inexistente, inativa ou sem CRECI/WhatsApp). */
export async function lojaPorSlug(db: Db, slug: string): Promise<Loja | null> {
  const linhas = await db.select().from(lojas).where(eq(lojas.slug, slug)).limit(1);
  return linhas[0] ?? null;
}

/** Imóveis visíveis da loja: destaque primeiro, depois mais recente, depois referência crescente (VCAT AC2). */
export async function imoveisDaLoja(db: Db, slug: string): Promise<Imovel[]> {
  return db
    .select()
    .from(imoveis)
    .where(eq(imoveis.lojaSlug, slug))
    .orderBy(desc(imoveis.destaque), desc(imoveis.atualizadoEm), asc(imoveis.referencia));
}

/** O imóvel visível da loja pela referência, sem distinção de caixa (`ap-0142` acha `AP-0142`). */
export async function imovelPorReferencia(
  db: Db,
  slug: string,
  referencia: string
): Promise<Imovel | null> {
  const linhas = await db
    .select()
    .from(imoveis)
    .where(
      and(
        eq(imoveis.lojaSlug, slug),
        sql`lower(${imoveis.referencia}) = ${referencia.toLowerCase()}`
      )
    )
    .limit(1);
  return linhas[0] ?? null;
}
