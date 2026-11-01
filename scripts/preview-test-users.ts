/**
 * Usuários de verificação visual no banco de TESTE (`npm run preview:test`).
 *
 * O seed apaga todos os usuários a cada suíte, então quem for capturar telas
 * do CRM local precisa recriá-los antes de entrar. Garante dois logins na
 * imobiliária `krivo-demo`, um por papel que a interface distingue em
 * Documentos: administrador (lê e escreve) e corretor (só lê). Idempotente:
 * rodado de novo, só reajusta o papel do vínculo.
 *
 * As credenciais são de teste e valem só para o banco descartável da
 * `TEST_DATABASE_URL`; o comando recusa rodar sem ela ou com ela igual à
 * `DATABASE_URL` do ambiente local.
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";

export const PREVIEW_TEST_TENANT = "krivo-demo";
export const PREVIEW_TEST_PASSWORD = "senha-de-teste-123";
export const PREVIEW_TEST_USERS = [
  { email: "verificacao@fixture.test", name: "Administrador de Verificação", role: "administrador" },
  { email: "corretor@fixture.test", name: "Corretor de Verificação", role: "corretor" },
] as const;

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.error("TEST_DATABASE_URL não definida: nenhum usuário foi criado.");
    process.exit(1);
  }
  if (testUrl === process.env.DATABASE_URL) {
    console.error("TEST_DATABASE_URL é igual à DATABASE_URL: recusado para não tocar o banco real.");
    process.exit(1);
  }
  // Antes de importar o banco: o cliente lê a DATABASE_URL ao carregar.
  process.env.DATABASE_URL = testUrl;

  const { db } = await import("../src/db/index");
  const { tenant_members, tenants, users } = await import("../src/db/schema");
  const { auth } = await import("../src/server/auth/config");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, PREVIEW_TEST_TENANT));
  if (!tenant) {
    console.error(`Imobiliária '${PREVIEW_TEST_TENANT}' não existe no banco de teste: rode uma suíte para reseedá-lo.`);
    process.exit(1);
  }

  for (const user of PREVIEW_TEST_USERS) {
    const [existing] = await db.select().from(users).where(eq(users.email, user.email));
    // Pela API do better-auth, como no create-admin: é ela que cria a linha de
    // `accounts` com o hash da senha que o login lê.
    const userId =
      existing?.id ??
      (await auth.api.signUpEmail({
        body: { email: user.email, password: PREVIEW_TEST_PASSWORD, name: user.name },
      })).user.id;

    const [membership] = await db
      .select()
      .from(tenant_members)
      .where(and(eq(tenant_members.userId, userId), eq(tenant_members.organizationId, tenant.id)));

    if (!membership) {
      await db.insert(tenant_members).values({ userId, organizationId: tenant.id, role: user.role });
    } else if (membership.role !== user.role) {
      await db.update(tenant_members).set({ role: user.role }).where(eq(tenant_members.id, membership.id));
    }
    console.log(`Usuário de verificação pronto: ${user.email} (${user.role}) em '${PREVIEW_TEST_TENANT}'.`);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
