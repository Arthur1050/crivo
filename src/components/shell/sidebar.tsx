"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  CalendarClockIcon,
  ChartLineIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HomeIcon,
  MessageCircleIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
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
  WorkWindowDialog,
  type WorkWindowTarget,
} from "@/src/components/shared/work-window-dialog";
import {
  TenantSwitcherMenu,
  type TenantOption,
} from "@/src/components/shell/tenant-switcher";
import { formatAgentActivitySubtitle } from "@/src/lib/agent-activity";
import { can, type Resource, type Role } from "@/src/lib/permissions";
import { formatTenantLocation } from "@/src/lib/tenant-identity";
import { useTenantStore } from "@/src/stores/tenant-store";

// Ícones Lucide-Animated (lote-3 — ICON-01/AD-008): único componente por
// rota, reaproveitado para os estados selecionado e não-selecionado (a
// lucide-animated não distingue variante outline/filled — a cor do texto do
// próprio SideNavItem já diferencia o estado selecionado).
//
// `resource` liga cada item da navegação à matriz de permissões (lote-8 —
// PERM-01 AC7): o item só aparece quando o vínculo ativo pode LER aquele
// recurso. Ocultar é cosmético — a recusa de verdade é server-side (AC5) e
// não depende deste filtro.
interface NavItem {
  label: string;
  href: string;
  icon: typeof HomeIcon;
  resource: Resource;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: ChartLineIcon, resource: "dashboard" },
  { label: "Pipeline", href: "/pipeline", icon: FolderKanbanIcon, resource: "pipeline" },
  { label: "Chats", href: "/chats", icon: MessageCircleIcon, resource: "chats" },
  { label: "Documentos", href: "/documentos", icon: FileTextIcon, resource: "documentos" },
  // lote-11 (T19): `imoveis` já concede `ler` a corretor na matriz de
  // permissões — nenhuma lógica de visibilidade nova, `visibleItems` abaixo
  // filtra igual aos demais itens.
  { label: "Imóveis", href: "/imoveis", icon: Building2Icon, resource: "imoveis" },
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: SettingsIcon,
    resource: "configuracoes",
  },
  // lote-8 (T22): `usuarios` só é legível pelo administrador na matriz de
  // permissões, então o filtro abaixo já esconde este item de gestor e
  // corretor — sem nenhuma condição especial aqui.
  { label: "Usuários", href: "/usuarios", icon: UsersIcon, resource: "usuarios" },
];

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

/**
 * Vínculo ATIVO do usuário autenticado, com a janela de trabalho que ele
 * declarou nesta imobiliária (AGENDA-01 AC1). Vem do servidor já serializado.
 */
export interface SidebarMembership {
  memberId: string;
  workDays: number[] | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
}

interface SidebarProps {
  tenants: TenantOption[];
  activeTenant: SidebarActiveTenant;
  manager: SidebarManager;
  /**
   * Vínculo do próprio usuário, para editar a PRÓPRIA janela de trabalho a
   * partir do rodapé da sidebar (AGENDA-01 AC1). Fica aqui, e não em
   * Configurações ou Usuários, porque as duas telas são vedadas ao corretor
   * pela matriz de permissões — ele nunca chegaria lá.
   */
  membership: SidebarMembership;
  onTenantChange: (tenantId: string) => Promise<void>;
  /**
   * Papéis do vínculo ATIVO (PERM-01 AC7). Decide quais itens da navegação
   * aparecem; a autorização de verdade continua no servidor (AC5).
   */
  roles: Role[];
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
  membership,
  onTenantChange,
  roles,
  lastAgentMessageAt,
}: SidebarProps) {
  const pathname = usePathname();
  const [workWindowTarget, setWorkWindowTarget] =
    useState<WorkWindowTarget | null>(null);
  const setTenant = useTenantStore((state) => state.setTenant);
  const location = formatTenantLocation(activeTenant.city, activeTenant.state);
  // `new Date()` só é lido aqui, na borda de apresentação — a decisão do
  // texto (relativo × ocioso) é a função pura testada isoladamente em
  // src/lib/__tests__/agent-activity.test.ts.
  const agentSubtitle = formatAgentActivitySubtitle(lastAgentMessageAt, new Date());

  // PERM-01 AC7: some da navegação o que o vínculo ativo não pode ler. Quem
  // só tem papel corretor perde Configurações; administrador e gestor veem
  // tudo o que existe hoje.
  const visibleItems = NAV_ITEMS.filter((item) => can(roles, item.resource, "ler"));

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
            // TENANT-01 AC2: com um vínculo só, nenhum seletor é apresentado.
            // Sem `menu`, o `SideNavHeading` não vira gatilho de popover — o
            // header de marca fica sendo só identidade, que é o que ele é
            // quando não há para onde trocar.
            menu={
              tenants.length > 1 ? (
                <TenantSwitcherMenu
                  tenants={tenants}
                  activeTenantId={activeTenant.id}
                  onTenantChange={onTenantChange}
                />
              ) : undefined
            }
          />
        }
        footer={
          <Item
            density="compact"
            startContent={<Avatar name={manager.name} size="sm" />}
            label={manager.name}
            description={manager.email}
            endContent={
              <Button
                label="Minha janela de trabalho"
                tooltip="Minha janela de trabalho"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<CalendarClockIcon size={16} />}
                onClick={() =>
                  setWorkWindowTarget({
                    memberId: membership.memberId,
                    name: manager.name,
                    email: manager.email,
                    workDays: membership.workDays,
                    workHoursStart: membership.workHoursStart,
                    workHoursEnd: membership.workHoursEnd,
                  })
                }
              />
            }
          />
        }
      >
        <SideNavSection title="Menu">
          {visibleItems.map((item) => (
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

      <WorkWindowDialog
        target={workWindowTarget}
        title="Minha janela de trabalho"
        onClose={() => setWorkWindowTarget(null)}
      />
    </LinkProvider>
  );
}
