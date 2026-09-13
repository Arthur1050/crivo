import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db } from "./index";
import { serviceApiKeys } from "./schema";

/**
 * Emite uma chave de serviço NOVA sem rotacionar mais nada
 * (`n8n/README.md` §12.3, passo 1 — versão cirúrgica).
 *
 * O caminho documentado para gerar chave de serviço é `npm run db:seed`, que
 * gera e imprime uma chave nova. O problema é o resto do que ele faz: o seed
 * apaga `users` (e leads, imóveis, documentos, chaves por tenant) antes de
 * reinserir tudo — então usar o seed só para trocar a chave derruba os logins
 * do CRM e exige `npm run db:create-admin` de novo em cada imobiliária.
 *
 * Este comando faz só a metade que interessa numa rotação: insere uma linha
 * nova em `service_api_keys`. É **aditivo e sem efeito colateral** porque a
 * validação do CRM (`resolveServiceApiKeyHash`, `src/server/data/index.ts`)
 * casa por `key_hash` com `revoked_at IS NULL` — várias chaves podem estar
 * ativas ao mesmo tempo, e emitir uma nova não invalida nenhuma existente.
 *
 * Mesmo esquema de geração do seed, nunca reinventado: 32 bytes aleatórios em
 * hex (64 chars) e `sha256` como hash. O banco guarda só o hash; a chave em
 * claro aparece UMA vez, no stdout — se perder, não há como recuperar, só
 * emitir outra.
 *
 * Depois de rodar, o passo humano continua sendo o do README §12.3: editar a
 * credencial `httpHeaderAuth` "Crivo - chave de servico" (`YhGcdfGtdEBBU9YP`)
 * na UI do n8n, trocando o header `Authorization` para `Bearer <chave nova>` —
 * a exceção de sempre ao workflow-as-code (credencial é gate humano).
 *
 * Revogar as chaves antigas é passo SEPARADO e opcional: elas ficam inúteis
 * assim que ninguém mais conhece o valor em claro. Não é feito aqui de
 * propósito — revogar antes de confirmar que a nova autentica é exatamente a
 * inversão de ordem que o README §12.3 proíbe, porque deixa o agente mudo em
 * produção.
 *
 * Uso: `npm run db:mint-service-key -- ["rótulo da chave"]`
 */

export interface MintedServiceKey {
  label: string;
  key: string;
}

export async function mintServiceKey(label?: string): Promise<MintedServiceKey> {
  const key = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(key).digest("hex");
  const finalLabel =
    label?.trim() || `Rotacao manual — ${new Date().toISOString().slice(0, 10)}`;

  await db.insert(serviceApiKeys).values({ label: finalLabel, keyHash: hash });

  return { label: finalLabel, key };
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const [label] = process.argv.slice(2);

  mintServiceKey(label)
    .then((minted) => {
      console.log(`Chave de serviço emitida com o rótulo '${minted.label}'.`);
      console.log("");
      console.log("Cole este valor no header Authorization da credencial");
      console.log("'Crivo - chave de servico' (YhGcdfGtdEBBU9YP) na UI do n8n:");
      console.log("");
      console.log(`  Bearer ${minted.key}`);
      console.log("");
      console.log("Aparece uma vez só — o banco guarda apenas o hash.");
      console.log(
        "Nenhuma chave existente foi revogada: emitir é aditivo, e revogar antes"
      );
      console.log("de confirmar a nova deixaria o agente mudo (README §12.3).");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
