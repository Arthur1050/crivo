import type { ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { getTenants } from "@/src/server/data";
import { getActiveTenantId, setActiveTenant } from "@/src/server/tenant";
import { Sidebar } from "@/src/components/shell/sidebar";
import { TenantSwitcher } from "@/src/components/shell/tenant-switcher";

/**
 * Shell do CRM: sidebar com as 5 rotas + header com o seletor de tenant
 * (spec.md — App shell navegável com seletor de tenant, AC 3.1/3.2).
 */
export default async function CrmLayout({ children }: { children: ReactNode }) {
  const [tenants, activeTenantId] = await Promise.all([
    getTenants(),
    getActiveTenantId(),
  ]);

  return (
    <AppShell
      contentPadding={6}
      topNav={
        <TopNav
          heading={<TopNavHeading heading="Crivo" />}
          endContent={
            <TenantSwitcher
              tenants={tenants}
              activeTenantId={activeTenantId}
              onTenantChange={setActiveTenant}
            />
          }
        />
      }
      sideNav={<Sidebar />}
    >
      {children}
    </AppShell>
  );
}
