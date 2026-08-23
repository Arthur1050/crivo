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
import { parseRoles, resolveAuthContext } from "../session";

// Cobre AUTH-01 (sessão ausente/expirada) e TENANT-01 AC1/AC4/AC6 (vínculo
// como relação própria, imobiliária ativa fora dos vínculos, usuário sem
// vínculo). Bate no banco real, como o resto da camada de integração.

const PASSWORD = "senha-de-teste-123";

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

/** Cria usuário pelo better-auth e devolve id + headers de sessão dele. */
async function signUp(name: string) {
  const email = `t7-${randomUUID()}@fixture.test`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name },
    returnHeaders: true,
  });
  return {
    userId: response.user.id,
    email,
    headers: new Headers({ cookie: headers.get("set-cookie") as string }),
  };
}

async function link(
  userId: string,
  organizationId: string,
  role: string,
  createdAt: Date
) {
  await db.insert(tenant_members).values({
    userId,
    organizationId,
    role,
    createdAt,
  });
}

describe("server/auth — verifySession / resolveAuthContext (lote-8, AUTH-01 + TENANT-01)", () => {
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

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

  // AUTH-01 AC1: sem sessão válida, nada de dado de imobiliária.
  it("sem sessão: recusa com `sem-sessao`", async () => {
    const resolution = await resolveAuthContext(new Headers());

    expect(resolution).toEqual({ ok: false, reason: "sem-sessao" });
  });

  // Edge case da spec: sessão expirada enquanto o usuário usava o sistema.
  // Expirar a linha no banco é o mesmo estado que o tempo produziria.
  it("sessão expirada: recusa com `sem-sessao`", async () => {
    const user = await signUp("Sessão Expirada");
    createdUserIds.push(user.userId);

    const tenantId = await createTenant("Imobiliária T7 Expirada");
    createdTenantIds.push(tenantId);
    await link(user.userId, tenantId, "administrador", new Date());

    // Confere que ANTES de expirar a sessão resolvia — sem isso o teste
    // passaria mesmo se o motivo da recusa fosse outro.
    const before = await resolveAuthContext(user.headers);
    expect(before.ok).toBe(true);

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.userId, user.userId));

    const resolution = await resolveAuthContext(user.headers);
    expect(resolution).toEqual({ ok: false, reason: "sem-sessao" });
  });

  // TENANT-01 AC6: autenticado, mas sem vínculo nenhum.
  it("sessão válida sem vínculo: recusa com `sem-vinculo` e não devolve imobiliária", async () => {
    const user = await signUp("Sem Vínculo");
    createdUserIds.push(user.userId);

    const resolution = await resolveAuthContext(user.headers);

    expect(resolution).toMatchObject({ ok: false, reason: "sem-vinculo" });
    expect(resolution).not.toHaveProperty("context");
    // O usuário é identificado (a tela de ausência de acesso precisa dele),
    // mas nenhum dado de imobiliária atravessa.
    expect((resolution as { user: { id: string } }).user.id).toBe(user.userId);
  });

  // TENANT-01 AC1 + AC5: vínculo válido resolve imobiliária e papéis DAQUELE
  // vínculo.
  it("vínculo válido: devolve usuário, imobiliária ativa e papéis do vínculo", async () => {
    const user = await signUp("Gestor T7");
    createdUserIds.push(user.userId);

    const tenantId = await createTenant("Imobiliária T7 Válida");
    createdTenantIds.push(tenantId);
    await link(user.userId, tenantId, "gestor", new Date());

    await auth.api.setActiveOrganization({
      body: { organizationId: tenantId },
      headers: user.headers,
    });

    const resolution = await resolveAuthContext(user.headers);

    expect(resolution.ok).toBe(true);
    const context = (resolution as { context: import("../session").AuthContext }).context;
    expect(context.user.id).toBe(user.userId);
    expect(context.user.email).toBe(user.email);
    expect(context.tenantId).toBe(tenantId);
    expect(context.roles).toEqual(["gestor"]);
    // Gestor enxerga a imobiliária inteira (SCOPE-01: só corretor puro é
    // restrito à própria carteira).
    expect(context.leadScope).toEqual({ tenantId, assignedUserId: null });
  });

  // TENANT-01 AC4: imobiliária ativa apontando para fora dos vínculos é
  // IGNORADA e cai no PRIMEIRO vínculo do usuário.
  it("imobiliária ativa fora dos vínculos: ignora e cai no primeiro vínculo", async () => {
    const user = await signUp("Multi Vínculo T7");
    createdUserIds.push(user.userId);

    const primeiro = await createTenant("Imobiliária T7 Primeira");
    const segundo = await createTenant("Imobiliária T7 Segunda");
    const alheio = await createTenant("Imobiliária T7 Alheia");
    createdTenantIds.push(primeiro, segundo, alheio);

    // `createdAt` explícito e distinto: "primeiro vínculo" precisa ser
    // determinístico, não a ordem em que o Postgres devolveu as linhas.
    await link(user.userId, primeiro, "corretor", new Date("2026-01-01T10:00:00Z"));
    await link(user.userId, segundo, "gestor", new Date("2026-02-01T10:00:00Z"));

    // Força a sessão a apontar para uma imobiliária SEM vínculo — é o cenário
    // exato da AC4, e não dá para chegar nele pela API do plugin.
    await db
      .update(sessions)
      .set({ activeOrganizationId: alheio })
      .where(eq(sessions.userId, user.userId));

    const resolution = await resolveAuthContext(user.headers);

    expect(resolution.ok).toBe(true);
    const context = (resolution as { context: import("../session").AuthContext }).context;
    expect(context.tenantId).toBe(primeiro);
    expect(context.tenantId).not.toBe(alheio);
    // E os papéis são os DAQUELE vínculo, não os do outro.
    expect(context.roles).toEqual(["corretor"]);
  });

  // SCOPE-01: corretor puro fica restrito à própria carteira; quem acumula
  // outro papel, não. Papéis acumulados são UNIÃO de permissões.
  it("corretor puro recebe escopo da própria carteira; corretor + gestor recebe a imobiliária inteira", async () => {
    const corretor = await signUp("Corretor Puro T7");
    const acumulado = await signUp("Corretor e Gestor T7");
    createdUserIds.push(corretor.userId, acumulado.userId);

    const tenantId = await createTenant("Imobiliária T7 Escopo");
    createdTenantIds.push(tenantId);

    await link(corretor.userId, tenantId, "corretor", new Date());
    await link(acumulado.userId, tenantId, "corretor,gestor", new Date());

    const soCorretor = await resolveAuthContext(corretor.headers);
    const comGestor = await resolveAuthContext(acumulado.headers);

    expect(
      (soCorretor as { context: import("../session").AuthContext }).context.leadScope
    ).toEqual({ tenantId, assignedUserId: corretor.userId });

    expect(
      (comGestor as { context: import("../session").AuthContext }).context.leadScope
    ).toEqual({ tenantId, assignedUserId: null });
  });
});

describe("server/auth — parseRoles (formato nativo do plugin)", () => {
  it("lê papéis acumulados separados por vírgula", () => {
    expect(parseRoles("corretor,gestor")).toEqual(["corretor", "gestor"]);
  });

  it("tolera espaços em volta do separador", () => {
    expect(parseRoles(" administrador , corretor ")).toEqual([
      "administrador",
      "corretor",
    ]);
  });

  it("descarta papel desconhecido em vez de derrubar a requisição", () => {
    expect(parseRoles("gestor,papel-que-nao-existe")).toEqual(["gestor"]);
  });

  it("vazio, null e undefined viram lista vazia", () => {
    expect(parseRoles("")).toEqual([]);
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
  });
});
