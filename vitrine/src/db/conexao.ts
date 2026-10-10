import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Cria o acesso de leitura da vitrine para a URL recebida. Não lê o ambiente:
 * quem chama decide qual URL usar (a app usa `dbDaApp`; o teste de banco da
 * suíte raiz usa a URL do papel `crivo_vitrine` da branch do worker, AD-044).
 * `max: 3` porque cada instância serverless abre o próprio pool e o Neon limita
 * as conexões do plano (AD-042).
 */
export function criarDb(url: string) {
  return drizzle(new Pool({ connectionString: url, max: 3 }));
}

export type Db = ReturnType<typeof criarDb>;

let instancia: Db | undefined;

/**
 * Conexão da app: só por `VITRINE_DATABASE_URL` (VPROJ AC6), criada no primeiro
 * uso para o `next build` com banco inalcançável passar. A mensagem de erro cita
 * o nome da variável, nunca o valor.
 */
export function dbDaApp(): Db {
  if (instancia) return instancia;
  const url = process.env.VITRINE_DATABASE_URL;
  if (!url) {
    throw new Error("VITRINE_DATABASE_URL não definida: a vitrine não tem como ler o catálogo.");
  }
  instancia = criarDb(url);
  return instancia;
}
