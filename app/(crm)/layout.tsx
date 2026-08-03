import type { ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { getTenants } from "@/src/server/data";
import { getActiveTenantId, setActiveTenant } from "@/src/server/tenant";
import { Sidebar } from "@/src/components/shell/sidebar";
import { getMockManager } from "@/src/lib/mock-manager";

/**
 * Shell do CRM (redesign-crm-astryx — RD-01, design.md § R0): SideNav-only,
 * sem TopNav — a identidade do tenant (marca, cidade/UF, seletor, agente,
 * usuário) mora toda na sidebar, conforme a própria best practice da Astryx
 * ("Don't include a SideNavHeading when a TopNav is already providing app
 * identity").
 *
 * RSC-first (AD-007): o tenant ativo vem do cookie no servidor e o que
 * atravessa a fronteira para a `Sidebar` client é sempre SERIALIZÁVEL —
 * apenas strings, nunca a linha crua do tenant (que carrega `createdAt: Date`).
 */
export default async function CrmLayout({ children }: { children: ReactNode }) {
  const [tenants, activeTenantId] = await Promise.all([
    getTenants(),
    getActiveTenantId(),
  ]);

  const active = tenants.find((tenant) => tenant.id === activeTenantId);

  if (!active) {
    throw new Error(
      "Nenhum tenant encontrado no banco. Rode `npm run db:seed` antes de iniciar o app."
    );
  }

  return (
    <AppShell
      contentPadding={6}
      variant="wash"
      sideNav={
        <Sidebar
          tenants={tenants.map((tenant) => ({
            id: tenant.id,
            name: tenant.name,
            city: tenant.city,
            state: tenant.state,
          }))}
          activeTenant={{
            id: active.id,
            name: active.name,
            agentName: active.agentName,
            city: active.city,
            state: active.state,
          }}
          manager={getMockManager({ id: active.id, name: active.name })}
          onTenantChange={setActiveTenant}
        />
      }
    >
      {children}
    </AppShell>
  );
}
