import { cookies } from "next/headers";
import { getTenants, type Tenant } from "./data";

export const TENANT_COOKIE_NAME = "crivo_tenant";

/**
 * Resolve o tenant ativo a partir do valor do cookie e da lista de tenants
 * disponíveis. Função pura (sem I/O): se o cookie aponta para um tenant
 * válido/presente na lista, retorna esse tenant; caso contrário (cookie
 * ausente ou apontando para um tenant inexistente — ex.: seed recriado),
 * retorna o primeiro tenant da lista (design.md — Error Handling Strategy).
 */
export function resolveActiveTenant(
  cookieValue: string | undefined,
  tenants: Tenant[]
): Tenant | undefined {
  return tenants.find((tenant) => tenant.id === cookieValue) ?? tenants[0];
}

/**
 * Lê o cookie `crivo_tenant` (Next 16 — `cookies()` é assíncrono) e resolve
 * o tenant ativo contra a lista real de tenants do banco.
 */
export async function getActiveTenantId(): Promise<string> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(TENANT_COOKIE_NAME)?.value;
  const tenants = await getTenants();
  const tenant = resolveActiveTenant(cookieValue, tenants);

  if (!tenant) {
    throw new Error(
      "Nenhum tenant encontrado no banco. Rode `npm run db:seed` antes de iniciar o app."
    );
  }

  return tenant.id;
}

/**
 * Server action: troca o tenant ativo. Valida que `tenantId` existe antes de
 * gravar o cookie — nunca grava um tenant inválido silenciosamente.
 */
export async function setActiveTenant(tenantId: string): Promise<void> {
  "use server";

  const tenants = await getTenants();
  const exists = tenants.some((tenant) => tenant.id === tenantId);

  if (!exists) {
    throw new Error(`Tenant inexistente: ${tenantId}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE_NAME, tenantId);
}
