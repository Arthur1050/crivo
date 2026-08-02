/**
 * Concatena nomes de classe condicionais, ignorando valores falsy. Usado
 * pelos componentes de ícone Lucide-Animated vendorizados via shadcn CLI em
 * `src/components/icons/` (lote-3 — AD-008/ICON-01), que importam `cn` de
 * `@/src/lib/utils` (alias configurado em `components.json`). Implementação
 * mínima: os ícones só passam uma única `className` opcional adiante, sem
 * merge de classes Tailwind conflitantes — não há necessidade de puxar
 * `clsx`/`tailwind-merge` só para isso.
 */
export function cn(
  ...inputs: (string | undefined | null | false)[]
): string {
  return inputs.filter(Boolean).join(" ");
}
