import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  accounts,
  sessions,
  tenant_members,
  tenants,
  users,
} from "../../../db/schema";
import { auth } from "../config";

// Cobre TENANT-01 AC1 (vínculo usuário↔imobiliária como relação própria) pelo
// ângulo que a T4 precisa provar: o plugin `organization` escreve na tabela
// `tenants` que já existe, e não numa tabela nova ao lado dela (AD-021).

/** Cria usuário e devolve o id junto do header de sessão dele. */
async function signUp(email: string, name: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "senha-de-teste-123", name },
    returnHeaders: true,
  });

  const setCookie = headers.get("set-cookie");
  expect(setCookie, "signUpEmail deveria devolver cookie de sessão").toBeTruthy();

  return {
    userId: response.user.id,
    headers: new Headers({ cookie: setCookie as string }),
  };
}

describe("server/auth — plugin organization sobre `tenants` (lote-8, TENANT-01)", () => {
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  let ownerUserId: string;
  let ownerHeaders: Headers;
  let organizationId: string;
  const slug = `t4-org-${randomUUID()}`;

  beforeAll(async () => {
    const owner = await signUp(`t4-owner-${randomUUID()}@fixture.test`, "Dono T4");
    ownerUserId = owner.userId;
    ownerHeaders = owner.headers;
    createdUserIds.push(ownerUserId);

    const organization = await auth.api.createOrganization({
      body: {
        name: "Imobiliária Fixture T4",
        slug,
        agentName: "Agente Fixture T4",
        supportedModality: "ambos",
      },
      headers: ownerHeaders,
    });

    organizationId = organization!.id;
    createdTenantIds.push(organizationId);
  });

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

  it("a organização criada pelo plugin é uma linha da tabela `tenants`, com as colunas de domínio preenchidas", async () => {
    const rows = await db.select().from(tenants).where(eq(tenants.id, organizationId));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Imobiliária Fixture T4");
    expect(rows[0].slug).toBe(slug);
    expect(rows[0].agentName).toBe("Agente Fixture T4");
    expect(rows[0].supportedModality).toBe("ambos");
  });

  it("o vínculo do criador é uma linha de `tenant_members` apontando para o usuário e para a imobiliária", async () => {
    const rows = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.organizationId, organizationId));

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(ownerUserId);
    expect(rows[0].organizationId).toBe(organizationId);
  });

  it("a API do plugin lê de volta a organização e o membro pelo mesmo id", async () => {
    const full = await auth.api.getFullOrganization({
      query: { organizationId },
      headers: ownerHeaders,
    });

    expect(full!.id).toBe(organizationId);
    expect(full!.slug).toBe(slug);
    expect(full!.members.map((member) => member.userId)).toEqual([ownerUserId]);
  });

  it("`sessions.activeOrganizationId` grava a imobiliária ativa escolhida", async () => {
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: ownerHeaders,
    });

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, ownerUserId));

    expect(rows).toHaveLength(1);
    expect(rows[0].activeOrganizationId).toBe(organizationId);
  });

  it("um segundo vínculo do mesmo usuário na mesma imobiliária é recusado pelo único de (userId, organizationId)", async () => {
    await expect(
      db.insert(tenant_members).values({
        userId: ownerUserId,
        organizationId,
        role: "corretor",
      })
    ).rejects.toThrow();
  });
});
