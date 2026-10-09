import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../db";
import { properties, tenant_members, tenants, users } from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";

/**
 * Server actions de escrita do catálogo (tasks.md — T8; spec.md IMOV-01/02/
 * 04/05/07). Mesmo harness de `deactivate-actions.test.ts`/
 * `users-actions.test.ts`: identidade fabricada, decisão de permissão real
 * (`authorizeOrThrow`, matriz de `src/lib/permissions.ts`). Cada teste monta a
 * própria imobiliária-fixture (molde de `properties.test.ts` — T6 escrita),
 * porque `createProperty` calcula `sequence` a partir do `max` já existente
 * no tenant — um tenant novo é o único jeito de manter as fixtures previsíveis
 * sem depender do seed.
 */

let sessionRoles: Role[] = ["administrador"];
let sessionTenantId = "";
const sessionUser = { id: "", name: "", email: "" };

vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  const fakeSession = async (): Promise<AuthContext> => ({
    user: sessionUser,
    tenantId: sessionTenantId,
    roles: sessionRoles,
    leadScope: { tenantId: sessionTenantId, assignedUserId: null },
  });
  return {
    ...actual,
    verifySession: fakeSession,
    requirePermission: async (resource: Resource, action: Action) =>
      actual.authorizeOrThrow(await fakeSession(), resource, action),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Lote-16a (VREV-02): o agendamento da revalidação da vitrine é substituído por um
// espião; o que ele faz de verdade é provado em `storefront/__tests__/schedule.test.ts`.
vi.mock("../storefront/schedule", () => ({ scheduleStorefrontRevalidation: vi.fn() }));

import { revalidatePath } from "next/cache";
import { scheduleStorefrontRevalidation } from "../storefront/schedule";
import { getProperties } from "../data";
import {
  createPropertyAction,
  deletePropertyAction,
  setPropertyPublishedAction,
  setPropertyStatusAction,
  updatePropertyAction,
  type CreatePropertyInput,
} from "../actions/properties";

const NON_EXISTENT_ID = "00000000-0000-4000-8000-000000000099";

const createdTenantIds: string[] = [];
const createdUserIds: string[] = [];

async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: `Agente ${name}`,
    supportedModality: "ambos",
    slug: `fixture-t8-${id}`,
  });
  createdTenantIds.push(id);
  return id;
}

async function createMember(
  tenantId: string,
  name: string,
  deactivatedAt: Date | null = null
): Promise<string> {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name,
    email: `${userId}@fixture.test`,
  });
  await db.insert(tenant_members).values({
    organizationId: tenantId,
    userId,
    role: "corretor",
    deactivatedAt,
  });
  createdUserIds.push(userId);
  return userId;
}

/** Remove uma chave de um objeto — usado para simular um campo AUSENTE do
 * payload (IMOV-07 AC5), sem introduzir uma variável descartada e não usada
 * (o que o `delete` numa cópia rasa evita, ao contrário de desestruturar e
 * ignorar o valor). */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const clone = { ...obj };
  delete clone[key];
  return clone;
}

function baseInput(
  capturedByUserId: string,
  overrides: Partial<CreatePropertyInput> = {}
): CreatePropertyInput {
  return {
    capturedByUserId,
    kind: "casa",
    modality: "novo",
    neighborhood: "Centro",
    city: "Uberaba",
    state: "MG",
    priceCents: 100_000_00,
    areaSqm: 80,
    bedrooms: 2,
    bathrooms: 1,
    parkingSpots: 1,
    ...overrides,
  };
}

