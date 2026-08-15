"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLineIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HomeIcon,
  MessageCircleIcon,
  SettingsIcon,
} from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Card } from "@astryxdesign/core/Card";
import { Item } from "@astryxdesign/core/Item";
import { LinkProvider } from "@astryxdesign/core/Link";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  TenantSwitcherMenu,
  type TenantOption,
} from "@/src/components/shell/tenant-switcher";
import { formatAgentActivitySubtitle } from "@/src/lib/agent-activity";
import { formatTenantLocation } from "@/src/lib/tenant-identity";
import { useTenantStore } from "@/src/stores/tenant-store";

// Ícones Lucide-Animated (lote-3 — ICON-01/AD-008): único componente por
// rota, reaproveitado para os estados selecionado e não-selecionado (a
// lucide-animated não distingue variante outline/filled — a cor do texto do
// próprio SideNavItem já diferencia o estado selecionado).
const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: ChartLineIcon },
  { label: "Pipeline", href: "/pipeline", icon: FolderKanbanIcon },
  { label: "Chats", href: "/chats", icon: MessageCircleIcon },
  { label: "Documentos", href: "/documentos", icon: FileTextIcon },
  { label: "Configurações", href: "/configuracoes", icon: SettingsIcon },
] as const;

export interface SidebarActiveTenant {
  id: string;
  name: string;
  agentName: string;
  city: string | null;
  state: string | null;
}

export interface SidebarManager {
  name: string;
  email: string;
}

interface SidebarProps {
  tenants: TenantOption[];
  activeTenant: SidebarActiveTenant;
  manager: SidebarManager;
  onTenantChange: (tenantId: string) => Promise<void>;
  /**
   * Instante da última mensagem `sender = 'agente'` do tenant ativo (lote-7
   * — SHELL-01), já resolvido pela DAL (`getLastAgentMessageAt`) e
   * serializado como ISO string na fronteira RSC → client (AD-007). `null`
   * quando o tenant nunca recebeu mensagem do agente.
   */
  lastAgentMessageAt: string | null;
}

/**
 * Shell de navegação do CRM (redesign-crm-astryx — RD-01, design.md § R0):
 * SideNav-only, sem TopNav — a identidade do tenant mora toda no header de
 * marca, que também é o gatilho do seletor de tenant. `LinkProvider` roteia
 * os `href` do SideNav pelo `next/link` para navegação client-side em vez de
 * full page reload.
 */
export function Sidebar({
  tenants,
  activeTenant,
  manager,
  onTenantChange,
  lastAgentMessageAt,
}: SidebarProps) {
  const pathname = usePathname();
  const setTenant = useTenantStore((state) => state.setTenant);
  const location = formatTenantLocation(activeTenant.city, activeTenant.state);
  // `new Date()` só é lido aqui, na borda de apresentação — a decisão do
  // texto (relativo × ocioso) é a função pura testada isoladamente em
  // src/lib/__tests__/agent-activity.test.ts.
  const agentSubtitle = formatAgentActivitySubtitle(lastAgentMessageAt, new Date());

  // Espelho client-side do tenant ativo (AD-007). Fica aqui, e não no menu:
  // o conteúdo do popover só monta quando aberto, mas a sidebar está sempre
  // montada, então o espelho acompanha qualquer troca vinda do servidor.
  useEffect(() => {
    setTenant(activeTenant.id, activeTenant.name);
  }, [activeTenant.id, activeTenant.name, setTenant]);

  return (
    <LinkProvider component={Link}>
      <SideNav
        header={
          <SideNavHeading
            icon={<NavIcon icon={<HomeIcon size={16} />} />}
            heading={activeTenant.name}
            subheading={location ?? undefined}
            className="mx-2 mt-2"
            menu={
              <TenantSwitcherMenu
                tenants={tenants}
                activeTenantId={activeTenant.id}
                onTenantChange={onTenantChange}
              />
            }
          />
        }
        footer={
          <Item
            density="compact"
            startContent={<Avatar name={manager.name} size="sm" />}
            label={manager.name}
            description={manager.email}
          />
        }
      >
        <SideNavSection title="Menu">
          {NAV_ITEMS.map((item) => (
            <SideNavItem
              key={item.href}
              label={item.label}
              href={item.href}
              isSelected={pathname === item.href}
              icon={<item.icon size={16} />}
            />
          ))}
        </SideNavSection>

        <SideNavSection title="Agente IA">
          <Card variant="gray" padding={2}>
            <Item
              density="compact"
              align="start"
              startContent={
                <StatusDot variant="success" label="Agente online" className="mt-1.5" isPulsing={true} />
              }
              label={`${activeTenant.agentName} — Online`}
              description={agentSubtitle}
            />
          </Card>
        </SideNavSection>
      </SideNav>
    </LinkProvider>
  );
}
