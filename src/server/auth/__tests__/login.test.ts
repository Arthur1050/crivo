import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { accounts, sessions, users } from "../../../db/schema";
import { auth } from "../config";

// Cobre AUTH-01 AC2/AC3/AC4/AC5 pelo lado do servidor. A tela em si é
// componente React (camada "none" na matriz) e foi verificada visualmente no
// navegador; o que estes testes provam é o comportamento que a tela consome.

const PASSWORD = "senha-de-teste-123";

/** Tentativa de login que DEVE falhar; devolve o erro da biblioteca para que
 * o teste possa comparar status e corpo entre dois casos de falha. */
async function failedSignIn(email: string, password: string) {
  let caught: unknown;
  try {
    await auth.api.signInEmail({ body: { email, password } });
  } catch (error) {
    caught = error;
  }
  expect(caught, "o login deveria ter falhado").toBeDefined();
  return caught as { status?: string; body?: { message?: string; code?: string } };
}

describe("server/auth — login com e-mail e senha (lote-8, AUTH-01)", () => {
  const createdUserIds: string[] = [];
  const email = `t6-login-${randomUUID()}@fixture.test`;

  beforeAll(async () => {
    const created = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Usuário T6" },
    });
    createdUserIds.push(created.user.id);
  });

  afterAll(async () => {
    if (createdUserIds.length === 0) return;
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  // AC2: credenciais corretas criam sessão.
  it("credenciais corretas criam uma sessão para o usuário", async () => {
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });

    expect(response.user.email).toBe(email);
    expect(headers.get("set-cookie")).toContain("better-auth.session_token");

    const rows = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, [response.user.id]));

    expect(rows.length).toBeGreaterThan(0);
  });

  // AC3: e-mail inexistente e senha errada produzem a MESMA mensagem — nada
  // na resposta pode distinguir os dois casos, senão a base de e-mails vaza.
  it("e-mail inexistente e senha errada devolvem a mesma resposta de falha", async () => {
    const wrongPassword = await failedSignIn(email, "senha-errada-987");
    const unknownEmail = await failedSignIn(
      `t6-inexistente-${randomUUID()}@fixture.test`,
      PASSWORD
    );

    expect(wrongPassword.status).toBe("UNAUTHORIZED");
    expect(unknownEmail.status).toBe("UNAUTHORIZED");

    // A mensagem precisa EXISTIR antes de ser comparada: sem isto, dois
    // `undefined` passariam como "mensagens iguais" e o teste não provaria
    // nada sobre a AC3.
    expect(wrongPassword.body?.message).toBeTruthy();
    expect(unknownEmail.body?.message).toBe(wrongPassword.body?.message);
    expect(unknownEmail.body?.code).toBe(wrongPassword.body?.code);
  });

  // AC5: sair invalida a sessão. Prova no estado do servidor, não só no
  // cookie: a linha DAQUELA sessão some de `sessions`. A asserção é sobre a
  // sessão específica, e não sobre a contagem do usuário, porque sair encerra
  // a sessão corrente — não todas as sessões da pessoa (encerrar as demais é
  // comportamento da redefinição de senha, AUTH-02 AC3, na T32).
  it("sair invalida a sessão no servidor", async () => {
    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const sessionHeaders = new Headers({ cookie: headers.get("set-cookie") as string });

    const before = await auth.api.getSession({ headers: sessionHeaders });
    const sessionId = before!.session.id;

    await auth.api.signOut({ headers: sessionHeaders });

    expect(await auth.api.getSession({ headers: sessionHeaders })).toBeNull();

    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(rows).toHaveLength(0);
  });

  // AC4: acima de 10 falhas em 1 minuto, novas tentativas são recusadas.
  //
  // Passa por `auth.handler(Request)`, e não por `auth.api.*`: o rate limit do
  // better-auth é uma barreira de REQUISIÇÃO — chamadas diretas de `auth.api`
  // não têm requisição e não são contadas. É o mesmo caminho que a tela usa
  // (o cliente fala com `/api/auth/**`), então é o que o teste precisa exercer.
  //
  // Fica por último de propósito: a chave do limite é IP + rota, então depois
  // deste teste `/sign-in/email` está esgotada para o resto da janela de 60s
  // neste processo. Qualquer teste de login colocado depois falharia por 429,
  // não pelo que ele quer provar.
  it("acima de 10 tentativas falhas em 1 minuto, novas tentativas são recusadas", async () => {
    const attemptSignIn = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: "senha-errada-987" }),
        })
      );

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      statuses.push((await attemptSignIn()).status);
    }

    // As 10 primeiras são recusa de credencial (401); a 11ª em diante é recusa
    // por excesso de tentativas (429) — a credencial nem chega a ser avaliada.
    expect(statuses[9]).toBe(401);
    expect(statuses[10]).toBe(429);
    expect(statuses[11]).toBe(429);
  });
});
