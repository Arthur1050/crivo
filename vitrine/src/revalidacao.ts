import { createHash, timingSafeEqual } from "node:crypto";
import type { CorpoRevalidacao } from "./contrato";
import { slugValido } from "./lib/catalogo";

/**
 * Verificação do `POST /api/revalidar` (lote-16b — VCACHE-02; AD-042). Pura: a
 * rota (T12) só liga estas funções ao `revalidateTag`.
 */

function sha256(texto: string): Buffer {
  return createHash("sha256").update(texto).digest();
}

/**
 * `Authorization: Bearer <segredo>` igual a `VITRINE_REVALIDATE_SECRET`, em
 * tempo constante (VCACHE AC7): os dois lados passam por SHA-256, então os
 * buffers têm sempre o mesmo tamanho e o tamanho do segredo não vaza.
 * Segredo configurado vazio ou só espaços nunca autoriza (AC4).
 */
export function verificarSegredo(
  cabecalho: string | null | undefined,
  segredo: string | undefined
): boolean {
  if (!segredo || segredo.trim() === "") return false;
  if (!cabecalho) return false;
  const partes = /^bearer\s+(\S.*)$/i.exec(cabecalho.trim());
  if (!partes) return false;
  return timingSafeEqual(sha256(partes[1].trim()), sha256(segredo));
}

export type LeituraDoCorpo =
  | { ok: true; corpo: CorpoRevalidacao }
  | { ok: false; motivo: "nao-json" | "sem-slug" | "slug-invalido" };

/** Corpo `{"slug": "<slug válido>"}` (VCACHE AC5); qualquer outra coisa é recusada. */
export function lerCorpo(texto: string): LeituraDoCorpo {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "nao-json" };
  }
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return { ok: false, motivo: "sem-slug" };
  }
  const slug = (valor as Record<string, unknown>).slug;
  if (typeof slug !== "string") return { ok: false, motivo: "sem-slug" };
  if (!slugValido(slug)) return { ok: false, motivo: "slug-invalido" };
  return { ok: true, corpo: { slug } };
}
