import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { parseWorkerEndpoints, resolveTestDatabaseUrl } from "./test-connection";

// Vitest define process.env.VITEST automaticamente em toda execução da
// suíte. A suíte mexe direto no banco (seed, mutações) - rodar contra
// DATABASE_URL rotacionaria dado real/demo (e as API keys de consumidores
// reais, ex.: n8n) a cada `npx vitest run`. TEST_DATABASE_URL isola isso
// num banco descartável (branch de teste do Neon ou Postgres local).
//
// Com `test-workers.local.json`, cada worker do Vitest usa sua própria branch
// do Neon (filha da de teste) e os arquivos rodam em paralelo — ver
// `test-connection.ts` e `vitest.config.ts`.
const connectionString = process.env.VITEST
  ? process.env.TEST_DATABASE_URL &&
    resolveTestDatabaseUrl({
      baseUrl: process.env.TEST_DATABASE_URL,
      endpoints: parseWorkerEndpoints(process.env.TEST_DATABASE_WORKER_ENDPOINTS),
      poolId: process.env.VITEST_POOL_ID,
    })
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    process.env.VITEST
      ? "TEST_DATABASE_URL não definida. A suíte de testes nunca deve rodar contra o banco real (rotacionaria dado/API keys de consumidores reais) - crie um branch de teste no Neon (ou um Postgres local) e defina TEST_DATABASE_URL no .env antes de rodar `npx vitest run`. Ver .env.example."
      : "DATABASE_URL não definida. Copie .env.example para .env e preencha a connection string do Postgres (Neon ou local) antes de iniciar o app."
  );
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
