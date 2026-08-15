import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { brokers, leads } from "../../db/schema";
import {
  getBrokers,
  getDocumentCategories,
  getDocuments,
  getLead,
  getLeads,
  getTenant,
  getTenants,
} from "../data";

// `getActiveTenantId()` (chamada internamente por toda action) lê o cookie
// `crivo_tenant` via `next/headers`'s `cookies()` — API só utilizável dentro
// de um request scope real do Next.js. Fora dele (como aqui, em Vitest puro),
// `cookies()` lança "called outside a request scope". Mockamos para sempre
// devolver um cookie ausente, o que faz `getActiveTenantId()` cair no
// fallback documentado (design.md — Error Handling Strategy): o primeiro
// tenant retornado por `getTenants()` — ainda um tenant real, lido do banco
// seedado, não um mock de dados.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));

// `revalidatePath()` também exige um request/render scope do Next.js
// ("Invariant: static generation store missing"). Mockamos como um spy para
// além de não lançar, também podermos verificar que as actions chamam a
// invalidação de cache esperada.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import {
  createDocumentAction,
  createDocumentCategoryAction,
  deleteDocumentAction,
  deleteDocumentCategoryAction,
  updateDocumentAction,
  updateDocumentCategoryAction,
  type CreateDocumentInput,
} from "../actions/documents";
import {
  setMeetingAttendanceAction,
  updateLeadBrokerAction,
  updateLeadStatusAction,
  type SetMeetingAttendanceInput,
  type UpdateLeadBrokerInput,
  type UpdateLeadStatusInput,
} from "../actions/pipeline";
import {
  updateTenantSettingsAction,
  type UpdateTenantSettingsInput,
} from "../actions/settings";

const NON_EXISTENT_ID = "00000000-0000-4000-8000-000000000099";

