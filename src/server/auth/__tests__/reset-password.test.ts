import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../../../db";
import { accounts, sessions, users, verifications } from "../../../db/schema";

// O adaptador de e-mail é o ponto de observação do link: em teste não há
// provedor, e é pelo argumento `url` que se prova que o e-mail carrega o token
// certo apontando para a tela certa (AUTH-02 AC1).
const enviados: { to: string; name: string; url: string }[] = [];

vi.mock("../email", () => ({
  sendResetPasswordEmail: vi.fn(async (reset: { to: string; name: string; url: string }) => {
    enviados.push(reset);
    return { ok: true, id: "fixture" };
  }),
  sendInvitationEmail: vi.fn(async () => ({ ok: true, id: "fixture" })),
}));

const { auth } = await import("../config");

const SENHA_ANTIGA = "senha-antiga-123";
const SENHA_NOVA = "senha-nova-456";

/** Lê a linha de verificação daquele token. O better-auth grava o pedido de
 * redefinição como `reset-password:<token>`, com `value` = id do usuário. */
async function verificationDoToken(token: string) {
  const rows = await db
    .select()
    .from(verifications)
    .where(eq(verifications.identifier, `reset-password:${token}`));
  return rows[0] ?? null;
}

/** Extrai o token da URL que foi para o e-mail. */
function tokenDaUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

/** Redefinição que DEVE falhar; devolve o erro para inspeção. */
async function resetQueFalha(token: string, newPassword: string) {
  let caught: unknown;
  try {
    await auth.api.resetPassword({ body: { token, newPassword } });
  } catch (error) {
    caught = error;
  }
  expect(caught, "a redefinição deveria ter falhado").toBeDefined();
  return caught as { status?: string; body?: { message?: string; code?: string } };
}

describe("server/auth — recuperação de senha (lote-8, AUTH-02)", () => {
  const createdUserIds: string[] = [];
  const email = `t32-reset-${randomUUID()}@fixture.test`;

  beforeAll(async () => {
    const created = await auth.api.signUpEmail({
      body: { email, password: SENHA_ANTIGA, name: "Usuária T32" },
    });
    createdUserIds.push(created.user.id);
  });

  beforeEach(() => {
    enviados.length = 0;
  });

  afterAll(async () => {
    if (createdUserIds.length === 0) return;
    await db
      .delete(verifications)
      .where(like(verifications.identifier, "reset-password:%"));
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  // AC1: e-mail cadastrado recebe link de redefinição válido por 1 hora.
  it("e-mail cadastrado recebe um link de redefinição válido por 1 hora", async () => {
    const antes = Date.now();
    await auth.api.requestPasswordReset({ body: { email } });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe(email);

    const url = new URL(enviados[0].url);
    expect(url.pathname).toBe("/recuperar-senha");

    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();

    const verification = await verificationDoToken(token as string);
    expect(verification, "o token do e-mail tem de existir no banco").not.toBeNull();
    expect(verification!.value).toBe(createdUserIds[0]);

    // 1 hora exata, com folga para o tempo de execução do próprio teste.
    const validadeMs = new Date(verification!.expiresAt).getTime() - antes;
    expect(validadeMs).toBeGreaterThan(59 * 60 * 1000);
    expect(validadeMs).toBeLessThanOrEqual(60 * 60 * 1000 + 30_000);
  });

  // AC2: e-mail inexistente vê a MESMA confirmação do caso de sucesso — nada na
  // resposta pode distinguir os dois casos, senão a base de e-mails vaza.
  it("e-mail inexistente devolve a mesma resposta do e-mail cadastrado", async () => {
    const cadastrado = await auth.api.requestPasswordReset({ body: { email } });
    enviados.length = 0;

    const desconhecido = `t32-inexistente-${randomUUID()}@fixture.test`;
    const inexistente = await auth.api.requestPasswordReset({
      body: { email: desconhecido },
    });

    expect(inexistente).toEqual(cadastrado);

    // E o silêncio é real, não só igual na aparência: nenhum e-mail saiu e
    // nenhum token foi criado para a conta que não existe.
    expect(enviados).toHaveLength(0);
    const orfaos = await db
      .select()
      .from(verifications)
      .where(
        and(
          like(verifications.identifier, "reset-password:%"),
          eq(verifications.value, desconhecido)
        )
      );
    expect(orfaos).toHaveLength(0);
  });

  // AC3: link válido grava a senha nova, se invalida, e encerra as demais
  // sessões daquele usuário.
  it("link válido grava a senha nova, invalida o link e encerra as demais sessões", async () => {
    // Duas sessões abertas antes da troca — é o que a AC manda encerrar.
    await auth.api.signInEmail({ body: { email, password: SENHA_ANTIGA } });
    await auth.api.signInEmail({ body: { email, password: SENHA_ANTIGA } });
    const antes = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, createdUserIds));
    expect(antes.length).toBeGreaterThanOrEqual(2);

    await auth.api.requestPasswordReset({ body: { email } });
    const token = tokenDaUrl(enviados[0].url);

    await auth.api.resetPassword({ body: { token, newPassword: SENHA_NOVA } });

    // A senha nova entra...
    const login = await auth.api.signInEmail({
      body: { email, password: SENHA_NOVA },
    });
    expect(login.user.email).toBe(email);

    // ...e a antiga não entra mais.
    await expect(
      auth.api.signInEmail({ body: { email, password: SENHA_ANTIGA } })
    ).rejects.toThrow();

    // O link não serve uma segunda vez.
    const reuso = await resetQueFalha(token, "outra-senha-789");
    expect(reuso.body?.code).toBe("INVALID_TOKEN");

    // E as sessões que existiam antes da troca sumiram: as únicas linhas que
    // restam nasceram do login com a senha nova, acima.
    const depois = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, createdUserIds));
    const idsAntigos = antes.map((s) => s.id);
    expect(depois.filter((s) => idsAntigos.includes(s.id))).toHaveLength(0);
  });

  // AC4: link expirado é recusado (o "já usado" está coberto no teste acima,
  // com o mesmo código — o token é consumido no uso, então os dois casos são
  // indistinguíveis por construção).
  it("link expirado é recusado com o mesmo código de token inválido", async () => {
    await auth.api.requestPasswordReset({ body: { email } });
    const token = tokenDaUrl(enviados[0].url);

    // Envelhece o token em vez de esperar 1 hora.
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(verifications.identifier, `reset-password:${token}`));

    const expirado = await resetQueFalha(token, "senha-apos-expirar-321");
    expect(expirado.body?.code).toBe("INVALID_TOKEN");

    // A senha em vigor continua sendo a que valia antes da tentativa.
    const login = await auth.api.signInEmail({
      body: { email, password: SENHA_NOVA },
    });
    expect(login.user.email).toBe(email);
  });
});
