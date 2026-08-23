import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Espelho de `drizzle.config.ts` apontando para o banco DESCARTÁVEL da suíte
// (`TEST_DATABASE_URL`). Existe porque a suíte inteira bate no Postgres real
// (`src/db/index.ts`): toda task que altera o schema precisa aplicá-lo aos
// DOIS bancos, e sem este arquivo o único caminho seria sobrescrever
// `DATABASE_URL` à mão na linha de comando — que é exatamente como se aponta
// um push para o banco errado por engano.
//
// Uso: `npx drizzle-kit push --config drizzle-test.config.ts`
//
// O nome é `drizzle-test.config.ts`, e não `drizzle.config.test.ts`, porque o
// vitest recolhe todo `*.test.ts` como arquivo de teste.

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL não definida. Copie .env.example para .env e preencha a connection string do banco de teste antes de aplicar o schema nele. Ver .env.example."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.TEST_DATABASE_URL,
  },
});
