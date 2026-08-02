"use client";

import type { ComponentProps } from "react";
import NextLink from "next/link";
import { Link } from "@astryxdesign/core/Link";

type NavLinkProps = Omit<ComponentProps<typeof Link>, "as">;

/**
 * `Link` do Astryx pré-conectado ao `next/link` para navegação client-side.
 * Existe porque `Link` é um Client Component: passar `as={NextLink}`
 * diretamente de um Server Component (ex.: as páginas RSC de
 * Configurações/Documentos) tenta serializar uma referência de função pela
 * fronteira server→client e quebra em produção ("Functions cannot be passed
 * directly to Client Components"). Compondo aqui dentro, a fronteira já foi
 * cruzada com props serializáveis (href, children) antes desse wrapper
 * aplicar `as`.
 */
export function NavLink(props: NavLinkProps) {
  return <Link as={NextLink} {...props} />;
}
