import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { tenant_members, tenants, users } from "../../db/schema";
import type { Role } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";

/**
 * Edição da janela de trabalho (tasks.md — T25; spec.md AGENDA-01).
 *
 * Mesmo harness de `users-actions.test.ts`: só a identidade da sessão é
 * fabricada (`verifySession`); a regra de quem pode salvar, a validação e a
 * escrita que rodam são as de produção.
 */

let sessionRoles: Role[] = ["corretor"];
let sessionTenantId = "";
let sessionUser = { id: "", name: "", email: "" };

vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  return {
    ...actual,
    verifySession: async (): Promise<AuthContext> => ({
      user: sessionUser,
      tenantId: sessionTenantId,
      roles: sessionRoles,
      leadScope: { tenantId: sessionTenantId, assignedUserId: null },
    }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveWorkWindowAction } from "../actions/work-window";

const createdTenantIds: string[] = [];
const createdUserIds: string[] = [];

async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: `Agente ${name}`,
    supportedModality: "ambos",
    slug: `fixture-${id}`,
  });
  createdTenantIds.push(id);
  return id;
}

async function createMember(
  tenantId: string,
  name: string,
  roles: Role[]
): Promise<{ userId: string; memberId: string; email: string }> {
  const userId = randomUUID();
  const email = `${userId}@fixture.test`;
  await db.insert(users).values({ id: userId, name, email });
  createdUserIds.push(userId);

  const rows = await db
    .insert(tenant_members)
    .values({ organizationId: tenantId, userId, role: roles.join(",") })
    .returning({ id: tenant_members.id });

  return { userId, memberId: rows[0].id, email };
}

async function windowOf(memberId: string) {
  const rows = await db
    .select({
      workDays: tenant_members.workDays,
      workHoursStart: tenant_members.workHoursStart,
      workHoursEnd: tenant_members.workHoursEnd,
    })
    .from(tenant_members)
    .where(eq(tenant_members.id, memberId));
  return rows[0];
}

