/**
 * `npm test` — suíte completa nas branches de worker do Neon, em paralelo.
 *
 * Duas faixas de banco, para a suíte longa rodar ao lado do trabalho do dia:
 * - `npm test` liga `TEST_WORKER_BRANCHES=1`: cada worker usa sua branch de
 *   `test-workers.local.json` (ver `vitest.config.ts`);
 * - `npx vitest run <arquivo>` (testes pontuais de uma task) fica na branch
 *   base da `TEST_DATABASE_URL`, que a suíte paralela não toca.
 * Duas suítes completas ao mesmo tempo ainda disputam as mesmas branches.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(`npx vitest run ${process.argv.slice(2).join(" ")}`.trim(), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TEST_WORKER_BRANCHES: "1" },
});
process.exit(result.status ?? 1);
