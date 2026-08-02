"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkProvider } from "@astryxdesign/core/Link";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Chats", href: "/chats" },
  { label: "Documentos", href: "/documentos" },
  { label: "Configurações", href: "/configuracoes" },
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
            />
          ))}
        </SideNavSection>
      </SideNav>
    </LinkProvider>
  );
}