describe("server/actions/work-window — janela de trabalho (lote-8, AGENDA-01)", () => {
  let tenantId: string;
  let outroTenantId: string;
  let admin: Awaited<ReturnType<typeof createMember>>;
  let gestor: Awaited<ReturnType<typeof createMember>>;
  let corretor: Awaited<ReturnType<typeof createMember>>;
  let outroCorretor: Awaited<ReturnType<typeof createMember>>;
  let corretorDeOutraImobiliaria: Awaited<ReturnType<typeof createMember>>;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  function signInAs(
    member: Awaited<ReturnType<typeof createMember>>,
    roles: Role[]
  ) {
    sessionTenantId = tenantId;
    sessionRoles = roles;
    sessionUser = { id: member.userId, name: "Sessão T25", email: member.email };
  }

  beforeAll(async () => {
    tenantId = await createTenant("Imobiliária T25");
    outroTenantId = await createTenant("Imobiliária T25 Vizinha");

    admin = await createMember(tenantId, "Administradora T25", ["administrador"]);
    gestor = await createMember(tenantId, "Gestor T25", ["gestor"]);
    corretor = await createMember(tenantId, "Corretor T25", ["corretor"]);
    outroCorretor = await createMember(tenantId, "Outro Corretor T25", [
      "corretor",
    ]);
    corretorDeOutraImobiliaria = await createMember(
      outroTenantId,
      "Corretor Vizinho T25",
      ["corretor"]
    );
  });

  beforeEach(() => {
    warn.mockClear();
  });

  afterAll(async () => {
    warn.mockRestore();
    if (createdUserIds.length > 0) {
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  // AC1: o corretor salva a própria janela.
  it("corretor salva a própria janela: dias e horários gravados no vínculo", async () => {
    signInAs(corretor, ["corretor"]);

    const result = await saveWorkWindowAction({
      memberId: corretor.memberId,
      days: [1, 2, 3, 4, 5],
      start: "08:00",
      end: "14:00",
    });

    expect(result).toEqual({ ok: true });

    const saved = await windowOf(corretor.memberId);
    expect(saved.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(saved.workHoursStart).toBe("08:00");
    expect(saved.workHoursEnd).toBe("14:00");
  });

  // AC6: administrador salva a de outro corretor, com o MESMO efeito.
  it("administrador salva a janela de um corretor: mesmo efeito da AC1", async () => {
    signInAs(admin, ["administrador"]);

    const result = await saveWorkWindowAction({
      memberId: outroCorretor.memberId,
      days: [6],
      start: "09:00",
      end: "13:00",
    });

    expect(result).toEqual({ ok: true });

    const saved = await windowOf(outroCorretor.memberId);
    expect(saved.workDays).toEqual([6]);
    expect(saved.workHoursStart).toBe("09:00");
    expect(saved.workHoursEnd).toBe("13:00");
  });

  // AC6: o gestor também — é a diferença para `usuarios/escrever`, que é só do
  // administrador.
  it("gestor salva a janela de um corretor: mesmo efeito", async () => {
    signInAs(gestor, ["gestor"]);

    const result = await saveWorkWindowAction({
      memberId: outroCorretor.memberId,
      days: [2, 4],
      start: "13:00",
      end: "19:00",
    });

    expect(result).toEqual({ ok: true });

    const saved = await windowOf(outroCorretor.memberId);
    expect(saved.workDays).toEqual([2, 4]);
    expect(saved.workHoursStart).toBe("13:00");
    expect(saved.workHoursEnd).toBe("19:00");
  });

  // AC7: recusa no servidor, chamando a action diretamente.
  it("corretor tentando salvar a janela de OUTRO é recusado no servidor, sem gravar nada", async () => {
    const antes = await windowOf(outroCorretor.memberId);
    signInAs(corretor, ["corretor"]);

    const result = await saveWorkWindowAction({
      memberId: outroCorretor.memberId,
      days: [1],
      start: "07:00",
      end: "23:00",
    });

    expect(result).toEqual({
      ok: false,
      error: "Sem permissão para editar a janela de trabalho de outro usuário.",
    });

    const depois = await windowOf(outroCorretor.memberId);
    expect(depois).toEqual(antes);
  });

  // AC3: fim não posterior ao início, com o campo apontado.
  it("recusa fim não posterior ao início apontando o campo, sem gravar", async () => {
    const antes = await windowOf(corretor.memberId);
    signInAs(corretor, ["corretor"]);

    const result = await saveWorkWindowAction({
      memberId: corretor.memberId,
      days: [1, 2],
      start: "18:00",
      end: "09:00",
    });

    expect(result).toEqual({
      ok: false,
      field: "workHoursEnd",
      error: "O horário de fim precisa ser posterior ao de início.",
    });

    expect(await windowOf(corretor.memberId)).toEqual(antes);
  });

  // AC4: nenhum dia selecionado, com o campo apontado.
  it("recusa nenhum dia selecionado apontando o campo, sem gravar", async () => {
    const antes = await windowOf(corretor.memberId);
    signInAs(corretor, ["corretor"]);

    const result = await saveWorkWindowAction({
      memberId: corretor.memberId,
      days: [],
      start: "09:00",
      end: "18:00",
    });

    expect(result).toEqual({
      ok: false,
      field: "workDays",
      error: "Selecione ao menos um dia da semana.",
    });

    expect(await windowOf(corretor.memberId)).toEqual(antes);
  });

  // spec.md — Edge Cases: recurso de outra imobiliária é inexistente.
  it("administrador não alcança o vínculo de outra imobiliária", async () => {
    const antes = await windowOf(corretorDeOutraImobiliaria.memberId);
    signInAs(admin, ["administrador"]);

    const result = await saveWorkWindowAction({
      memberId: corretorDeOutraImobiliaria.memberId,
      days: [1],
      start: "08:00",
      end: "12:00",
    });

    expect(result).toEqual({ ok: false, error: "Usuário não encontrado." });
    expect(await windowOf(corretorDeOutraImobiliaria.memberId)).toEqual(antes);
  });
});