describe("server actions", () => {
  let activeTenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    const tenants = await getTenants();
    expect(tenants.length).toBeGreaterThanOrEqual(2);
    // Com o mock acima, getActiveTenantId() sempre resolve para o primeiro
    // tenant retornado por getTenants() (fallback por cookie ausente).
    activeTenantId = tenants[0].id;
    otherTenantId = tenants[1].id;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("updateTenantSettingsAction", () => {
    it("persiste no tenant ativo (happy path) e chama revalidatePath('/configuracoes')", async () => {
      const original = await getTenant(activeTenantId);
      expect(original).not.toBeNull();

      const result = await updateTenantSettingsAction({
        name: "Nome Via Action",
        agentName: "Agente Via Action",
        supportedModality: "usado",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.name).toBe("Nome Via Action");
      expect(persisted!.agentName).toBe("Agente Via Action");
      expect(persisted!.supportedModality).toBe("usado");
      expect(revalidatePath).toHaveBeenCalledWith("/configuracoes");

      // Reverte para não afetar o seed usado por outros testes/batches.
      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
      });
      expect(revertResult.ok).toBe(true);
    });

    it("nome vazio (após trim) retorna { ok: false, error } e nada é persistido", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: "   ",
        agentName: "Agente Válido",
        supportedModality: "ambos",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();

      const after = await getTenant(activeTenantId);
      expect(after!.name).toBe(original!.name);
      expect(after!.agentName).toBe(original!.agentName);
      expect(after!.supportedModality).toBe(original!.supportedModality);
    });

    it("um tenantId injetado no payload é ignorado — a action sempre grava no tenant ativo, nunca no id informado", async () => {
      const activeOriginal = await getTenant(activeTenantId);
      const otherOriginal = await getTenant(otherTenantId);

      // `tenantId` não existe em `UpdateTenantSettingsInput` — o cast prova,
      // em runtime, que mesmo anexando esse campo a action não o lê em
      // nenhum ponto (getActiveTenantId() é a única fonte de tenant).
      const payloadWithForeignTenant = {
        name: "Tentativa Cross-Tenant",
        agentName: activeOriginal!.agentName,
        supportedModality: activeOriginal!.supportedModality,
        tenantId: otherTenantId,
      } as UpdateTenantSettingsInput & { tenantId: string };

      const result = await updateTenantSettingsAction(payloadWithForeignTenant);
      expect(result).toEqual({ ok: true });

      const activeAfter = await getTenant(activeTenantId);
      const otherAfter = await getTenant(otherTenantId);
      expect(activeAfter!.name).toBe("Tentativa Cross-Tenant");
      expect(otherAfter!.name).toBe(otherOriginal!.name);

      const revertResult = await updateTenantSettingsAction({
        name: activeOriginal!.name,
        agentName: activeOriginal!.agentName,
        supportedModality: activeOriginal!.supportedModality,
      });
      expect(revertResult.ok).toBe(true);
    });

    // redesign-crm-astryx — RD-07 AC2: a action é o único caminho entre o
    // form de Configurações e `updateTenantSettings`; um campo de identidade
    // não repassado nunca chegaria ao banco, mesmo com a DAL correta.
    it("repassa os 5 campos de identidade novos para o banco (RD-07 AC2)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        city: "Uberaba",
        state: "MG",
        agentWhatsapp: "+55 34 90000-0000",
        website: "https://exemplo.com.br",
        agentPresentationMessage: "Olá! Sou o agente virtual desta imobiliária.",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.city).toBe("Uberaba");
      expect(persisted!.state).toBe("MG");
      expect(persisted!.agentWhatsapp).toBe("+55 34 90000-0000");
      expect(persisted!.website).toBe("https://exemplo.com.br");
      expect(persisted!.agentPresentationMessage).toBe(
        "Olá! Sou o agente virtual desta imobiliária."
      );

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        city: original!.city,
        state: original!.state,
        agentWhatsapp: original!.agentWhatsapp,
        website: original!.website,
        agentPresentationMessage: original!.agentPresentationMessage,
      });
      expect(revertResult.ok).toBe(true);
    });

    // redesign-crm-astryx — RD-07 AC3: limpar um campo opcional no form envia
    // string vazia; isso precisa apagar a coluna, sem erro de validação.
    it("persiste null quando um campo opcional chega vazio, sem erro de validação (RD-07 AC3)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        city: "",
        state: "   ",
        agentWhatsapp: "",
        website: "",
        agentPresentationMessage: "",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.city).toBeNull();
      expect(persisted!.state).toBeNull();
      expect(persisted!.agentWhatsapp).toBeNull();
      expect(persisted!.website).toBeNull();
      expect(persisted!.agentPresentationMessage).toBeNull();

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        city: original!.city,
        state: original!.state,
        agentWhatsapp: original!.agentWhatsapp,
        website: original!.website,
        agentPresentationMessage: original!.agentPresentationMessage,
      });
      expect(revertResult.ok).toBe(true);
    });

    // lote-6 — CONF-05: horário comercial repassado pela action e validado
    // (validateBusinessHours) antes de chegar à DAL do T1.
    it("persiste o horário comercial (dias + janela) e relê após o save (CONF-05)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: [1, 3, 5],
        meetingHoursStart: "09:00",
        meetingHoursEnd: "17:30",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.meetingDays).toEqual([1, 3, 5]);
      expect(persisted!.meetingHoursStart).toBe("09:00");
      expect(persisted!.meetingHoursEnd).toBe("17:30");

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: original!.meetingDays,
        meetingHoursStart: original!.meetingHoursStart,
        meetingHoursEnd: original!.meetingHoursEnd,
      });
      expect(revertResult.ok).toBe(true);
    });

    // lote-6b — PER-03: tom de voz repassado pela action e validado
    // (validateAgentVoiceTone, máx. 500 chars) antes de chegar à DAL do T1.
    it("persiste agentVoiceTone e relê após o save (PER-03 AC2)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: "Direto, bem-humorado, sem enrolação.",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.agentVoiceTone).toBe(
        "Direto, bem-humorado, sem enrolação."
      );

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: original!.agentVoiceTone,
      });
      expect(revertResult.ok).toBe(true);
    });

    it("agentVoiceTone vazio persiste null (PER-03 AC3)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: "",
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.agentVoiceTone).toBeNull();

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: original!.agentVoiceTone,
      });
      expect(revertResult.ok).toBe(true);
    });

    it("agentVoiceTone acima de 500 caracteres retorna { ok: false, error } e NADA é persistido (PER-03 AC5)", async () => {
      const original = await getTenant(activeTenantId);
      const tooLong = "x".repeat(501);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: tooLong,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();

      const after = await getTenant(activeTenantId);
      expect(after!.agentVoiceTone).toBe(original!.agentVoiceTone);
    });

    it("agentVoiceTone com exatamente 500 caracteres é aceito (limite inclusivo)", async () => {
      const original = await getTenant(activeTenantId);
      const exactly500 = "y".repeat(500);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: exactly500,
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getTenant(activeTenantId);
      expect(persisted!.agentVoiceTone).toBe(exactly500);

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        agentVoiceTone: original!.agentVoiceTone,
      });
      expect(revertResult.ok).toBe(true);
    });

    it("início >= fim no horário comercial retorna { ok: false, error } e nada é persistido (CONF-05 AC3 — validação de bounds)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: [1, 2],
        meetingHoursStart: "18:00",
        meetingHoursEnd: "09:00",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();

      const after = await getTenant(activeTenantId);
      expect(after!.meetingDays).toEqual(original!.meetingDays);
      expect(after!.meetingHoursStart).toBe(original!.meetingHoursStart);
      expect(after!.meetingHoursEnd).toBe(original!.meetingHoursEnd);
    });

    it("0 dias selecionados com janela preenchida retorna { ok: false, error } e nada é persistido (CONF-05 AC3)", async () => {
      const original = await getTenant(activeTenantId);

      const result = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: [],
        meetingHoursStart: "09:00",
        meetingHoursEnd: "18:00",
      });
      expect(result.ok).toBe(false);

      const after = await getTenant(activeTenantId);
      expect(after!.meetingDays).toEqual(original!.meetingDays);
      expect(after!.meetingHoursStart).toBe(original!.meetingHoursStart);
      expect(after!.meetingHoursEnd).toBe(original!.meetingHoursEnd);
    });

    it("null explícito nos 3 campos de horário comercial limpa a configuração via action (CONF-05)", async () => {
      const original = await getTenant(activeTenantId);

      // Primeiro configura, depois limpa — prova que a action encaminha
      // `null` (não só valores) até a DAL, igual aos campos de identidade.
      await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: [2, 4],
        meetingHoursStart: "10:00",
        meetingHoursEnd: "16:00",
      });

      const cleared = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: null,
        meetingHoursStart: null,
        meetingHoursEnd: null,
      });
      expect(cleared).toEqual({ ok: true });

      const after = await getTenant(activeTenantId);
      expect(after!.meetingDays).toBeNull();
      expect(after!.meetingHoursStart).toBeNull();
      expect(after!.meetingHoursEnd).toBeNull();

      const revertResult = await updateTenantSettingsAction({
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
        meetingDays: original!.meetingDays,
        meetingHoursStart: original!.meetingHoursStart,
        meetingHoursEnd: original!.meetingHoursEnd,
      });
      expect(revertResult.ok).toBe(true);
    });
  });

  describe("updateLeadStatusAction", () => {
    let fixtureLeadId: string;

    beforeAll(async () => {
      // lote-7 — REAL-01: só `crivo-demo` recebe lead fictício no seed a
      // partir daqui; `activeTenantId` (tenants[0], resolvido pelo fallback
      // real de `getActiveTenantId()` sem cookie) pode ser um tenant-piloto
      // sem nenhum lead. Este describe insere sua própria fixture mínima no
      // tenant ativo (limpa no afterAll) para continuar exercitando o
      // fallback real sem depender do seed ter lead ali.
      fixtureLeadId = randomUUID();
      await db.insert(leads).values({
        id: fixtureLeadId,
        tenantId: activeTenantId,
        name: "Lead Fixture Actions",
        phone: "+55 34 90000-6666",
        status: "em_qualificacao",
        firstContactAt: new Date(),
      });
    });

    afterAll(async () => {
      await db.delete(leads).where(eq(leads.id, fixtureLeadId));
    });

    it("persiste o novo status no tenant ativo (happy path) e chama revalidatePath('/pipeline') — reverte ao final", async () => {
      const [lead] = await getLeads(activeTenantId);
      expect(lead).toBeDefined();
      const originalStatus = lead.status;
      const nextStatus =
        originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano";

      const result = await updateLeadStatusAction({
        leadId: lead.id,
        status: nextStatus,
      });
      expect(result).toEqual({ ok: true });
      expect(revalidatePath).toHaveBeenCalledWith("/pipeline");

      const persisted = await getLead(activeTenantId, lead.id);
      expect(persisted!.status).toBe(nextStatus);

      const revertResult = await updateLeadStatusAction({
        leadId: lead.id,
        status: originalStatus,
      });
      expect(revertResult.ok).toBe(true);
    });

    // lote-5 — INT-04: a trava humana (patchLead) depende deste registro
    // existir; sem ele, o agente poderia sobrescrever uma decisão humana.
    it("grava status_changed_by='humano' ao mover o lead pelo Kanban (INT-04 AC4 — fundação da trava humana)", async () => {
      const [lead] = await getLeads(activeTenantId);
      expect(lead).toBeDefined();
      const originalStatus = lead.status;
      const nextStatus =
        originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano";

      const result = await updateLeadStatusAction({
        leadId: lead.id,
        status: nextStatus,
      });
      expect(result).toEqual({ ok: true });

      const persisted = await getLead(activeTenantId, lead.id);
      expect(persisted!.statusChangedBy).toBe("humano");

      await updateLeadStatusAction({ leadId: lead.id, status: originalStatus });
    });

    it("status fora do enum retorna { ok: false, error } e nada é persistido", async () => {
      const [lead] = await getLeads(activeTenantId);
      expect(lead).toBeDefined();
      const originalStatus = lead.status;

      const result = await updateLeadStatusAction({
        leadId: lead.id,
        status: "status_inventado",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();

      const unchanged = await getLead(activeTenantId, lead.id);
      expect(unchanged!.status).toBe(originalStatus);
    });

    it("leadId inexistente retorna { ok: false, error: 'Lead não encontrado.' }", async () => {
      const result = await updateLeadStatusAction({
        leadId: NON_EXISTENT_ID,
        status: "em_qualificacao",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Lead não encontrado.");
    });

    it("um leadId de outro tenant é tratado como não encontrado — a action nunca escreve fora do tenant ativo", async () => {
      const [leadOther] = await getLeads(otherTenantId);
      expect(leadOther).toBeDefined();
      const originalStatus = leadOther.status;

      const result = await updateLeadStatusAction({
        leadId: leadOther.id,
        status:
          originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano",
      });
      expect(result.ok).toBe(false);

      const unchanged = await getLead(otherTenantId, leadOther.id);
      expect(unchanged!.status).toBe(originalStatus);
    });

    it("um tenantId injetado no payload é ignorado — a action sempre resolve o tenant ativo pelo cookie", async () => {
      const [lead] = await getLeads(activeTenantId);
      expect(lead).toBeDefined();
      const originalStatus = lead.status;
      const nextStatus =
        originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano";

      const payloadWithForeignTenant = {
        leadId: lead.id,
        status: nextStatus,
        tenantId: otherTenantId,
      } as UpdateLeadStatusInput & { tenantId: string };

      const result = await updateLeadStatusAction(payloadWithForeignTenant);
      expect(result).toEqual({ ok: true });

      const persisted = await getLead(activeTenantId, lead.id);
      expect(persisted!.status).toBe(nextStatus);

      await updateLeadStatusAction({ leadId: lead.id, status: originalStatus });
    });
  });

  // lote-7 — ATRIB-02/KPI-02 (T8): actions de corretor e comparecimento,
  // mesmo molde de updateLeadStatusAction (tenant pelo cookie, revalidação de
  // '/pipeline', falha explícita quando a DAL nega a escrita).
  describe("updateLeadBrokerAction / setMeetingAttendanceAction", () => {
    let fixtureLeadId: string;
    let brokerActiveId: string;
    let brokerOtherId: string;

    beforeAll(async () => {
      fixtureLeadId = randomUUID();
      await db.insert(leads).values({
        id: fixtureLeadId,
        tenantId: activeTenantId,
        name: "Lead Fixture Broker Attendance",
        phone: "+55 34 90000-7777",
        status: "em_qualificacao",
        firstContactAt: new Date(),
      });

      // Corretores existentes do tenant ativo/outro (seed já semeia
      // corretores em todo tenant — lote-7 REAL-01 AC2), com fallback de
      // criação para o caso raro de um tenant sem nenhum.
      const activeBrokers = await getBrokers(activeTenantId);
      brokerActiveId = activeBrokers[0]?.id ?? (await createFixtureBroker(activeTenantId));

      const otherBrokers = await getBrokers(otherTenantId);
      brokerOtherId = otherBrokers[0]?.id ?? (await createFixtureBroker(otherTenantId));
    });

    afterAll(async () => {
      await db.delete(leads).where(eq(leads.id, fixtureLeadId));
    });

    async function createFixtureBroker(tenantId: string): Promise<string> {
      const id = randomUUID();
      await db.insert(brokers).values({
        id,
        tenantId,
        name: "Corretor Fixture Actions",
        phone: "+55 34 90000-8888",
        email: `${id}@fixture.test`,
      });
      return id;
    }

    describe("updateLeadBrokerAction", () => {
      it("sucesso persiste o corretor no tenant ativo e chama revalidatePath('/pipeline')", async () => {
        const result = await updateLeadBrokerAction({
          leadId: fixtureLeadId,
          brokerId: brokerActiveId,
        });
        expect(result).toEqual({ ok: true });
        expect(revalidatePath).toHaveBeenCalledWith("/pipeline");

        const persisted = await getLead(activeTenantId, fixtureLeadId);
        expect(persisted!.brokerId).toBe(brokerActiveId);
      });

      it("DAL devolvendo null (corretor de outro tenant) produz falha explícita, campo error preenchido", async () => {
        const before = await getLead(activeTenantId, fixtureLeadId);

        const result = await updateLeadBrokerAction({
          leadId: fixtureLeadId,
          brokerId: brokerOtherId,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeTruthy();

        const after = await getLead(activeTenantId, fixtureLeadId);
        expect(after!.brokerId).toBe(before!.brokerId);
      });

      it("um tenantId injetado no payload é ignorado — a action sempre resolve o tenant ativo pelo cookie", async () => {
        const payloadWithForeignTenant = {
          leadId: fixtureLeadId,
          brokerId: brokerActiveId,
          tenantId: otherTenantId,
        } as UpdateLeadBrokerInput & { tenantId: string };

        const result = await updateLeadBrokerAction(payloadWithForeignTenant);
        expect(result).toEqual({ ok: true });

        const persisted = await getLead(activeTenantId, fixtureLeadId);
        expect(persisted!.brokerId).toBe(brokerActiveId);
      });
    });

    describe("setMeetingAttendanceAction", () => {
      it("sucesso persiste 'true' no tenant ativo e chama revalidatePath('/pipeline')", async () => {
        const result = await setMeetingAttendanceAction({
          leadId: fixtureLeadId,
          attended: true,
        });
        expect(result).toEqual({ ok: true });
        expect(revalidatePath).toHaveBeenCalledWith("/pipeline");

        const persisted = await getLead(activeTenantId, fixtureLeadId);
        expect(persisted!.meetingAttended).toBe(true);
      });

      it("persiste 'false' e depois 'null' (os três estados via action)", async () => {
        await setMeetingAttendanceAction({ leadId: fixtureLeadId, attended: false });
        expect((await getLead(activeTenantId, fixtureLeadId))!.meetingAttended).toBe(
          false
        );

        await setMeetingAttendanceAction({ leadId: fixtureLeadId, attended: null });
        expect(
          (await getLead(activeTenantId, fixtureLeadId))!.meetingAttended
        ).toBeNull();
      });

      it("DAL devolvendo null (lead de outro tenant) produz falha explícita, campo error preenchido", async () => {
        const [leadOther] = await getLeads(otherTenantId);
        expect(leadOther).toBeDefined();
        const before = await getLead(otherTenantId, leadOther.id);

        const result = await setMeetingAttendanceAction({
          leadId: leadOther.id,
          attended: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeTruthy();

        const after = await getLead(otherTenantId, leadOther.id);
        expect(after!.meetingAttended).toBe(before!.meetingAttended);
      });

      it("nenhuma das duas actions aceita tenantId por parâmetro — tenant vem sempre do cookie (AD-007)", () => {
        // Prova estrutural (não de runtime): os tipos de input não declaram
        // `tenantId` nenhum. Os dois testes acima ("tenantId injetado no
        // payload é ignorado") já provam o comportamento em runtime.
        const brokerInput: UpdateLeadBrokerInput = {
          leadId: fixtureLeadId,
          brokerId: brokerActiveId,
        };
        const attendanceInput: SetMeetingAttendanceInput = {
          leadId: fixtureLeadId,
          attended: null,
        };
        expect("tenantId" in brokerInput).toBe(false);
        expect("tenantId" in attendanceInput).toBe(false);
      });
    });
  });

  describe("createDocumentAction / updateDocumentAction / deleteDocumentAction", () => {
    it("cria um documento no tenant ativo (happy path) e chama revalidatePath('/documentos')", async () => {
      const name = `Doc Action ${randomUUID()}.pdf`;
      const result = await createDocumentAction({
        name,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
      });
      expect(result).toEqual({ ok: true });

      const [created] = await getDocuments(activeTenantId, { search: name });
      expect(created).toBeDefined();
      expect(created.tenantId).toBe(activeTenantId);
      expect(revalidatePath).toHaveBeenCalledWith("/documentos");

      await deleteDocumentAction({ documentId: created.id });
    });

    it("MIME type inválido retorna erro e nada é persistido", async () => {
      const name = `Doc Invalido ${randomUUID()}.exe`;
      const result = await createDocumentAction({
        name,
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        modality: "novo",
      });
      expect(result.ok).toBe(false);

      const found = await getDocuments(activeTenantId, { search: name });
      expect(found).toHaveLength(0);
    });

    it("tamanho acima de 10MB retorna erro e nada é persistido", async () => {
      const name = `Doc Grande ${randomUUID()}.pdf`;
      const result = await createDocumentAction({
        name,
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024 + 1,
        modality: "novo",
      });
      expect(result.ok).toBe(false);

      const found = await getDocuments(activeTenantId, { search: name });
      expect(found).toHaveLength(0);
    });

    it("nome vazio retorna erro e nada é persistido", async () => {
      const result = await createDocumentAction({
        name: "   ",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
      });
      expect(result.ok).toBe(false);
    });

    it("atualiza um documento existente no tenant ativo (happy path)", async () => {
      const name = `Doc Original Action ${randomUUID()}.pdf`;
      const created = await createDocumentAction({
        name,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
      });
      expect(created).toEqual({ ok: true });
      const [doc] = await getDocuments(activeTenantId, { search: name });

      const result = await updateDocumentAction({
        documentId: doc.id,
        name: "Doc Renomeado.pdf",
        modality: "ambos",
      });
      expect(result).toEqual({ ok: true });

      const [updated] = await getDocuments(activeTenantId, {
        search: "Doc Renomeado",
      });
      expect(updated.name).toBe("Doc Renomeado.pdf");
      expect(updated.modality).toBe("ambos");

      await deleteDocumentAction({ documentId: doc.id });
    });

    it("updateDocumentAction retorna { ok: false } (not-found) para documento inexistente", async () => {
      const result = await updateDocumentAction({
        documentId: NON_EXISTENT_ID,
        name: "X",
        modality: "novo",
      });
      expect(result.ok).toBe(false);
    });

    it("deleteDocumentAction retorna { ok: false } (not-found) para documento inexistente", async () => {
      const result = await deleteDocumentAction({
        documentId: NON_EXISTENT_ID,
      });
      expect(result.ok).toBe(false);
    });

    it("um tenantId injetado no payload é ignorado — createDocumentAction sempre cria no tenant ativo", async () => {
      const name = `Doc Cross-Tenant Action ${randomUUID()}.pdf`;
      const payloadWithForeignTenant = {
        name,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
        tenantId: otherTenantId,
      } as CreateDocumentInput & { tenantId: string };

      const result = await createDocumentAction(payloadWithForeignTenant);
      expect(result).toEqual({ ok: true });

      const [createdOnActive] = await getDocuments(activeTenantId, {
        search: name,
      });
      const createdOnOther = await getDocuments(otherTenantId, {
        search: name,
      });
      expect(createdOnActive).toBeDefined();
      expect(createdOnOther).toHaveLength(0);

      await deleteDocumentAction({ documentId: createdOnActive.id });
    });
  });

  describe("createDocumentCategoryAction / deleteDocumentCategoryAction", () => {
    it("cria uma categoria no tenant ativo (happy path)", async () => {
      const name = `Categoria Action ${randomUUID()}`;
      const result = await createDocumentCategoryAction({ name });
      expect(result).toEqual({ ok: true });

      const categories = await getDocumentCategories(activeTenantId);
      const created = categories.find((c) => c.name === name);
      expect(created).toBeDefined();

      await deleteDocumentCategoryAction({ categoryId: created!.id });
    });

    it("nome vazio retorna erro e nenhuma categoria é criada", async () => {
      const before = await getDocumentCategories(activeTenantId);
      const result = await createDocumentCategoryAction({ name: "   " });
      expect(result.ok).toBe(false);

      const after = await getDocumentCategories(activeTenantId);
      expect(after).toHaveLength(before.length);
    });

    it("nome duplicado no tenant ativo retorna o erro de domínio propagado pela action (não lança exceção)", async () => {
      const name = `Categoria Duplicada Action ${randomUUID()}`;
      const first = await createDocumentCategoryAction({ name });
      expect(first).toEqual({ ok: true });

      const second = await createDocumentCategoryAction({ name });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error).toBeTruthy();

      const categories = await getDocumentCategories(activeTenantId);
      const created = categories.find((c) => c.name === name);
      expect(created).toBeDefined();
      await deleteDocumentCategoryAction({ categoryId: created!.id });
    });

    it("deleteDocumentCategoryAction retorna { ok: false } (not-found) para categoria inexistente", async () => {
      const result = await deleteDocumentCategoryAction({
        categoryId: NON_EXISTENT_ID,
      });
      expect(result.ok).toBe(false);
    });

    it("cria uma categoria sem cor com o default 'gray' (lote-3 — CAT-01)", async () => {
      const name = `Categoria Action Sem Cor ${randomUUID()}`;
      const result = await createDocumentCategoryAction({ name });
      expect(result).toEqual({ ok: true });

      const categories = await getDocumentCategories(activeTenantId);
      const created = categories.find((c) => c.name === name);
      expect(created).toBeDefined();
      expect(created!.color).toBe("gray");

      await deleteDocumentCategoryAction({ categoryId: created!.id });
    });

    it("cria uma categoria com cor explícita e ela persiste (lote-3 — CAT-01)", async () => {
      const name = `Categoria Action Com Cor ${randomUUID()}`;
      const result = await createDocumentCategoryAction({ name, color: "teal" });
      expect(result).toEqual({ ok: true });

      const categories = await getDocumentCategories(activeTenantId);
      const created = categories.find((c) => c.name === name);
      expect(created).toBeDefined();
      expect(created!.color).toBe("teal");

      await deleteDocumentCategoryAction({ categoryId: created!.id });
    });

    it("cor fora da paleta retorna { ok: false, error } e nenhuma categoria é criada (lote-3 — CAT-01.2)", async () => {
      const name = `Categoria Action Cor Invalida ${randomUUID()}`;
      const before = await getDocumentCategories(activeTenantId);

      const result = await createDocumentCategoryAction({
        name,
        color: "magenta",
      });
      expect(result.ok).toBe(false);

      const after = await getDocumentCategories(activeTenantId);
      expect(after).toHaveLength(before.length);
      expect(after.some((c) => c.name === name)).toBe(false);
    });
  });

  describe("updateDocumentCategoryAction", () => {
    it("atualiza a cor de uma categoria existente (happy path) e chama revalidatePath('/documentos')", async () => {
      const created = await createDocumentCategoryAction({
        name: `Categoria Update Cor Action ${randomUUID()}`,
      });
      expect(created).toEqual({ ok: true });
      const categories = await getDocumentCategories(activeTenantId);
      const category = categories.find((c) =>
        c.name.startsWith("Categoria Update Cor Action")
      );
      expect(category).toBeDefined();

      const result = await updateDocumentCategoryAction({
        categoryId: category!.id,
        color: "purple",
      });
      expect(result).toEqual({ ok: true });
      expect(revalidatePath).toHaveBeenCalledWith("/documentos");

      const reread = await getDocumentCategories(activeTenantId).then((rows) =>
        rows.find((c) => c.id === category!.id)
      );
      expect(reread!.color).toBe("purple");

      await deleteDocumentCategoryAction({ categoryId: category!.id });
    });

    it("cor fora da paleta retorna { ok: false, error } e nada é persistido", async () => {
      const created = await createDocumentCategoryAction({
        name: `Categoria Update Cor Invalida ${randomUUID()}`,
      });
      expect(created).toEqual({ ok: true });
      const categories = await getDocumentCategories(activeTenantId);
      const category = categories.find((c) =>
        c.name.startsWith("Categoria Update Cor Invalida")
      );
      expect(category).toBeDefined();

      const result = await updateDocumentCategoryAction({
        categoryId: category!.id,
        color: "invalida",
      });
      expect(result.ok).toBe(false);

      const reread = await getDocumentCategories(activeTenantId).then((rows) =>
        rows.find((c) => c.id === category!.id)
      );
      expect(reread!.color).toBe("gray");

      await deleteDocumentCategoryAction({ categoryId: category!.id });
    });

    it("retorna { ok: false } (not-found) para categoria inexistente", async () => {
      const result = await updateDocumentCategoryAction({
        categoryId: NON_EXISTENT_ID,
        color: "blue",
      });
      expect(result.ok).toBe(false);
    });
  });
});
