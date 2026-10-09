import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { tenants, tenantStorefronts } from "../../db/schema";
import type { StorefrontValue } from "../../lib/storefront";

/**
 * Acesso a dados da vitrine pública (lote-16a — VCFG-01, VCFG-02, VATIV-01).
 *
 * A chave da tabela é o próprio `tenant_id`: toda leitura e escrita é por
 * tenant, e o tenant vem do chamador (sempre `getActiveTenantId()` na server
 * action, nunca do payload — AD-002).
 */

/** Configuração lida do banco; `updatedAt` nulo = a imobiliária nunca salvou a vitrine. */
export interface Storefront extends StorefrontValue {
  tenantId: string;
  updatedAt: Date | null;
}

export type SaveStorefrontResult =
  | { ok: true; storefront: Storefront }
  | { ok: false; reason: "identidade-incompleta" };

function defaults(tenantId: string): Storefront {
  return {
    tenantId,
    active: false,
    layout: "grade",
    accentColor: null,
    font: "inter",
    creci: null,
    legalName: null,
    headline: null,
    about: null,
    instagram: null,
    phone: null,
    address: null,
    updatedAt: null,
  };
}

function isBlank(value: string | null): boolean {
  return (value ?? "").trim() === "";
}

/**
 * Lê a vitrine do tenant. Sem linha, devolve a vitrine inativa com os valores
 * padrão e NÃO cria linha (VCFG-01 AC4): imobiliárias existentes não precisam
 * de migração de dado.
 */
export async function getStorefront(tenantId: string): Promise<Storefront> {
  const [row] = await db
    .select()
    .from(tenantStorefronts)
    .where(eq(tenantStorefronts.tenantId, tenantId));
  return row ? row : defaults(tenantId);
}

/**
 * Grava a configuração do tenant num único upsert (`updated_at` renovado a cada
 * gravação), então uma falha nunca deixa metade da configuração gravada
 * (VCFG-01 AC11). Vitrine ativa sem CRECI ou razão social é recusada antes de
 * tocar o banco (VATIV-01 AC5); o check da tabela é a segunda trava.
 */
export async function saveStorefront(
  tenantId: string,
  value: StorefrontValue
): Promise<SaveStorefrontResult> {
  if (value.active && (isBlank(value.creci) || isBlank(value.legalName))) {
    return { ok: false, reason: "identidade-incompleta" };
  }
  const [row] = await db
    .insert(tenantStorefronts)
    .values({ tenantId, ...value })
    .onConflictDoUpdate({
      target: tenantStorefronts.tenantId,
      set: { ...value, updatedAt: sql`now()` },
    })
    .returning();
  return { ok: true, storefront: row };
}

/** Slug da imobiliária, ou `null` se o tenant não existe (alvo do aviso de revalidação). */
export async function getTenantSlug(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row?.slug ?? null;
}
