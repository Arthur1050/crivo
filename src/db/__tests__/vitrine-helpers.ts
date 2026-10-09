import { parseWorkerEndpoints, resolveTestDatabaseUrl } from "../test-connection";

/**
 * URL do banco de teste do worker atual (a mesma que `src/db/index.ts` usa).
 * Os testes da vitrine precisam dela para falar com o SQL e com o papel
 * `crivo_vitrine` no mesmo alvo em que o `db` do teste escreve.
 */
export function currentTestDatabaseUrl(): string {
  const baseUrl = process.env.TEST_DATABASE_URL;
  if (!baseUrl) throw new Error("TEST_DATABASE_URL não definida: os testes da vitrine precisam do banco de teste.");
  return resolveTestDatabaseUrl({
    baseUrl,
    endpoints: parseWorkerEndpoints(process.env.TEST_DATABASE_WORKER_ENDPOINTS),
    poolId: process.env.VITEST_POOL_ID,
  });
}
