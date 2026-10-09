/**
 * `npm run db:push:test` — aplica o schema (`drizzle-kit push`) e o SQL da
 * vitrine no banco de teste base e em cada branch de worker de
 * `test-workers.local.json`.
 *
 * Com uma branch por worker, uma mudança de schema aplicada só na base deixa
 * os workers defasados e a suíte paralela falha de um jeito que parece bug.
 * Este comando mantém todas alinhadas. Em cada alvo a ordem é: derrubar o
 * schema `vitrine` (alterar coluna usada por view faz o push falhar) -> push do
 * Drizzle -> aplicar o SQL da vitrine com a senha do papel -> conferir o estado
 * final. O push já saiu com 0 sem aplicar check (L-068), então só a conferência
 * decide que o alvo ficou pronto. Nenhuma connection string nem senha é
 * impressa — só o host de cada alvo.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveTestDatabaseUrl } from "../src/db/test-connection";
import { applyVitrineSql, dropVitrineSchema, verifyVitrineState } from "./vitrine/apply";

/** As quatro etapas de cada alvo; trocadas por simuladores nos testes. */
export interface PushSteps {
  dropVitrine: (url: string) => Promise<void>;
  /** Roda o `drizzle-kit push` e devolve o código de saída. */
  push: (url: string) => Promise<number | null> | number | null;
  applyVitrine: (url: string, options: { password: string }) => Promise<void>;
  /** Problemas do estado final; lista vazia = alvo pronto. */
  verify: (url: string) => Promise<string[]>;
}

interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

function host(url: string): string {
  return new URL(url).hostname;
}

/**
 * Percorre os alvos em ordem, um de cada vez, e para no primeiro erro: os
 * alvos seguintes não são tocados. Devolve o código de saída do processo.
 */
export async function pushToTargets(
  targets: string[],
  steps: PushSteps,
  password: string | undefined,
  logger: Logger = console
): Promise<number> {
  if (!password) {
    logger.error(
      "VITRINE_TEST_DB_PASSWORD não definida no ambiente local: sem ela o papel crivo_vitrine ficaria sem senha. Nenhum alvo foi tocado."
    );
    return 1;
  }

  for (const url of targets) {
    const label = host(url);
    logger.log(`\n== vitrine + drizzle-kit push -> ${label}`);
    try {
      await steps.dropVitrine(url);
      const status = await steps.push(url);
      if (status !== 0) {
        logger.error(`Push falhou em ${label}; os demais alvos não foram tocados.`);
        return status ?? 1;
      }
      await steps.applyVitrine(url, { password });
      const problems = await steps.verify(url);
      if (problems.length > 0) {
        logger.error(`Estado final incompleto em ${label}; os demais alvos não foram tocados:`);
        for (const problem of problems) logger.error(`  - ${problem}`);
        return 1;
      }
    } catch (error) {
      // Só o nome do erro e o código: a mensagem de um driver pode citar a conexão.
      const code = (error as { code?: string }).code;
      logger.error(`Falhou em ${label} (${(error as Error).name}${code ? ` ${code}` : ""}); os demais alvos não foram tocados.`);
      return 1;
    }
  }
  logger.log(`\nSchema e vitrine aplicados e conferidos em ${targets.length} banco(s) de teste.`);
  return 0;
}

function realSteps(): PushSteps {
  return {
    dropVitrine: dropVitrineSchema,
    push: (url) =>
      spawnSync("npx drizzle-kit push --config drizzle-test.config.ts", {
        stdio: "inherit",
        shell: true,
        env: { ...process.env, TEST_DATABASE_URL: url },
      }).status,
    applyVitrine: applyVitrineSql,
    verify: verifyVitrineState,
  };
}

async function main(): Promise<void> {
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

  process.exit(await pushToTargets(targets, realSteps(), process.env.VITRINE_TEST_DB_PASSWORD));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/test-db-push.ts")) {
  main().catch(() => {
    console.error("Falha inesperada no db:push:test.");
    process.exit(1);
  });
}
