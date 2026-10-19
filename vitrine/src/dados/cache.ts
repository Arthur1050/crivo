import { cacheLife, cacheTag } from "next/cache";
import { tagDaLoja } from "../contrato";
import { dbDaApp } from "../db/conexao";
import { imoveisDaLoja, imovelPorReferencia, lojaPorSlug } from "./consultas";
import { lerDoBanco } from "./erro-de-leitura";

/**
 * Única camada que importa `next/cache` (AD-042). Toda leitura de uma loja
 * (loja, lista, item) usa o perfil `vitrine` (60/60/300 s) e a tag
 * `tenant:<slug>:catalogo`: revalidar a loja derruba as três. O slug e a
 * referência são argumentos, então fazem parte da chave do cache e cada loja
 * tem entradas próprias. `cacheLife` e `cacheTag` ficam dentro de cada função,
 * como a doc do Next pede.
 *
 * `use cache: remote`, e não `use cache` (AD-048): as leituras acontecem no
 * pedido (dependem do `params`), e o `use cache` comum guarda em memória da
 * instância, que no serverless da Vercel não sobrevive entre invocações (cada
 * visita consultava o banco, R15 do L16c). O `remote` usa o cache que a
 * plataforma injeta (Runtime Cache da Vercel), compartilhado entre instâncias e
 * expirado pelo mesmo `revalidateTag`; no `next start` ele cai no mesmo handler
 * em memória do `use cache` (`next/dist/server/use-cache/handlers.js`).
 *
 * A consulta passa por `lerDoBanco`: falha do banco sai como `ErroDeLeitura`,
 * sem o SQL nem o host, porque o Next imprime o erro das funções com `use cache`.
 * A conexão da app é obtida fora dele: a mensagem de variável ausente não cita
 * valor.
 */

export async function lojaCacheada(slug: string) {
  "use cache: remote";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  const db = dbDaApp();
  return lerDoBanco(() => lojaPorSlug(db, slug));
}

export async function imoveisCacheados(slug: string) {
  "use cache: remote";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  const db = dbDaApp();
  return lerDoBanco(() => imoveisDaLoja(db, slug));
}

export async function imovelCacheado(slug: string, referencia: string) {
  "use cache: remote";
  cacheLife("vitrine");
  cacheTag(tagDaLoja(slug));
  const db = dbDaApp();
  return lerDoBanco(() => imovelPorReferencia(db, slug, referencia));
}
