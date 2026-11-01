/**
 * `npm run preview:test` — CRM local contra o banco de TESTE, pronto para login.
 *
 * Recria os usuários de verificação (`scripts/preview-test-users.ts`) e sobe o
 * `dev:test` na porta de `PORT` (padrão 3000). É o comando que o
 * `.ao/launch.json` usa para o preview das sessões do orquestrador.
 */
import { spawn, spawnSync } from "node:child_process";

const users = spawnSync("npx tsx --conditions=react-server scripts/preview-test-users.ts", {
  stdio: "inherit",
  shell: true,
});
if (users.status !== 0) globalThis.process.exit(users.status ?? 1);

const child = spawn(globalThis.process.execPath, ["scripts/dev-test-db.mjs"], { stdio: "inherit" });
child.on("exit", (code) => globalThis.process.exit(code ?? 0));
