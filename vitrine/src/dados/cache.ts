import { cacheLife, cacheTag } from "next/cache";
import { tagDaLoja } from "../contrato";
import { dbDaApp } from "../db/conexao";
import { imoveisDaLoja, imovelPorReferencia, lojaPorSlug } from "./consultas";

/**
 * Única camada que importa `next/cache` (AD-042). Toda leitura de uma loja
 * (loja, lista, item) usa o perfil `vitrine` (60/60/300 s) e a tag
 * `tenant:<slug>:catalogo`: revalidar a loja derruba as três. O slug e a
 * referência são argumentos, então fazem parte da chave do cache e cada loja
 * tem entradas próprias. `cacheLife` e `cacheTag` ficam dentro de cada função,
 * como a doc do Next pede.
 */

export async function lojaCacheada(slug: string) {
  "use cache";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  return lojaPorSlug(dbDaApp(), slug);
}

export async function imoveisCacheados(slug: string) {
  "use cache";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  return imoveisDaLoja(dbDaApp(), slug);
}

export async function imovelCacheado(slug: string, referencia: string) {
  "use cache";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  return imovelPorReferencia(dbDaApp(), slug, referencia);
}
