"use client";

import { useRouter } from "next/navigation";
import {
  NavHeadingMenu,
  NavHeadingMenuItem,
} from "@astryxdesign/core/NavMenu";
import { useTenantStore } from "@/src/stores/tenant-store";
import { formatTenantLocation } from "@/src/lib/tenant-identity";

export interface TenantOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface TenantSwitcherMenuProps {
  tenants: TenantOption[];
  activeTenantId: string;
  // Recebida como prop (não importada de "@/src/server/tenant" aqui): esse
  // módulo também exporta getActiveTenantId, que puxa a DAL/driver `pg` — se
  // importado direto num Client Component, o bundler inclui o módulo inteiro
  // no bundle do client. Passar a server action já resolvida pelo Server
  // Component pai (layout) é o padrão suportado pelo Next para esse caso.
  //
  // A action é `setActiveTenant`, que valida o vínculo NO SERVIDOR antes de
  // gravar: a validação nunca depende de a lista exibida aqui estar correta.
  onTenantChange: (tenantId: string) => Promise<void>;
}

/**
 * Seletor de imobiliária hospedado no header de marca da sidebar
 * (redesign-crm-astryx — RD-01 AC2): é o conteúdo do popover do
 * `SideNavHeading`, via `NavHeadingMenu`.
 *
 * Recomposto no lote-8 (TENANT-01, AD-021), não reescrito: mesma UI, mesmos
 * componentes. O que mudou é de onde vem a lista e o que a troca grava — as
 * imobiliárias são exclusivamente os VÍNCULOS do usuário autenticado, e a
 * troca grava o `activeOrganizationId` da sessão em vez do cookie
 * `crivo_tenant`, que deixou de ser fonte de verdade.
 *
 * Quem tem um vínculo só não vê seletor nenhum (AC2): o componente pai não
 * monta este menu, então não há popover a abrir.
 */
export function TenantSwitcherMenu({
  tenants,
  activeTenantId,
  onTenantChange,
}: TenantSwitcherMenuProps) {
  const router = useRouter();
  const setTenant = useTenantStore((state) => state.setTenant);

  async function handleSelect(tenantId: string) {
    if (tenantId === activeTenantId) return;

    await onTenantChange(tenantId);

    const tenant = tenants.find((candidate) => candidate.id === tenantId);
    if (tenant) {
      setTenant(tenant.id, tenant.name);
    }

    router.refresh();
  }

  return (
    <NavHeadingMenu size="lg">
      {tenants.map((tenant) => (
        <NavHeadingMenuItem
          key={tenant.id}
          label={tenant.name}
          description={
            formatTenantLocation(tenant.city, tenant.state) ?? undefined
          }
          onClick={() => void handleSelect(tenant.id)}
        />
      ))}
    </NavHeadingMenu>
  );
}
