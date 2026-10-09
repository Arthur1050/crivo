import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import { tenants } from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";

/**
 * Configurações da imobiliária e a vitrine (tasks.md — L16a T16; VATIV-01 AC6,
 * VREV-02 AC9, AC10). Imobiliária-fixture própria: os testes de
 * `actions.test.ts` usam a primeira do seed e o seed passa a trazer vitrine ativa
 * (T20), então misturar os dois acoplaria os arquivos.
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
vi.mock("../storefront/schedule", () => ({ scheduleStorefrontRevalidation: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getTenant } from "../data";
import { saveStorefront } from "../data/storefront";
import { updateTenantSettingsAction } from "../actions/settings";
import { scheduleStorefrontRevalidation } from "../storefront/schedule";

const scheduled = vi.mocked(scheduleStorefrontRevalidation);
const createdTenantIds: string[] = [];
const ORIGINAL_WHATSAPP = "5534999990000";

const activeStorefront = {
  active: true, layout: "grade" as const, accentColor: null, font: "inter" as const,
  creci: "CRECI 12345-J", legalName: "Imobiliária Exemplo Ltda", headline: null, about: null,
  instagram: null, phone: null, address: null,
};

async function createTenant(name: string, opts: { storefront?: "ativa" | "inativa" | "nenhuma" } = {}): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id, name, agentName: "Agente Original", supportedModality: "ambos", slug: `fixture-t16-${id}`,
    city: "Uberaba", agentWhatsapp: ORIGINAL_WHATSAPP,
  });
  createdTenantIds.push(id);
  if (opts.storefront === "ativa") await saveStorefront(id, activeStorefront);
  if (opts.storefront === "inativa") await saveStorefront(id, { ...activeStorefront, active: false });
  sessionTenantId = id;
  scheduled.mockClear();
  return id;
}

function settingsInput(tenantName: string, extra: Record<string, unknown> = {}) {
  return {
    name: tenantName,
    agentName: "Agente Original",
    supportedModality: "ambos" as const,
    ...extra,
  };
}

afterEach(async () => {
  sessionRoles = ["administrador"];
  if (createdTenantIds.length > 0) {
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    createdTenantIds.length = 0;
  }
});

afterAll(async () => {
  await db.$client.end();
});

describe("updateTenantSettingsAction e a vitrine (L16a T16)", () => {
  describe("VATIV-01 AC6: vitrine ativa não deixa apagar o WhatsApp do agente", () => {
    it.each([["string vazia", ""], ["só espaços", "   "], ["nulo", null]])(
      "WhatsApp %s → recusa no campo, nenhuma parte das configurações é gravada e nada é agendado",
      async (_label, agentWhatsapp) => {
        const tenantId = await createTenant("T16 Ativa Original", { storefront: "ativa" });

        const result = await updateTenantSettingsAction(
          settingsInput("T16 Nome Novo", { agentWhatsapp, city: "Cidade Nova" })
        );

        expect(result).toEqual({
          ok: false,
          error: "Desative a vitrine antes de remover o WhatsApp do agente.",
          field: "agentWhatsapp",
        });
        const after = await getTenant(tenantId);
        expect(after!.name).toBe("T16 Ativa Original");
        expect(after!.city).toBe("Uberaba");
        expect(after!.agentWhatsapp).toBe(ORIGINAL_WHATSAPP);
        expect(scheduled).not.toHaveBeenCalled();
      }
    );

    it("WhatsApp ausente do payload (coluna intocada) não é recusado", async () => {
      const tenantId = await createTenant("T16 Ausente", { storefront: "ativa" });

      const result = await updateTenantSettingsAction(settingsInput("T16 Ausente Renomeada"));

      expect(result).toEqual({ ok: true });
      const after = await getTenant(tenantId);
      expect(after!.name).toBe("T16 Ausente Renomeada");
      expect(after!.agentWhatsapp).toBe(ORIGINAL_WHATSAPP);
    });

    it("trocar o WhatsApp por outro número é aceito com a vitrine ativa", async () => {
      const tenantId = await createTenant("T16 Troca", { storefront: "ativa" });

      const result = await updateTenantSettingsAction(settingsInput("T16 Troca", { agentWhatsapp: "5511988887777" }));

      expect(result).toEqual({ ok: true });
      expect((await getTenant(tenantId))!.agentWhatsapp).toBe("5511988887777");
    });

    it.each([["vitrine inativa", "inativa"], ["sem linha de vitrine", "nenhuma"]] as const)(
      "%s + WhatsApp vazio → gravado como nulo",
      async (_label, storefront) => {
        const tenantId = await createTenant(`T16 ${storefront}`, { storefront });

        const result = await updateTenantSettingsAction(settingsInput(`T16 ${storefront}`, { agentWhatsapp: "" }));

        expect(result).toEqual({ ok: true });
        expect((await getTenant(tenantId))!.agentWhatsapp).toBeNull();
      }
    );
  });

  describe("VREV-02 AC9 e AC10: aviso de revalidação", () => {
    it("sucesso agenda uma vez com o tenant ativo e revalida a tela", async () => {
      const tenantId = await createTenant("T16 Sucesso");

      const result = await updateTenantSettingsAction(settingsInput("T16 Sucesso Renomeada"));

      expect(result).toEqual({ ok: true });
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(scheduled).toHaveBeenCalledWith(tenantId);
      expect(revalidatePath).toHaveBeenCalledWith("/configuracoes");
    });

    it("recusa por validação não agenda", async () => {
      const tenantId = await createTenant("T16 Validação");

      const result = await updateTenantSettingsAction(settingsInput("   "));

      expect(result.ok).toBe(false);
      expect((await getTenant(tenantId))!.name).toBe("T16 Validação");
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("recusa por permissão não agenda e não grava", async () => {
      const tenantId = await createTenant("T16 Permissão");
      sessionRoles = ["corretor"];

      const result = await updateTenantSettingsAction(settingsInput("T16 Permissão Renomeada"));

      expect(result.ok).toBe(false);
      expect((await getTenant(tenantId))!.name).toBe("T16 Permissão");
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("tenant inexistente (nada atualizado) não agenda", async () => {
      await createTenant("T16 Fantasma");
      sessionTenantId = randomUUID();
      scheduled.mockClear();

      const result = await updateTenantSettingsAction(settingsInput("T16 Fantasma"));

      expect(result).toEqual({ ok: false, error: "Tenant não encontrado." });
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("a gravação acontece antes do agendamento: ao agendar, a mudança já está no banco", async () => {
      const tenantId = await createTenant("T16 Ordem");
      let nameWhenScheduled: string | undefined;
      scheduled.mockImplementationOnce(() => {
        // O espião roda de forma síncrona dentro da action: lê o banco logo depois.
        void db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).then((rows) => {
          nameWhenScheduled = rows[0]?.name;
        });
      });

      await updateTenantSettingsAction(settingsInput("T16 Ordem Renomeada"));
      await vi.waitFor(() => expect(nameWhenScheduled).toBe("T16 Ordem Renomeada"));
    });
  });
});
