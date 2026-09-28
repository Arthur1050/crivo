/**
 * Conexão de teste por worker do Vitest.
 *
 * A suíte fala com Postgres remoto (Neon, us-east-1) e, com um banco só,
 * precisava rodar os arquivos em série: arquivos paralelos escreviam nas
 * mesmas linhas de seed e fixtures. Com uma branch do Neon por worker, cada
 * worker tem sua cópia isolada e os arquivos rodam em paralelo com segurança.
 *
 * Uma branch filha herda papéis e senhas da branch mãe, então a URL de cada
 * worker é a `TEST_DATABASE_URL` com outro endpoint no host. Só o id do
 * endpoint é configurado (`test-workers.local.json`): nenhuma credencial nova
 * existe nem precisa ser copiada.
 */

const NEON_ENDPOINT = /^(ep-[a-z0-9-]+?)(-pooler)?$/;

/**
 * URL da branch do worker `poolId` (1..N). Sem endpoints configurados ou fora
 * de um worker, devolve a URL base: a suíte continua funcionando em série.
 */
export function resolveTestDatabaseUrl(input: {
  baseUrl: string;
  endpoints: readonly string[];
  poolId: string | undefined;
}): string {
  const { baseUrl, endpoints, poolId } = input;
  const worker = Number(poolId);
  if (endpoints.length === 0 || !Number.isInteger(worker) || worker < 1) return baseUrl;

  const url = new URL(baseUrl);
  const [label, ...rest] = url.hostname.split(".");
  const match = NEON_ENDPOINT.exec(label);
  if (!match) {
    throw new Error("TEST_DATABASE_URL não aponta para um endpoint do Neon; branches por worker exigem Neon.");
  }
  const endpoint = endpoints[(worker - 1) % endpoints.length];
  if (!NEON_ENDPOINT.test(endpoint)) {
    throw new Error(`Endpoint de worker inválido: ${endpoint}`);
  }
  url.hostname = [`${endpoint}${match[2] ?? ""}`, ...rest].join(".");
  return url.toString();
}

/** Lista de endpoints vinda do ambiente (`a,b,c`), ignorando vazios. */
export function parseWorkerEndpoints(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
