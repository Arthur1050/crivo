import { headers } from "next/headers";
import { asc, eq, isNull, and } from "drizzle-orm";
import { db } from "../db";
import { tenant_members, tenants } from "../db/schema";
import { auth } from "./auth/config";
import { verifySession } from "./auth/session";
import { type Tenant } from "./data";

/**
 * Resolve o tenant ativo a partir de um identificador e da lista de tenants
 * disponíveis. Função pura (sem I/O): se o identificador aponta para um tenant
 * presente na lista, retorna esse tenant; caso contrário, retorna o primeiro da
 * lista (design.md — Error Handling Strategy).
 *
 * A lista de candidatos mudou de significado no lote-8 (AD-021, que emenda a
 * AD-007): antes eram TODOS os tenants do banco e o identificador vinha do
 * cookie `crivo_tenant`; agora são apenas os tenants VINCULADOS ao usuário
 * autenticado, e o identificador é o `activeOrganizationId` da sessão. A regra
 * de desempate é a mesma, e é literalmente a AC4 de TENANT-01: identificador
 * fora da lista é ignorado em vez de honrado.
 */
export function resolveActiveTenant(
  activeId: string | undefined | null,
  tenants: Tenant[]
): Tenant | undefined {
  return tenants.find((tenant) => tenant.id === activeId) ?? tenants[0];
}

/**
 * Imobiliárias VINCULADAS a um usuário, em ordem determinística de vínculo
 * (`createdAt`, depois `id`) — a mesma ordem que a guarda usa para escolher "o
 * primeiro vínculo" (spec.md — TENANT-01 AC3/AC4).
 *
 * É o que alimenta o seletor da sidebar: ele exibe exclusivamente estas, nunca
 * a lista completa do banco. Vínculo desativado não conta.
 */
export async function getLinkedTenants(userId: string): Promise<Tenant[]> {
  const rows = await db
    .select({ tenant: tenants })
    .from(tenant_members)
    .innerJoin(tenants, eq(tenants.id, tenant_members.organizationId))
    .where(
      and(
        eq(tenant_members.userId, userId),
        isNull(tenant_members.deactivatedAt)
      )
    )
    .orderBy(asc(tenant_members.createdAt), asc(tenant_members.id));

  return rows.map((row) => row.tenant);
}

/**
 * Imobiliária ativa do usuário autenticado.
 *
 * A assinatura é a mesma de antes do lote-8 para não obrigar as cinco páginas
 * e as três server actions a mudarem nesta task (isso é a T18) — mas a FONTE
 * mudou: era o cookie `crivo_tenant`, agora é o `activeOrganizationId` da
 * sessão, já validado contra os vínculos reais do usuário pela guarda
 * (AD-021, que emenda a AD-007). Sem sessão válida, `verifySession()`
 * redireciona antes de chegar aqui.
 */
export async function getActiveTenantId(): Promise<string> {
  const { tenantId } = await verifySession();
  return tenantId;
}

/**
 * Troca a imobiliária ativa da sessão (spec.md — TENANT-01 AC5).
 *
 * Recusa qualquer imobiliária que não seja um vínculo ATIVO do usuário
 * autenticado: sem essa checagem, o seletor voltaria a ser campo livre e a
 * exposição que o login fecha na porta entraria pela janela. A gravação em si
 * é do plugin (`setActiveOrganization`), que escreve `activeOrganizationId` na
 * sessão — o cookie `crivo_tenant` deixou de existir como fonte de verdade.
 */
export async function setActiveTenant(tenantId: string): Promise<void> {
  "use server";

  const { user } = await verifySession();
  const linked = await getLinkedTenants(user.id);

  if (!linked.some((tenant) => tenant.id === tenantId)) {
    throw new Error(`Imobiliária sem vínculo com o usuário: ${tenantId}`);
  }

  await auth.api.setActiveOrganization({
    body: { organizationId: tenantId },
    headers: await headers(),
  });
}
