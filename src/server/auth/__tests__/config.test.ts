import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { accounts, sessions, users } from "../../../db/schema";
import { auth } from "../config";

// Formato canônico de UUID v4 — o mesmo que `gen_random_uuid()` do Postgres
// produz e o único que a coluna `uuid` das PKs do projeto aceita.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("server/auth — id do better-auth contra o schema real (lote-8, AUTH-01)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length === 0) return;
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  // Risco registrado no design.md: o padrão do better-auth é um id
  // alfanumérico de 32 caracteres, que NÃO cabe numa coluna `uuid`. Se este
  // teste falhar, a escolha do formato de chave do produto volta ao usuário —
  // não existe contorno aceitável aqui (tasks.md — T2).
  it("usuário criado pela API do better-auth recebe id no formato uuid v4", async () => {
    const email = `t2-uuid-${Date.now()}@fixture.test`;

    const result = await auth.api.signUpEmail({
      body: { email, password: "senha-de-teste-123", name: "Fixture T2" },
    });

    createdUserIds.push(result.user.id);

    expect(result.user.id).toMatch(UUID_V4);
  });

  // Done-when "Tabelas core adicionadas a src/db/schema.ts e aplicadas ao
  // banco": prova que a linha caiu na tabela `users` do projeto (mapeada por
  // `user.modelName`), e não numa tabela `user` paralela criada pelo plugin.
  it("o usuário criado é lido de volta da tabela `users` do projeto pelo mesmo id", async () => {
    const email = `t2-tabela-${Date.now()}@fixture.test`;

    const result = await auth.api.signUpEmail({
      body: { email, password: "senha-de-teste-123", name: "Fixture Tabela" },
    });

    createdUserIds.push(result.user.id);

    const rows = await db.select().from(users).where(eq(users.id, result.user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(email);
  });
});
