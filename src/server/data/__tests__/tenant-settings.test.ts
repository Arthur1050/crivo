import "dotenv/config";
import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { tenants } from "../../../db/schema";
import { getTenant, updateTenantSettings } from "../index";

// Fixture PRÓPRIA (não toca nos tenants do seed): `updateTenantSettings` é
// destrutivo por natureza, e os tenants do seed são lidos por outros arquivos
// de teste. Cobre RD-07 AC2/AC3 (redesign-crm-astryx).
const FIXTURE_TENANT_ID = "dddddddd-0000-4000-8000-000000000001";
const NON_EXISTENT_ID = "dddddddd-0000-4000-8000-0000000000ff";

const ORIGINAL = {
  id: FIXTURE_TENANT_ID,
  name: "Imobiliária Fixture Settings",
  agentName: "Agente Fixture",
  supportedModality: "ambos" as const,
  city: "Uberaba",
  state: "MG",
  agentWhatsapp: "+55 34 90000-1111",
  website: "https://fixture.test",
  agentPresentationMessage: "Mensagem original de apresentação.",
};

const REQUIRED = {
  name: ORIGINAL.name,
  agentName: ORIGINAL.agentName,
  supportedModality: ORIGINAL.supportedModality,
};

describe("server/data — updateTenantSettings estendido (RD-07)", () => {
  beforeEach(async () => {
    await db.delete(tenants).where(eq(tenants.id, FIXTURE_TENANT_ID));
    await db.insert(tenants).values(ORIGINAL);
  });

  afterEach(async () => {
    await db.delete(tenants).where(eq(tenants.id, FIXTURE_TENANT_ID));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("persiste os 5 campos novos junto com os obrigatórios (RD-07 AC2)", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      name: "Imobiliária Renomeada",
      agentName: "Bia",
      supportedModality: "novo",
      city: "Uberlândia",
      state: "MG",
      agentWhatsapp: "+55 34 98888-7777",
      website: "https://renomeada.com.br",
      agentPresentationMessage: "Oi! Sou a Bia, assistente da imobiliária.",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Imobiliária Renomeada");
    expect(updated!.agentName).toBe("Bia");
    expect(updated!.supportedModality).toBe("novo");
    expect(updated!.city).toBe("Uberlândia");
    expect(updated!.state).toBe("MG");
    expect(updated!.agentWhatsapp).toBe("+55 34 98888-7777");
    expect(updated!.website).toBe("https://renomeada.com.br");
    expect(updated!.agentPresentationMessage).toBe(
      "Oi! Sou a Bia, assistente da imobiliária."
    );
  });

  it("relê do banco os campos novos após o save (RD-07 AC2 — reflete após reload)", async () => {
    await updateTenantSettings(FIXTURE_TENANT_ID, {
      ...REQUIRED,
      city: "Araxá",
      state: "MG",
      agentWhatsapp: "+55 34 97777-6666",
      website: "https://araxa.test",
      agentPresentationMessage: "Mensagem nova.",
    });

    const reread = await getTenant(FIXTURE_TENANT_ID);
    expect(reread!.city).toBe("Araxá");
    expect(reread!.state).toBe("MG");
    expect(reread!.agentWhatsapp).toBe("+55 34 97777-6666");
    expect(reread!.website).toBe("https://araxa.test");
    expect(reread!.agentPresentationMessage).toBe("Mensagem nova.");
  });

  it("string vazia em campo opcional persiste null, sem erro de validação (RD-07 AC3)", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      ...REQUIRED,
      city: "",
      state: "",
      agentWhatsapp: "",
      website: "",
      agentPresentationMessage: "",
    });

    expect(updated).not.toBeNull();
    expect(updated!.city).toBeNull();
    expect(updated!.state).toBeNull();
    expect(updated!.agentWhatsapp).toBeNull();
    expect(updated!.website).toBeNull();
    expect(updated!.agentPresentationMessage).toBeNull();
    // Os obrigatórios continuam gravados normalmente no mesmo save.
    expect(updated!.name).toBe(ORIGINAL.name);
    expect(updated!.agentName).toBe(ORIGINAL.agentName);
    expect(updated!.supportedModality).toBe(ORIGINAL.supportedModality);
  });

  it("campo opcional só com espaços em branco também persiste null (RD-07 AC3)", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      ...REQUIRED,
      city: "   ",
      agentPresentationMessage: "\n\t  ",
    });

    expect(updated!.city).toBeNull();
    expect(updated!.agentPresentationMessage).toBeNull();
  });

  it("null explícito em campo opcional persiste null (RD-07 AC3)", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      ...REQUIRED,
      website: null,
    });

    expect(updated!.website).toBeNull();
  });

  it("normaliza espaços nas bordas dos campos opcionais preenchidos", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      ...REQUIRED,
      city: "  Patos de Minas  ",
    });

    expect(updated!.city).toBe("Patos de Minas");
  });

  it("chave opcional ausente deixa a coluna intocada (compatibilidade com chamadores atuais)", async () => {
    const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
      name: "Somente Obrigatórios",
      agentName: "Agente Fixture",
      supportedModality: "usado",
    });

    expect(updated!.name).toBe("Somente Obrigatórios");
    expect(updated!.supportedModality).toBe("usado");
    expect(updated!.city).toBe(ORIGINAL.city);
    expect(updated!.state).toBe(ORIGINAL.state);
    expect(updated!.agentWhatsapp).toBe(ORIGINAL.agentWhatsapp);
    expect(updated!.website).toBe(ORIGINAL.website);
    expect(updated!.agentPresentationMessage).toBe(
      ORIGINAL.agentPresentationMessage
    );
  });

  it("retorna null para um tenant inexistente, mesmo com os campos novos no payload", async () => {
    const result = await updateTenantSettings(NON_EXISTENT_ID, {
      ...REQUIRED,
      city: "Qualquer",
    });

    expect(result).toBeNull();
  });

  // lote-6 — CONF-05: horário comercial do tenant (dias + janela), exposto
  // ao agente via GET /api/v1/settings. Mesmo padrão SPG-1 já pinado acima
  // para os campos de identidade (chave ausente não toca; null limpa; valor
  // grava), agora exercitado para os 3 campos novos.
  describe("horário comercial (CONF-05)", () => {
    it("persiste os 3 campos de horário comercial", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        meetingDays: [1, 2, 3, 4, 5],
        meetingHoursStart: "09:00",
        meetingHoursEnd: "18:00",
      });

      expect(updated).not.toBeNull();
      expect(updated!.meetingDays).toEqual([1, 2, 3, 4, 5]);
      expect(updated!.meetingHoursStart).toBe("09:00");
      expect(updated!.meetingHoursEnd).toBe("18:00");
    });

    it("relê do banco o horário comercial após o save (reflete após reload)", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        meetingDays: [6],
        meetingHoursStart: "10:00",
        meetingHoursEnd: "14:00",
      });

      const reread = await getTenant(FIXTURE_TENANT_ID);
      expect(reread!.meetingDays).toEqual([6]);
      expect(reread!.meetingHoursStart).toBe("10:00");
      expect(reread!.meetingHoursEnd).toBe("14:00");
    });

    it("null explícito nos 3 campos limpa as colunas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        meetingDays: [1, 2, 3],
        meetingHoursStart: "08:00",
        meetingHoursEnd: "17:00",
      });

      const cleared = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        meetingDays: null,
        meetingHoursStart: null,
        meetingHoursEnd: null,
      });

      expect(cleared).not.toBeNull();
      expect(cleared!.meetingDays).toBeNull();
      expect(cleared!.meetingHoursStart).toBeNull();
      expect(cleared!.meetingHoursEnd).toBeNull();
    });

    it("chave ausente dos campos de horário comercial deixa as colunas intocadas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        meetingDays: [2, 4],
        meetingHoursStart: "09:30",
        meetingHoursEnd: "16:30",
      });

      // Segundo save SEM as 3 chaves de horário — só os campos obrigatórios.
      const untouched = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
      });

      expect(untouched).not.toBeNull();
      expect(untouched!.meetingDays).toEqual([2, 4]);
      expect(untouched!.meetingHoursStart).toBe("09:30");
      expect(untouched!.meetingHoursEnd).toBe("16:30");
    });
  });
});
