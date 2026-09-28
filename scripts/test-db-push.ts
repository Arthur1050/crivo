/**
 * `npm run db:push:test` — aplica o schema (`drizzle-kit push`) no banco de
 * teste base e em cada branch de worker de `test-workers.local.json`.
 *
 * Com uma branch por worker, uma mudança de schema aplicada só na base deixa
 * os workers defasados e a suíte paralela falha de um jeito que parece bug.
 * Este comando mantém todas alinhadas. Nenhuma connection string é impressa —
 * só o host de cada alvo.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveTestDatabaseUrl } from "../src/db/test-connection";

const base = process.env.TEST_DATABASE_URL;
if (!base) {
  console.error("TEST_DATABASE_URL não definida: nada a aplicar.");
  process.exit(1);
}

const file = path.resolve(process.cwd(), "test-workers.local.json");
const endpoints: string[] = existsSync(file)
  ? ((JSON.parse(readFileSync(file, "utf8")) as { endpoints?: string[] }).endpoints ?? [])
  : [];

const targets = [base, ...endpoints.map((_, index) =>
  resolveTestDatabaseUrl({ baseUrl: base, endpoints, poolId: String(index + 1) })
)];

for (const url of targets) {
  console.log(`\n== drizzle-kit push -> ${new URL(url).hostname}`);
  const result = spawnSync("npx drizzle-kit push --config drizzle-test.config.ts", {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, TEST_DATABASE_URL: url },
  });
  if (result.status !== 0) {
    console.error(`Falhou em ${new URL(url).hostname}; os demais alvos não foram tocados.`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\nSchema aplicado em ${targets.length} banco(s) de teste.`);
