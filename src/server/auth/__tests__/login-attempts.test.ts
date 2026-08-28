import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { accounts, loginAttempts, sessions, users } from "../../../db/schema";
import { auth } from "../config";

// AUTH-01 AC4 pelo ângulo que o limite por IP NÃO cobre: "para o mesmo
// e-mail". Todas as tentativas deste arquivo chegam de IPs diferentes, um por
// requisição — é o ataque distribuído, em que o limite por IP + rota da
// biblioteca nunca chega perto do teto. O teste do limite por IP continua em
// `login.test.ts`, sem IP declarado; um não substitui o outro.

const PASSWORD = "senha-de-teste-123";
const WRONG_PASSWORD = "senha-errada-987";

/** Faixa de documentação (RFC 5737) — nunca é IP de ninguém de verdade. */
function attackerIp(index: number): string {
  return `203.0.113.${index}`;
}

describe("server/auth — limite de login por e-mail (lote-8, AUTH-01 AC4)", () => {
  const targetEmail = `auth01-alvo-${randomUUID()}@fixture.test`;
  const bystanderEmail = `auth01-vizinho-${randomUUID()}@fixture.test`;
  const createdUserIds: string[] = [];

  /** Tentativa de login pela MESMA porta que a tela usa, com IP declarado. */
  function failedSignIn(email: string, ip: string): Promise<Response> {
    return auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password: WRONG_PASSWORD }),
      })
    );
  }

  beforeAll(async () => {
    for (const email of [targetEmail, bystanderEmail]) {
      const created = await auth.api.signUpEmail({
        body: { email, password: PASSWORD, name: "Usuário AUTH-01" },
      });
      createdUserIds.push(created.user.id);
    }
  });

  afterAll(async () => {
    await db
      .delete(loginAttempts)
      .where(inArray(loginAttempts.email, [targetEmail, bystanderEmail]));
    if (createdUserIds.length === 0) return;
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  // O coração da AC4. Cada uma das 10 falhas vem de um IP próprio, então
  // nenhum IP gasta mais de 1 das 10 fichas do limite nativo: se a recusa da
  // 11ª acontece, ela só pode ter vindo do contador por e-mail.
  it("10 falhas do mesmo e-mail vindas de 10 IPs diferentes recusam a 11ª, de um IP inédito", async () => {
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 10; attempt++) {
      statuses.push((await failedSignIn(targetEmail, attackerIp(attempt))).status);
    }

    // As 10 primeiras são recusa de credencial: a tentativa foi avaliada.
    expect(statuses).toEqual(Array.from({ length: 10 }, () => 401));

    const eleventh = await failedSignIn(targetEmail, attackerIp(11));
    expect(eleventh.status).toBe(429);
  });

  // A trava é do e-mail, não da rota nem do IP: no MESMO IP que acabou de ser
  // recusado, outro e-mail continua sendo avaliado normalmente. Sem esta
  // asserção, um limite global na rota passaria pelo teste acima.
  it("a recusa é do e-mail: outro e-mail no mesmo IP segue sendo avaliado", async () => {
    const sharedIp = attackerIp(12);

    expect((await failedSignIn(targetEmail, sharedIp)).status).toBe(429);
    expect((await failedSignIn(bystanderEmail, sharedIp)).status).toBe(401);
  });

  // "até o fim da janela": a recusa é a mesma para quem sabe a senha certa.
  // Enquanto a janela do e-mail está esgotada, a credencial não chega a ser
  // avaliada — é isso que "recusar novas tentativas desse e-mail" significa.
  it("dentro da janela, nem a senha correta do e-mail travado é avaliada", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": attackerIp(13),
        },
        body: JSON.stringify({ email: targetEmail, password: PASSWORD }),
      })
    );

    expect(response.status).toBe(429);
  });
});
