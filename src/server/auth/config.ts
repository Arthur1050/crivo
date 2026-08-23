import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db";
import * as schema from "../../db/schema";

/**
 * Instância única do better-auth do produto (design.md — Configuração de
 * autenticação; AD-021). Todo consumidor (rotas, server actions, DAL) importa
 * `auth` deste módulo — nunca constrói uma segunda instância.
 *
 * Reusa a pool `pg` de `src/db/index.ts`: nenhuma conexão nova é aberta, e a
 * suíte de testes herda automaticamente o isolamento em `TEST_DATABASE_URL`.
 *
 * `advanced.database.generateId: "uuid"` é o coração desta task (tasks.md —
 * T2): as PKs do projeto são todas `uuid` com `defaultRandom()` (AD-002 depende
 * de `tenants.id` ser uma identidade só), e o padrão do better-auth é um id
 * alfanumérico de 32 caracteres, que não caberia numa coluna `uuid`. O modo
 * "uuid" faz o id ser `crypto.randomUUID()` — v4, exatamente o formato que
 * `gen_random_uuid()` produz.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Os nomes de tabela do projeto são plurais; os modelos do better-auth são
  // singulares. O mapeamento é explícito por modelo (mesma mecânica que o
  // plugin `organization` vai usar para apontar `organization` → `tenants`).
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
