/**
 * `npm run dev:test` — sobe o Next apontado para o banco DESCARTÁVEL da suíte
 * (`TEST_DATABASE_URL`) em vez do banco real.
 *
 * Por que existe: `src/db/index.ts` escolhe a conexão por uma única condição —
 * se `VITEST` está definida usa `TEST_DATABASE_URL`, senão `DATABASE_URL`. Não
 * há um modo "desenvolvimento" separado, então `npm run dev` sempre falou com
 * o banco real. Isso não incomodava enquanto ninguém precisava dos dois bancos
 * com dados diferentes ao mesmo tempo; passou a incomodar quando o lote-12
 * exigiu semear documentos de teste em todos os estados para verificação
 * visual, sem poluir dado real.
 *
 * O que ele faz: substitui `DATABASE_URL` pela DSN de teste **apenas no
 * processo filho** e imprime o host de destino, para que a confusão entre os
 * dois bancos seja visível na primeira linha do log em vez de descoberta na
 * tela de login.
 *
 * Nenhuma connection string é impressa — só host e nome do banco.
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";

config();

const alvo = globalThis.process.env.TEST_DATABASE_URL;
if (!alvo) {
  console.error(
    "TEST_DATABASE_URL não definida. Este comando existe para NÃO tocar o banco real:\n" +
      "defina a DSN de um banco descartável antes de usá-lo. Ver .env.example."
  );
  globalThis.process.exit(1);
}

const url = new URL(alvo);
console.log(
  `dev:test -> banco DESCARTÁVEL: ${url.hostname}/${url.pathname.replace(/^\//, "")}\n` +
    "Se o host acima não for o de teste, encerre agora: o app estaria falando com o banco real."
);

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...globalThis.process.env, DATABASE_URL: alvo },
});

child.on("exit", (code) => globalThis.process.exit(code ?? 0));
