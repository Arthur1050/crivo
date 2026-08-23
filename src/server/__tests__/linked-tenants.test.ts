import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  accounts,
  sessions,
  tenant_members,
  tenants,
  users,
} from "../../db/schema";
import { auth } from "../auth/config";
import { getLinkedTenants } from "../tenant";

// Cobre TENANT-01 AC2/AC3: o seletor lista EXCLUSIVAMENTE as imobiliárias
// vinculadas ao usuário autenticado, e some quando existe um vínculo só.
// A decisão de exibir (`tenants.length > 1`) é do componente React — camada
// "none" na matriz; o que é testado aqui é o dado que alimenta essa decisão.

async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: "Agente Teste",
    supportedModality: "ambos",
    slug: `fixture-${id}`,
  });
  return id;
}

async function signUp(name: string): Promise<string> {
  const created = await auth.api.signUpEmail({
    body: {
      email: `t9-${randomUUID()}@fixture.test`,
      password: "senha-de-teste-123",
      name,
    },
  });
  return created.user.id;
}

describe("server/tenant — getLinkedTenants (lote-8, TENANT-01)", () => {
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

  it("devolve só as imobiliárias vinculadas — nunca a lista completa do banco", async () => {
    const userId = await signUp("Usuário Um Vínculo");
    createdUserIds.push(userId);

    const meu = await createTenant("Imobiliária T9 Minha");
    const alheio = await createTenant("Imobiliária T9 Alheia");
    createdTenantIds.push(meu, alheio);

    await db.insert(tenant_members).values({
      userId,
      organizationId: meu,
      role: "corretor",
    });

    const linked = await getLinkedTenants(userId);

    // Um vínculo só: é isto que faz o seletor sumir (AC2).
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe(meu);
    // A imobiliária alheia existe no banco e NÃO aparece — é a asserção que
    // separa "lista de vínculos" de "lista de tenants".
    expect(linked.map((tenant) => tenant.id)).not.toContain(alheio);
  });

  it("com mais de um vínculo, devolve todos eles na ordem determinística do vínculo", async () => {
    const userId = await signUp("Usuário Multi Vínculo");
    createdUserIds.push(userId);

    const primeiro = await createTenant("Imobiliária T9 Primeira");
    const segundo = await createTenant("Imobiliária T9 Segunda");
    const alheio = await createTenant("Imobiliária T9 Fora");
    createdTenantIds.push(primeiro, segundo, alheio);

    await db.insert(tenant_members).values([
      {
        userId,
        organizationId: segundo,
        role: "gestor",
        createdAt: new Date("2026-02-01T10:00:00Z"),
      },
      {
        userId,
        organizationId: primeiro,
        role: "corretor",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);

    const linked = await getLinkedTenants(userId);

    // Ordem é a do VÍNCULO (`createdAt` ascendente), não a de inserção nem a
    // de criação do tenant: "o primeiro vínculo" é o fallback da AC4 e não
    // pode variar entre requisições.
    expect(linked.map((tenant) => tenant.id)).toEqual([primeiro, segundo]);
  });

  it("vínculo desativado sai da lista", async () => {
    const userId = await signUp("Usuário Vínculo Desativado");
    createdUserIds.push(userId);

    const ativo = await createTenant("Imobiliária T9 Ativa");
    const desativado = await createTenant("Imobiliária T9 Desativada");
    createdTenantIds.push(ativo, desativado);

    await db.insert(tenant_members).values([
      { userId, organizationId: ativo, role: "corretor" },
      {
        userId,
        organizationId: desativado,
        role: "corretor",
        deactivatedAt: new Date(),
      },
    ]);

    const linked = await getLinkedTenants(userId);

    expect(linked.map((tenant) => tenant.id)).toEqual([ativo]);
  });

  it("usuário sem vínculo nenhum devolve lista vazia", async () => {
    const userId = await signUp("Usuário Sem Vínculo T9");
    createdUserIds.push(userId);

    expect(await getLinkedTenants(userId)).toEqual([]);
  });
});
