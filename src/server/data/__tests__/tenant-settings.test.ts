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
  supportedSegment: "ambos" as const,
  slug: `fixture-${FIXTURE_TENANT_ID}`,
  city: "Uberaba",
  state: "MG",
  agentWhatsapp: "+55 34 90000-1111",
  website: "https://fixture.test",
  agentPresentationMessage: "Mensagem original de apresentação.",
  agentVoiceTone: "Tom original: direto e caloroso.",
};

const REQUIRED = {
  name: ORIGINAL.name,
  agentName: ORIGINAL.agentName,
  supportedSegment: ORIGINAL.supportedSegment,
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
      supportedSegment: "novo",
      city: "Uberlândia",
      state: "MG",
      agentWhatsapp: "+55 34 98888-7777",
      website: "https://renomeada.com.br",
      agentPresentationMessage: "Oi! Sou a Bia, assistente da imobiliária.",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Imobiliária Renomeada");
    expect(updated!.agentName).toBe("Bia");
    expect(updated!.supportedSegment).toBe("novo");
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
    expect(updated!.supportedSegment).toBe(ORIGINAL.supportedSegment);
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
      supportedSegment: "usado",
    });

    expect(updated!.name).toBe("Somente Obrigatórios");
    expect(updated!.supportedSegment).toBe("usado");
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

  // lote-6b — PER-03: tom de voz/personalidade do agente, exposto ao agente
  // via GET /api/v1/settings. Mesmo padrão SPG-1 de `agentPresentationMessage`
  // (chave ausente não toca; string vazia/só espaços → null; valor grava).
  describe("agentVoiceTone (PER-03)", () => {
    it("persiste o valor e relê do banco após o save", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        agentVoiceTone: "Informal, bem-humorado, frases curtas.",
      });

      expect(updated).not.toBeNull();
      expect(updated!.agentVoiceTone).toBe(
        "Informal, bem-humorado, frases curtas."
      );

      const reread = await getTenant(FIXTURE_TENANT_ID);
      expect(reread!.agentVoiceTone).toBe(
        "Informal, bem-humorado, frases curtas."
      );
    });

    it("string vazia persiste null, sem erro de validação", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        agentVoiceTone: "",
      });

      expect(updated!.agentVoiceTone).toBeNull();
    });

    it("só espaços em branco também persiste null", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        agentVoiceTone: "   \n\t  ",
      });

      expect(updated!.agentVoiceTone).toBeNull();
    });

    it("null explícito persiste null", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        agentVoiceTone: null,
      });

      expect(updated!.agentVoiceTone).toBeNull();
    });

    it("chave ausente deixa a coluna intocada", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        agentVoiceTone: "Tom configurado antes.",
      });

      const untouched = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
      });

      expect(untouched!.agentVoiceTone).toBe("Tom configurado antes.");
    });
  });

  // lote-6 — CONF-05: horário comercial do tenant (dias + janela), exposto
  // ao agente via GET /api/v1/settings. Mesmo padrão SPG-1 já pinado acima
  // para os campos de identidade (chave ausente não toca; null limpa; valor
  // grava), agora exercitado para os 3 campos novos.
  describe("horário comercial (CONF-05)", () => {
    it("persiste os 3 campos de horário comercial", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        appointmentDays: [1, 2, 3, 4, 5],
        appointmentHoursStart: "09:00",
        appointmentHoursEnd: "18:00",
      });

      expect(updated).not.toBeNull();
      expect(updated!.appointmentDays).toEqual([1, 2, 3, 4, 5]);
      expect(updated!.appointmentHoursStart).toBe("09:00");
      expect(updated!.appointmentHoursEnd).toBe("18:00");
    });

    it("relê do banco o horário comercial após o save (reflete após reload)", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        appointmentDays: [6],
        appointmentHoursStart: "10:00",
        appointmentHoursEnd: "14:00",
      });

      const reread = await getTenant(FIXTURE_TENANT_ID);
      expect(reread!.appointmentDays).toEqual([6]);
      expect(reread!.appointmentHoursStart).toBe("10:00");
      expect(reread!.appointmentHoursEnd).toBe("14:00");
    });

    it("null explícito nos 3 campos limpa as colunas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        appointmentDays: [1, 2, 3],
        appointmentHoursStart: "08:00",
        appointmentHoursEnd: "17:00",
      });

      const cleared = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        appointmentDays: null,
        appointmentHoursStart: null,
        appointmentHoursEnd: null,
      });

      expect(cleared).not.toBeNull();
      expect(cleared!.appointmentDays).toBeNull();
      expect(cleared!.appointmentHoursStart).toBeNull();
      expect(cleared!.appointmentHoursEnd).toBeNull();
    });

    it("chave ausente dos campos de horário comercial deixa as colunas intocadas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        appointmentDays: [2, 4],
        appointmentHoursStart: "09:30",
        appointmentHoursEnd: "16:30",
      });

      // Segundo save SEM as 3 chaves de horário — só os campos obrigatórios.
      const untouched = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
      });

      expect(untouched).not.toBeNull();
      expect(untouched!.appointmentDays).toEqual([2, 4]);
      expect(untouched!.appointmentHoursStart).toBe("09:30");
      expect(untouched!.appointmentHoursEnd).toBe("16:30");
    });
  });

  // lote-9 — BASE-01 (T23): cinco baselines pré-piloto, mesmo padrão SPG-1
  // (chave ausente não toca; null limpa; valor grava) dos campos acima.
  describe("baseline do piloto (BASE-01)", () => {
    it("persiste os cinco baselines juntos", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 120,
        baselineFirstResponseMinutes: 5,
        baselineLeadToAppointmentPct: 40,
        baselineEscalationPct: 15,
        baselineAttendancePct: 70,
      });

      expect(updated).not.toBeNull();
      expect(updated!.baselineLeadsPerMonth).toBe(120);
      expect(updated!.baselineFirstResponseMinutes).toBe(5);
      expect(updated!.baselineLeadToAppointmentPct).toBe(40);
      expect(updated!.baselineEscalationPct).toBe(15);
      expect(updated!.baselineAttendancePct).toBe(70);
    });

    it("relê do banco os cinco baselines após o save (reflete após reload)", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 80,
        baselineFirstResponseMinutes: 3,
        baselineLeadToAppointmentPct: 35,
        baselineEscalationPct: 10,
        baselineAttendancePct: 65,
      });

      const reread = await getTenant(FIXTURE_TENANT_ID);
      expect(reread!.baselineLeadsPerMonth).toBe(80);
      expect(reread!.baselineFirstResponseMinutes).toBe(3);
      expect(reread!.baselineLeadToAppointmentPct).toBe(35);
      expect(reread!.baselineEscalationPct).toBe(10);
      expect(reread!.baselineAttendancePct).toBe(65);
    });

    it("zero é um valor válido para os cinco baselines (não é tratado como ausência)", async () => {
      const updated = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 0,
        baselineFirstResponseMinutes: 0,
        baselineLeadToAppointmentPct: 0,
        baselineEscalationPct: 0,
        baselineAttendancePct: 0,
      });

      expect(updated!.baselineLeadsPerMonth).toBe(0);
      expect(updated!.baselineFirstResponseMinutes).toBe(0);
      expect(updated!.baselineLeadToAppointmentPct).toBe(0);
      expect(updated!.baselineEscalationPct).toBe(0);
      expect(updated!.baselineAttendancePct).toBe(0);
    });

    it("null explícito nos cinco baselines limpa as colunas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 100,
        baselineFirstResponseMinutes: 4,
        baselineLeadToAppointmentPct: 30,
        baselineEscalationPct: 12,
        baselineAttendancePct: 60,
      });

      const cleared = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: null,
        baselineFirstResponseMinutes: null,
        baselineLeadToAppointmentPct: null,
        baselineEscalationPct: null,
        baselineAttendancePct: null,
      });

      expect(cleared).not.toBeNull();
      expect(cleared!.baselineLeadsPerMonth).toBeNull();
      expect(cleared!.baselineFirstResponseMinutes).toBeNull();
      expect(cleared!.baselineLeadToAppointmentPct).toBeNull();
      expect(cleared!.baselineEscalationPct).toBeNull();
      expect(cleared!.baselineAttendancePct).toBeNull();
    });

    it("chave ausente dos cinco baselines deixa as colunas intocadas", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 90,
        baselineFirstResponseMinutes: 6,
        baselineLeadToAppointmentPct: 45,
        baselineEscalationPct: 20,
        baselineAttendancePct: 75,
      });

      const untouched = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
      });

      expect(untouched).not.toBeNull();
      expect(untouched!.baselineLeadsPerMonth).toBe(90);
      expect(untouched!.baselineFirstResponseMinutes).toBe(6);
      expect(untouched!.baselineLeadToAppointmentPct).toBe(45);
      expect(untouched!.baselineEscalationPct).toBe(20);
      expect(untouched!.baselineAttendancePct).toBe(75);
    });

    it("salvar UM baseline não altera os outros quatro", async () => {
      await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineLeadsPerMonth: 50,
        baselineFirstResponseMinutes: 2,
        baselineLeadToAppointmentPct: 25,
        baselineEscalationPct: 8,
        baselineAttendancePct: 55,
      });

      const onlyOne = await updateTenantSettings(FIXTURE_TENANT_ID, {
        ...REQUIRED,
        baselineAttendancePct: 90,
      });

      expect(onlyOne).not.toBeNull();
      expect(onlyOne!.baselineAttendancePct).toBe(90);
      // Os outros quatro continuam com o valor do save anterior — a coluna
      // ficou intocada porque a chave não veio neste payload.
      expect(onlyOne!.baselineLeadsPerMonth).toBe(50);
      expect(onlyOne!.baselineFirstResponseMinutes).toBe(2);
      expect(onlyOne!.baselineLeadToAppointmentPct).toBe(25);
      expect(onlyOne!.baselineEscalationPct).toBe(8);
    });
  });
});
