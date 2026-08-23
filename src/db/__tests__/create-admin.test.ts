import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index";
import {
  accounts,
  sessions,
  tenant_members,
  tenants,
  users,
} from "../schema";
import { auth } from "../../server/auth/config";
import { createAdmin } from "../create-admin";

// Cobre SEED-01 AC5: o comando de bootstrap cria OU promove um usuário a
// administrador de uma imobiliária, com senha definida, sem depender de envio
// de e-mail.

const PASSWORD = "senha-de-teste-123";

async function createTenant(slug: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name: `Imobiliária ${slug}`,
    agentName: "Agente Teste",
    supportedModality: "ambos",
    slug,
  });
  return id;
}

describe("db/create-admin — bootstrap de administrador (lote-8, SEED-01)", () => {
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.organizationId, createdTenantIds));
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it("cria o usuário administrador com senha e o vincula à imobiliária", async () => {
    const tenantId = await createTenant(`t8-cria-${randomUUID()}`);
    createdTenantIds.push(tenantId);
    const email = `t8-cria-${randomUUID()}@fixture.test`;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const result = await createAdmin({
      tenantSlug: tenant.slug,
      email,
      password: PASSWORD,
      name: "Administrador Bootstrap",
    });
    createdUserIds.push(result.userId);

    expect(result.outcome).toBe("usuario-criado-e-vinculado");
    expect(result.roles).toEqual(["administrador"]);
    expect(result.tenantId).toBe(tenantId);

    const [membership] = await db
      .select()
      .from(tenant_members)
      .where(
        and(
          eq(tenant_members.userId, result.userId),
          eq(tenant_members.organizationId, tenantId)
        )
      );
    expect(membership.role).toBe("administrador");

    // "com senha definida" (AC5) não é o mesmo que "usuário existe": a prova é
    // conseguir entrar com ela.
    const signedIn = await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    expect(signedIn.user.id).toBe(result.userId);
  });

  it("executado de novo sobre o mesmo e-mail, promove em vez de duplicar", async () => {
    const tenantId = await createTenant(`t8-promove-${randomUUID()}`);
    createdTenantIds.push(tenantId);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const email = `t8-promove-${randomUUID()}@fixture.test`;

    // Usuário já existe e já é membro, como CORRETOR.
    const created = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Corretor Existente" },
    });
    createdUserIds.push(created.user.id);
    await db.insert(tenant_members).values({
      userId: created.user.id,
      organizationId: tenantId,
      role: "corretor",
    });

    const result = await createAdmin({
      tenantSlug: tenant.slug,
      email,
      password: PASSWORD,
    });

    expect(result.outcome).toBe("vinculo-promovido");
    expect(result.userId).toBe(created.user.id);

    // Nada duplicou: um usuário com aquele e-mail, um vínculo naquela
    // imobiliária.
    const userRows = await db.select().from(users).where(eq(users.email, email));
    expect(userRows).toHaveLength(1);

    const memberships = await db
      .select()
      .from(tenant_members)
      .where(
        and(
          eq(tenant_members.userId, created.user.id),
          eq(tenant_members.organizationId, tenantId)
        )
      );
    expect(memberships).toHaveLength(1);

    // A promoção ACUMULA: o papel corretor sobrevive (PERM-01 AC4 — papéis
    // acumulados são união, nunca substituição).
    expect(result.roles).toEqual(["corretor", "administrador"]);
    expect(memberships[0].role).toBe("corretor,administrador");
  });

  it("usuário que já existe no sistema mas não na imobiliária ganha vínculo novo, não um segundo usuário", async () => {
    const primeiro = await createTenant(`t8-a-${randomUUID()}`);
    const segundo = await createTenant(`t8-b-${randomUUID()}`);
    createdTenantIds.push(primeiro, segundo);
    const [tenantA] = await db.select().from(tenants).where(eq(tenants.id, primeiro));
    const [tenantB] = await db.select().from(tenants).where(eq(tenants.id, segundo));
    const email = `t8-multi-${randomUUID()}@fixture.test`;

    const first = await createAdmin({
      tenantSlug: tenantA.slug,
      email,
      password: PASSWORD,
    });
    createdUserIds.push(first.userId);

    const second = await createAdmin({
      tenantSlug: tenantB.slug,
      email,
      password: PASSWORD,
    });

    expect(second.outcome).toBe("usuario-existente-vinculado");
    expect(second.userId).toBe(first.userId);

    const userRows = await db.select().from(users).where(eq(users.email, email));
    expect(userRows).toHaveLength(1);

    const memberships = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.userId, first.userId));
    expect(memberships.map((m) => m.organizationId).sort()).toEqual(
      [primeiro, segundo].sort()
    );
  });

  it("executado sobre quem já é administrador, não altera nada", async () => {
    const tenantId = await createTenant(`t8-idem-${randomUUID()}`);
    createdTenantIds.push(tenantId);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const email = `t8-idem-${randomUUID()}@fixture.test`;

    const first = await createAdmin({ tenantSlug: tenant.slug, email, password: PASSWORD });
    createdUserIds.push(first.userId);

    const second = await createAdmin({ tenantSlug: tenant.slug, email, password: PASSWORD });

    expect(second.outcome).toBe("ja-era-administrador");
    expect(second.roles).toEqual(["administrador"]);

    const memberships = await db
      .select()
      .from(tenant_members)
      .where(
        and(
          eq(tenant_members.userId, first.userId),
          eq(tenant_members.organizationId, tenantId)
        )
      );
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("administrador");
  });

  it("imobiliária inexistente é recusada com mensagem que aponta o slug", async () => {
    await expect(
      createAdmin({
        tenantSlug: "slug-que-nao-existe",
        email: `t8-erro-${randomUUID()}@fixture.test`,
        password: PASSWORD,
      })
    ).rejects.toThrow(/slug-que-nao-existe/);
  });
});