afterEach(async () => {
  sessionRoles = ["administrador"];
  if (createdTenantIds.length > 0) {
    await db
      .delete(properties)
      .where(inArray(properties.tenantId, createdTenantIds));
    await db
      .delete(tenant_members)
      .where(inArray(tenant_members.organizationId, createdTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    createdTenantIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db
      .delete(tenant_members)
      .where(inArray(tenant_members.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await db.$client.end();
});

describe("server actions properties (T8)", () => {
  describe("createPropertyAction", () => {
    it("cria o imóvel no tenant ativo e chama revalidatePath('/imoveis') (happy path)", async () => {
      const tenantId = await createTenant("T8 Create Happy");
      const capturerId = await createMember(tenantId, "Captador Happy");
      sessionTenantId = tenantId;

      const result = await createPropertyAction(baseInput(capturerId));
      expect(result).toEqual({ ok: true });

      const [row] = await getProperties(tenantId);
      expect(row).toBeDefined();
      expect(row.tenantId).toBe(tenantId);
      expect(row.capturedByUserId).toBe(capturerId);
      expect(revalidatePath).toHaveBeenCalledWith("/imoveis");
    });

    it("captador de outro tenant é recusado, e nenhuma linha é gravada (IMOV-02 AC4)", async () => {
      const tenantId = await createTenant("T8 Create Captador Outro Tenant");
      const otherTenantId = await createTenant("T8 Create Captador Outro Tenant B");
      const foreignCapturerId = await createMember(
        otherTenantId,
        "Captador de Outro Tenant"
      );
      sessionTenantId = tenantId;

      const result = await createPropertyAction(baseInput(foreignCapturerId));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Captador deve ser um membro ativo desta imobiliária."
        );
      }

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("captador desativado é recusado, e nenhuma linha é gravada (IMOV-02 AC4)", async () => {
      const tenantId = await createTenant("T8 Create Captador Desativado");
      const deactivatedCapturerId = await createMember(
        tenantId,
        "Captador Desativado",
        new Date()
      );
      sessionTenantId = tenantId;

      const result = await createPropertyAction(
        baseInput(deactivatedCapturerId)
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Captador deve ser um membro ativo desta imobiliária."
        );
      }

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("kind ausente do payload é recusado como campo vazio, nunca ignorado (IMOV-07 AC5)", async () => {
      const tenantId = await createTenant("T8 Create Kind Ausente");
      const capturerId = await createMember(tenantId, "Captador Kind Ausente");
      sessionTenantId = tenantId;

      const withoutKind = omit(baseInput(capturerId), "kind");
      const result = await createPropertyAction(
        withoutKind as CreatePropertyInput
      );
      expect(result.ok).toBe(false);

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("neighborhood (bairro) ausente do payload é recusado como campo vazio (IMOV-07 AC5)", async () => {
      const tenantId = await createTenant("T8 Create Bairro Ausente");
      const capturerId = await createMember(tenantId, "Captador Bairro Ausente");
      sessionTenantId = tenantId;

      const withoutNeighborhood = omit(baseInput(capturerId), "neighborhood");
      const result = await createPropertyAction(
        withoutNeighborhood as CreatePropertyInput
      );
      expect(result.ok).toBe(false);

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("priceCents ausente do payload é recusado como campo vazio (IMOV-07 AC5)", async () => {
      const tenantId = await createTenant("T8 Create Preco Ausente");
      const capturerId = await createMember(tenantId, "Captador Preco Ausente");
      sessionTenantId = tenantId;

      const withoutPrice = omit(baseInput(capturerId), "priceCents");
      const result = await createPropertyAction(
        withoutPrice as CreatePropertyInput
      );
      expect(result.ok).toBe(false);

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("capturedByUserId ausente do payload é recusado, nunca tratado como membro válido (IMOV-07 AC5)", async () => {
      const tenantId = await createTenant("T8 Create Captador Ausente");
      sessionTenantId = tenantId;

      const withoutCapturer = omit(baseInput(randomUUID()), "capturedByUserId");
      const result = await createPropertyAction(
        withoutCapturer as CreatePropertyInput
      );
      expect(result.ok).toBe(false);

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("um tenantId injetado no payload é ignorado — cria sempre no tenant ativo", async () => {
      const tenantId = await createTenant("T8 Create Tenant Ativo");
      const otherTenantId = await createTenant("T8 Create Tenant Injetado");
      const capturerId = await createMember(tenantId, "Captador Tenant Ativo");
      sessionTenantId = tenantId;

      const payloadWithForeignTenant = {
        ...baseInput(capturerId),
        tenantId: otherTenantId,
      } as CreatePropertyInput & { tenantId: string };

      const result = await createPropertyAction(payloadWithForeignTenant);
      expect(result).toEqual({ ok: true });

      const onActive = await getProperties(tenantId);
      const onOther = await getProperties(otherTenantId);
      expect(onActive).toHaveLength(1);
      expect(onOther).toHaveLength(0);
    });
  });

  describe("updatePropertyAction", () => {
    it("edita um imóvel existente e chama revalidatePath('/imoveis') (happy path)", async () => {
      const tenantId = await createTenant("T8 Update Happy");
      const capturerId = await createMember(tenantId, "Captador Update");
      sessionTenantId = tenantId;
      const created = await createPropertyAction(baseInput(capturerId));
      expect(created).toEqual({ ok: true });
      const [before] = await getProperties(tenantId);

      const result = await updatePropertyAction({
        propertyId: before.id,
        areaSqm: 120,
      });
      expect(result).toEqual({ ok: true });

      const [after] = await getProperties(tenantId);
      expect(after.areaSqm).toBe(120);
      expect(revalidatePath).toHaveBeenCalledWith("/imoveis");
    });

    it("propertyId inexistente retorna { ok: false } (not-found)", async () => {
      const tenantId = await createTenant("T8 Update Inexistente");
      sessionTenantId = tenantId;

      const result = await updatePropertyAction({
        propertyId: NON_EXISTENT_ID,
        areaSqm: 50,
      });
      expect(result.ok).toBe(false);
    });

    it("troca de captador para usuário de outro tenant é recusada, e o imóvel não muda (IMOV-02 AC4)", async () => {
      const tenantId = await createTenant("T8 Update Captador Outro Tenant");
      const otherTenantId = await createTenant(
        "T8 Update Captador Outro Tenant B"
      );
      const capturerId = await createMember(tenantId, "Captador Original");
      const foreignCapturerId = await createMember(
        otherTenantId,
        "Captador Estrangeiro"
      );
      sessionTenantId = tenantId;
      const created = await createPropertyAction(baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      const result = await updatePropertyAction({
        propertyId: before.id,
        capturedByUserId: foreignCapturerId,
      });
      expect(result.ok).toBe(false);

      const [after] = await getProperties(tenantId);
      expect(after.capturedByUserId).toBe(capturerId);
    });
  });

  describe("deletePropertyAction", () => {
    it("remove o imóvel e chama revalidatePath('/imoveis') (happy path)", async () => {
      const tenantId = await createTenant("T8 Delete Happy");
      const capturerId = await createMember(tenantId, "Captador Delete");
      sessionTenantId = tenantId;
      const created = await createPropertyAction(baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      const result = await deletePropertyAction({ propertyId: before.id });
      expect(result).toEqual({ ok: true });

      const rows = await getProperties(tenantId);
      expect(rows.some((p) => p.id === before.id)).toBe(false);
      expect(revalidatePath).toHaveBeenCalledWith("/imoveis");
    });

    it("propertyId inexistente retorna { ok: false } (not-found)", async () => {
      const tenantId = await createTenant("T8 Delete Inexistente");
      sessionTenantId = tenantId;

      const result = await deletePropertyAction({
        propertyId: NON_EXISTENT_ID,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("setPropertyPublishedAction", () => {
    it("altera a publicação sem exigir transição de status, e chama revalidatePath('/imoveis')", async () => {
      const tenantId = await createTenant("T8 Publicacao Happy");
      const capturerId = await createMember(tenantId, "Captador Publicacao");
      sessionTenantId = tenantId;
      const created = await createPropertyAction(
        baseInput(capturerId, { status: "vendido", published: false })
      );
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      const result = await setPropertyPublishedAction({
        propertyId: before.id,
        published: true,
      });
      expect(result).toEqual({ ok: true });

      const [after] = await getProperties(tenantId);
      expect(after.published).toBe(true);
      expect(after.status).toBe("vendido");
      expect(revalidatePath).toHaveBeenCalledWith("/imoveis");
    });
  });

  describe("setPropertyStatusAction", () => {
    it("altera o status livremente, sem tabela de transições (IMOV-05 AC2)", async () => {
      const tenantId = await createTenant("T8 Status Happy");
      const capturerId = await createMember(tenantId, "Captador Status");
      sessionTenantId = tenantId;
      const created = await createPropertyAction(
        baseInput(capturerId, { status: "disponivel" })
      );
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      const result = await setPropertyStatusAction({
        propertyId: before.id,
        status: "vendido",
      });
      expect(result).toEqual({ ok: true });

      const [after] = await getProperties(tenantId);
      expect(after.status).toBe("vendido");
      expect(revalidatePath).toHaveBeenCalledWith("/imoveis");
    });

    it("status inválido é recusado", async () => {
      const tenantId = await createTenant("T8 Status Invalido");
      const capturerId = await createMember(tenantId, "Captador Status Invalido");
      sessionTenantId = tenantId;
      const created = await createPropertyAction(baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      const result = await setPropertyStatusAction({
        propertyId: before.id,
        // @ts-expect-error valor fora do enum, propositalmente, para provar a recusa.
        status: "alugado",
      });
      expect(result.ok).toBe(false);

      const [after] = await getProperties(tenantId);
      expect(after.status).toBe(before.status);
    });
  });

  describe("recusa server-side por permissão — as 5 actions, banco inalterado (IMOV-04 AC3)", () => {
    it("createPropertyAction recusa sessão de corretor, e nada é gravado", async () => {
      const tenantId = await createTenant("T8 Recusa Create");
      const capturerId = await createMember(tenantId, "Captador Recusa Create");
      sessionTenantId = tenantId;
      sessionRoles = ["corretor"];

      const result = await createPropertyAction(baseInput(capturerId));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Sem permissão para escrever imoveis.");

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(0);
    });

    it("updatePropertyAction recusa sessão de corretor, e o imóvel não muda", async () => {
      const tenantId = await createTenant("T8 Recusa Update");
      const capturerId = await createMember(tenantId, "Captador Recusa Update");
      sessionTenantId = tenantId;
      sessionRoles = ["administrador"];
      const created = await createPropertyAction(baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      sessionRoles = ["corretor"];
      const result = await updatePropertyAction({
        propertyId: before.id,
        areaSqm: 999,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Sem permissão para escrever imoveis.");

      const [after] = await getProperties(tenantId);
      expect(after.areaSqm).toBe(before.areaSqm);
    });

    it("deletePropertyAction recusa sessão de corretor, e a linha continua existindo", async () => {
      const tenantId = await createTenant("T8 Recusa Delete");
      const capturerId = await createMember(tenantId, "Captador Recusa Delete");
      sessionTenantId = tenantId;
      sessionRoles = ["administrador"];
      const created = await createPropertyAction(baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      sessionRoles = ["corretor"];
      const result = await deletePropertyAction({ propertyId: before.id });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Sem permissão para escrever imoveis.");

      const rows = await getProperties(tenantId);
      expect(rows.some((p) => p.id === before.id)).toBe(true);
    });

    it("setPropertyPublishedAction recusa sessão de corretor, e a publicação não muda", async () => {
      const tenantId = await createTenant("T8 Recusa Publicacao");
      const capturerId = await createMember(tenantId, "Captador Recusa Publicacao");
      sessionTenantId = tenantId;
      sessionRoles = ["administrador"];
      const created = await createPropertyAction(
        baseInput(capturerId, { published: false })
      );
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      sessionRoles = ["corretor"];
      const result = await setPropertyPublishedAction({
        propertyId: before.id,
        published: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Sem permissão para escrever imoveis.");

      const [after] = await getProperties(tenantId);
      expect(after.published).toBe(false);
    });

    it("setPropertyStatusAction recusa sessão de corretor, e o status não muda", async () => {
      const tenantId = await createTenant("T8 Recusa Status");
      const capturerId = await createMember(tenantId, "Captador Recusa Status");
      sessionTenantId = tenantId;
      sessionRoles = ["administrador"];
      const created = await createPropertyAction(
        baseInput(capturerId, { status: "disponivel" })
      );
      if (!created.ok) throw new Error("unreachable");
      const [before] = await getProperties(tenantId);

      sessionRoles = ["corretor"];
      const result = await setPropertyStatusAction({
        propertyId: before.id,
        status: "vendido",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Sem permissão para escrever imoveis.");

      const [after] = await getProperties(tenantId);
      expect(after.status).toBe("disponivel");
    });
  });
});

describe("revalidação da vitrine nas 5 actions de imóvel (L16a T13 — VREV-02)", () => {
  const scheduled = vi.mocked(scheduleStorefrontRevalidation);

  /** Imobiliária com um imóvel já criado; o espião é zerado depois da preparação. */
  async function tenantWithProperty(name: string) {
    const tenantId = await createTenant(name);
    const capturerId = await createMember(tenantId, `Captador ${name}`);
    sessionTenantId = tenantId;
    const created = await createPropertyAction(baseInput(capturerId));
    if (!created.ok) throw new Error("unreachable");
    const [property] = await getProperties(tenantId);
    scheduled.mockClear();
    return { tenantId, capturerId, propertyId: property.id };
  }

  describe("AC8: sucesso agenda uma vez, com o tenant do imóvel", () => {
    it("createPropertyAction", async () => {
      const tenantId = await createTenant("T13 Create");
      const capturerId = await createMember(tenantId, "Captador T13 Create");
      sessionTenantId = tenantId;
      scheduled.mockClear();

      expect(await createPropertyAction(baseInput(capturerId))).toEqual({ ok: true });

      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
    });

    it("updatePropertyAction", async () => {
      const { tenantId, propertyId } = await tenantWithProperty("T13 Update");
      expect(await updatePropertyAction({ propertyId, areaSqm: 120 })).toEqual({ ok: true });
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
    });

    it("deletePropertyAction", async () => {
      const { tenantId, propertyId } = await tenantWithProperty("T13 Delete");
      expect(await deletePropertyAction({ propertyId })).toEqual({ ok: true });
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
    });

    it("setPropertyPublishedAction", async () => {
      const { tenantId, propertyId } = await tenantWithProperty("T13 Publish");
      expect(await setPropertyPublishedAction({ propertyId, published: true })).toEqual({ ok: true });
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
    });

    it("setPropertyStatusAction", async () => {
      const { tenantId, propertyId } = await tenantWithProperty("T13 Status");
      expect(await setPropertyStatusAction({ propertyId, status: "vendido" })).toEqual({ ok: true });
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
    });
  });

  describe("AC10: recusa por validação não agenda", () => {
    it("createPropertyAction com campo obrigatório vazio", async () => {
      const tenantId = await createTenant("T13 Create Invalido");
      const capturerId = await createMember(tenantId, "Captador T13 Create Invalido");
      sessionTenantId = tenantId;
      scheduled.mockClear();

      const result = await createPropertyAction(baseInput(capturerId, { neighborhood: "   " }));

      expect(result.ok).toBe(false);
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("updatePropertyAction com área inválida", async () => {
      const { propertyId } = await tenantWithProperty("T13 Update Invalido");
      const result = await updatePropertyAction({ propertyId, areaSqm: -5 });
      expect(result.ok).toBe(false);
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("setPropertyStatusAction com status fora do enum", async () => {
      const { propertyId } = await tenantWithProperty("T13 Status Invalido");
      const result = await setPropertyStatusAction({
        propertyId,
        // @ts-expect-error valor fora do enum, propositalmente, para provar a recusa.
        status: "alugado",
      });
      expect(result.ok).toBe(false);
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("imóvel inexistente em update, delete, publicação e status", async () => {
      await tenantWithProperty("T13 Inexistente");
      expect((await updatePropertyAction({ propertyId: NON_EXISTENT_ID, areaSqm: 120 })).ok).toBe(false);
      expect((await deletePropertyAction({ propertyId: NON_EXISTENT_ID })).ok).toBe(false);
      expect((await setPropertyPublishedAction({ propertyId: NON_EXISTENT_ID, published: true })).ok).toBe(false);
      expect((await setPropertyStatusAction({ propertyId: NON_EXISTENT_ID, status: "vendido" })).ok).toBe(false);
      expect(scheduled).not.toHaveBeenCalled();
    });
  });

  describe("AC10: recusa por permissão não agenda (sessão de corretor)", () => {
    it("as 5 actions", async () => {
      const { capturerId, propertyId } = await tenantWithProperty("T13 Permissao");
      sessionRoles = ["corretor"];

      const results = [
        await createPropertyAction(baseInput(capturerId)),
        await updatePropertyAction({ propertyId, areaSqm: 120 }),
        await deletePropertyAction({ propertyId }),
        await setPropertyPublishedAction({ propertyId, published: true }),
        await setPropertyStatusAction({ propertyId, status: "vendido" }),
      ];

      for (const result of results) expect(result.ok).toBe(false);
      expect(scheduled).not.toHaveBeenCalled();
    });
  });
});
