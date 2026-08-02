"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkProvider } from "@astryxdesign/core/Link";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { ChartLineIcon } from "@/src/components/icons/chart-line";
import { FileTextIcon } from "@/src/components/icons/file-text";
import { FolderKanbanIcon } from "@/src/components/icons/folder-kanban";
import { MessageCircleIcon } from "@/src/components/icons/message-circle";
import { SettingsIcon } from "@/src/components/icons/settings";

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

/**
 * Navegação lateral do shell (design.md — App shell + rotas placeholder).
 * `LinkProvider` roteia os `href` do SideNav pelo `next/link` para navegação
 * client-side em vez de full page reload.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <LinkProvider component={Link}>
      <SideNav>
        <SideNavSection title="Navegação" isHeaderHidden>
          {NAV_ITEMS.map((item) => (
            <SideNavItem
              key={item.href}
              label={item.label}
              href={item.href}
              isSelected={pathname === item.href}
              icon={<item.icon size={20} />}
            />
          ))}
        </SideNavSection>
      </SideNav>
    </LinkProvider>
  );
}
