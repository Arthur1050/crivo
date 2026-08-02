"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Selector } from "@astryxdesign/core/Selector";
import { useTenantStore } from "@/src/stores/tenant-store";
import type { Tenant } from "@/src/server/data";

interface TenantSwitcherProps {
  tenants: Tenant[];
  activeTenantId: string;
  // Recebida como prop (não importada de "@/src/server/tenant" aqui): esse
  // módulo também exporta getActiveTenantId, que puxa a DAL/driver `pg` — se
  // importado direto num Client Component, o bundler inclui o módulo inteiro
  // no bundle do client. Passar a server action já resolvida pelo Server
  // Component pai (layout) é o padrão suportado pelo Next para esse caso.
  onTenantChange: (tenantId: string) => Promise<void>;
}

/**
 * Seletor de tenant no header do shell. O cookie `crivo_tenant` (via server
 * action `setActiveTenant`) é a fonte de verdade; esta store Zustand apenas
 * espelha o tenant ativo para a UI (design.md — Tech Decisions).
 */
export function TenantSwitcher({
  tenants,
  activeTenantId,
  onTenantChange,
}: TenantSwitcherProps) {
  const router = useRouter();
  const setTenant = useTenantStore((state) => state.setTenant);
  const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId);

  // Inicializa/atualiza o espelho client sempre que o server informar um
  // tenant ativo diferente (primeira renderização ou troca vinda de outra aba).
  useEffect(() => {
    if (activeTenant) {
      setTenant(activeTenant.id, activeTenant.name);
    }
  }, [activeTenant, setTenant]);

  async function handleChange(tenantId: string) {
    await onTenantChange(tenantId);

    const tenant = tenants.find((candidate) => candidate.id === tenantId);
    if (tenant) {
      setTenant(tenant.id, tenant.name);
    }

    router.refresh();
  }

  return (
    <Selector
      label="Imobiliária ativa"
      isLabelHidden
      placeholder="Selecione uma imobiliária"
      value={activeTenantId}
      onChange={handleChange}
      options={tenants.map((tenant) => ({
        value: tenant.id,
        label: tenant.name,
      }))}
    />
  );
}
