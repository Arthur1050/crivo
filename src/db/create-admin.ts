import "dotenv/config";
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { tenant_members, tenants, users } from "./schema";
import { auth } from "../server/auth/config";
import { parseRoles, type Role } from "../server/auth/session";

/**
 * Bootstrap de administrador (spec.md — SEED-01 AC5; AD-001).
 *
 * Alguém precisa existir antes de poder convidar, e esse alguém não pode
 * nascer de um formulário aberto na internet: o piloto é negociado
 * diretamente com dois clientes-âncora, sem onboarding self-service. Por isso
 * este é um comando de linha, da mesma família de `npm run db:seed`, executado
 * por quem opera a plataforma — nunca uma tela pública.
 *
 * Idempotente: executado de novo sobre o mesmo e-mail, **promove** em vez de
 * duplicar. Nem o usuário nem o vínculo são recriados.
 *
 * Uso: `npm run db:create-admin -- <slug-da-imobiliaria> <email> <senha> ["Nome"]`
 */

export interface CreateAdminResult {
  userId: string;
  tenantId: string;
  roles: Role[];
  /** O que a execução de fato fez, para o comando poder reportar honestamente. */
  outcome:
    | "usuario-criado-e-vinculado"
    | "usuario-existente-vinculado"
    | "vinculo-promovido"
    | "ja-era-administrador";
}

const ADMIN_ROLE: Role = "administrador";

export async function createAdmin(options: {
  tenantSlug: string;
  email: string;
  password: string;
  name?: string;
}): Promise<CreateAdminResult> {
  const { tenantSlug, email, password, name } = options;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) {
    throw new Error(
      `Imobiliária de slug '${tenantSlug}' não existe. Rode \`npm run db:seed\` ou confira o slug.`
    );
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  let userId: string;
  let userExisted: boolean;

  if (existing) {
    userId = existing.id;
    userExisted = true;
  } else {
    // Criado pela API do better-auth, nunca por INSERT direto: é ela que faz o
    // hash da senha e cria a linha de `accounts` que o login lê. Um INSERT em
    // `users` produziria um usuário que não consegue entrar.
    const created = await auth.api.signUpEmail({
      body: { email, password, name: name ?? email },
    });
    userId = created.user.id;
    userExisted = false;
  }

  const [membership] = await db
    .select()
    .from(tenant_members)
    .where(
      and(
        eq(tenant_members.userId, userId),
        eq(tenant_members.organizationId, tenant.id)
      )
    );

  if (!membership) {
    await db.insert(tenant_members).values({
      userId,
      organizationId: tenant.id,
      role: ADMIN_ROLE,
    });

    return {
      userId,
      tenantId: tenant.id,
      roles: [ADMIN_ROLE],
      outcome: userExisted
        ? "usuario-existente-vinculado"
        : "usuario-criado-e-vinculado",
    };
  }

  const currentRoles = parseRoles(membership.role);

  if (currentRoles.includes(ADMIN_ROLE)) {
    return {
      userId,
      tenantId: tenant.id,
      roles: currentRoles,
      outcome: "ja-era-administrador",
    };
  }

  // Promoção ACUMULA o papel em vez de substituir: um gestor que também
  // atende como corretor não pode perder o papel menor por virar
  // administrador (papéis acumuláveis são união — spec.md, PERM-01 AC4).
  const promoted = [...currentRoles, ADMIN_ROLE];

  await db
    .update(tenant_members)
    .set({ role: promoted.join(",") })
    .where(eq(tenant_members.id, membership.id));

  return {
    userId,
    tenantId: tenant.id,
    roles: promoted,
    outcome: "vinculo-promovido",
  };
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const [tenantSlug, email, password, name] = process.argv.slice(2);

  if (!tenantSlug || !email || !password) {
    console.error(
      'Uso: npm run db:create-admin -- <slug-da-imobiliaria> <email> <senha> ["Nome"]'
    );
    process.exit(1);
  }

  createAdmin({ tenantSlug, email, password, name })
    .then((result) => {
      console.log(
        `Administrador pronto (${result.outcome}): ${email} em '${tenantSlug}' com papéis [${result.roles.join(", ")}].`
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
