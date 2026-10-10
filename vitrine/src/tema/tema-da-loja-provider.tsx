"use client";

import { Theme } from "@astryxdesign/core/theme";
import { useMemo } from "react";
import type { Fonte } from "../contrato";
import { cssDoTema, temaDaLoja } from "./tema-da-loja";

interface Props {
  slug: string;
  cor: string | null;
  fonte: Fonte;
  children: React.ReactNode;
}

/**
 * Tema da loja no HTML da primeira resposta (VTEMA AC3 e AC7; AD-046).
 *
 * O `<Theme>` injeta os tokens num `<style>` em `useInsertionEffect`, que não
 * roda no servidor; sem os dois `<style>` abaixo a primeira resposta sairia
 * com a cor e a fonte padrão e a loja "piscaria" na hidratação. O CSS é o que
 * a própria Astryx gera, nas camadas que ela usa; o runtime do `<Theme>`
 * injeta o mesmo conteúdo no `<head>` depois da hidratação (duplicata inerte).
 */
export function TemaDaLoja({ slug, cor, fonte, children }: Props) {
  const { tema, css } = useMemo(() => {
    const definido = temaDaLoja({ slug, cor, fonte });
    return { tema: definido, css: cssDoTema(definido) };
  }, [slug, cor, fonte]);

  return (
    <Theme theme={tema} mode="light">
      {css.reset ? <style>{css.reset}</style> : null}
      {css.tema ? <style>{css.tema}</style> : null}
      {children}
    </Theme>
  );
}
