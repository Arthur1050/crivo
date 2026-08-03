import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  conversations,
  leads,
  messages,
  tenantApiKeys,
  tenants,
} from "../../../db/schema";
import { getConversations, getLeads, getMessages } from "../../data";
import { POST as createLead } from "../../../../app/api/v1/leads/route";
import { PATCH as patchLead } from "../../../../app/api/v1/leads/[id]/route";
import { POST as postMessage } from "../../../../app/api/v1/leads/[id]/messages/route";

/**
 * Smoke fim-a-fim do contrato (tasks.md — T11; spec.md — Success Criteria):
 * cria lead → qualifica → registra mensagens → escalar, via os MESMOS route
 * handlers que o agente real chamaria (funções, `new Request(...)` — mesmo
 * padrão de T4–T9, sem servidor HTTP), rodado para 2 tenants independentes
 * para provar isolamento também no fluxo completo. A cada etapa, confirma
 * que o Kanban (`getLeads`) e Chats (`getConversationSummaries`/
 * `getMessages`) refletem a escrita — as MESMAS funções de acesso a dado que
 * as telas RSC do CRM usam (AD-007) — sem qualquer mudança de tela.
 *
 * A prova adicional de HTTP real (fetch das páginas `/pipeline` e `/chats`
 * contra um `next start` de produção) e o screenshot do indicador de
 * opt-out são feitos como verificação manual desta mesma task, documentados
 * no relatório do lote — não fazem parte deste arquivo porque exigiriam um
 * servidor de produção sempre no ar só para `npx vitest run` passar, o que
 * quebraria o gate rápido do resto da suíte.
 */
describe("e2e smoke — criar lead → qualificar → mensagens → escalar (2 tenants)", () => {
  interface TestTenant {
    tenantId: string;
    apiKey: string;
  }

  const tenantsUnderTest: TestTenant[] = [];

  beforeAll(async () => {
    for (const label of ["A", "B"]) {
      const tenantId = randomUUID();
      await db.insert(tenants).values({
        id: tenantId,
        name: `Tenant Smoke ${label} ${tenantId}`,
        agentName: `Agente ${label}`,
        supportedModality: "ambos",
      });

      const apiKey = `smoke-key-${label}-${randomUUID()}`;
      await db.insert(tenantApiKeys).values({
        tenantId,
        label: `e2e-smoke.test.ts ${label}`,
        keyHash: createHash("sha256").update(apiKey).digest("hex"),
      });

      tenantsUnderTest.push({ tenantId, apiKey });
    }
  });

  afterAll(async () => {
    for (const { tenantId } of tenantsUnderTest) {
      await db.delete(messages).where(eq(messages.tenantId, tenantId));
      await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
      await db.delete(leads).where(eq(leads.tenantId, tenantId));
      await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await db.$client.end();
  });

  function authHeaders(apiKey: string) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  }

  for (const label of ["A", "B"]) {
    it(`tenant ${label}: fluxo completo via API é refletido em Kanban e Chats sem mudança de tela`, async () => {
      const tenant = tenantsUnderTest[label === "A" ? 0 : 1];
      const externalLeadId = randomUUID();

      // 1. Criar lead — INT-02 AC1.
      const createRes = await createLead(
        new Request("http://local/api/v1/leads", {
          method: "POST",
          headers: authHeaders(tenant.apiKey),
          body: JSON.stringify({
            name: `Lead Smoke ${label}`,
            phone: "+55 34 90000-9999",
            externalId: externalLeadId,
            firstContactAt: "2026-08-01T10:00:00Z",
          }),
        })
      );
      expect(createRes.status).toBe(201);
      const lead = await createRes.json();
      expect(lead.status).toBe("em_qualificacao");

      // Kanban reflete o lead novo, na coluna certa (mesma função que a tela usa).
      const inQualificacao = await getLeads(tenant.tenantId, {
        status: "em_qualificacao",
      });
      expect(inQualificacao.some((l) => l.id === lead.id)).toBe(true);

      // 2. Qualificar (só campos, sem status) — INT-03 AC1.
      const qualifyRes = await patchLead(
        new Request(`http://local/api/v1/leads/${lead.id}`, {
          method: "PATCH",
          headers: authHeaders(tenant.apiKey),
          body: JSON.stringify({
            region: "Centro",
            budgetCents: 450000,
            propertyType: "apartamento",
            motivation: "morador",
            creditStatus: "pre_aprovado",
            purchaseHorizon: "30 dias",
            executiveSummary: "Lead qualificado pelo smoke fim-a-fim.",
          }),
        }),
        { params: Promise.resolve({ id: lead.id }) }
      );
      expect(qualifyRes.status).toBe(200);
      const qualified = await qualifyRes.json();
      expect(qualified.region).toBe("Centro");
      expect(qualified.status).toBe("em_qualificacao");

      // 3. Mensagens — INT-05 AC1.
      const msg1Res = await postMessage(
        new Request(`http://local/api/v1/leads/${lead.id}/messages`, {
          method: "POST",
          headers: authHeaders(tenant.apiKey),
          body: JSON.stringify({
            externalId: randomUUID(),
            sender: "lead",
            content: "Tenho interesse no apartamento do centro.",
            sentAt: "2026-08-01T10:05:00Z",
          }),
        }),
        { params: Promise.resolve({ id: lead.id }) }
      );
      expect(msg1Res.status).toBe(201);

      const msg2Res = await postMessage(
        new Request(`http://local/api/v1/leads/${lead.id}/messages`, {
          method: "POST",
          headers: authHeaders(tenant.apiKey),
          body: JSON.stringify({
            externalId: randomUUID(),
            sender: "agente",
            content: "Perfeito! Vou te conectar com um corretor.",
            sentAt: "2026-08-01T10:06:00Z",
          }),
        }),
        { params: Promise.resolve({ id: lead.id }) }
      );
      expect(msg2Res.status).toBe(201);

      // Chats reflete a conversa e as 2 mensagens em ordem (mesmas funções da tela).
      const conversations = await getConversations(tenant.tenantId);
      const conversation = conversations.find((c) => c.leadId === lead.id);
      expect(conversation).toBeDefined();
      const thread = await getMessages(tenant.tenantId, conversation!.id);
      expect(thread.map((m) => m.content)).toEqual([
        "Tenho interesse no apartamento do centro.",
        "Perfeito! Vou te conectar com um corretor.",
      ]);

      // 4. Escalar para humano — INT-04 AC2.
      const escalateRes = await patchLead(
        new Request(`http://local/api/v1/leads/${lead.id}`, {
          method: "PATCH",
          headers: authHeaders(tenant.apiKey),
          body: JSON.stringify({
            status: "escalado_humano",
            escalationReason: "Lead pediu para falar com um corretor humano.",
          }),
        }),
        { params: Promise.resolve({ id: lead.id }) }
      );
      expect(escalateRes.status).toBe(200);
      const escalated = await escalateRes.json();
      expect(escalated.status).toBe("escalado_humano");

      // Kanban reflete a mudança: saiu de em_qualificacao, entrou em escalado_humano.
      const stillInQualificacao = await getLeads(tenant.tenantId, {
        status: "em_qualificacao",
      });
      expect(stillInQualificacao.some((l) => l.id === lead.id)).toBe(false);
      const inEscalado = await getLeads(tenant.tenantId, {
        status: "escalado_humano",
      });
      expect(inEscalado.some((l) => l.id === lead.id)).toBe(true);
    });
  }

  it("os 2 tenants permanecem isolados: nenhum lead do tenant A aparece nas queries do tenant B", async () => {
    const [tenantA, tenantB] = tenantsUnderTest;
    const leadsOfA = await getLeads(tenantA.tenantId);
    const leadsOfB = await getLeads(tenantB.tenantId);
    const idsA = new Set(leadsOfA.map((l) => l.id));
    const idsB = new Set(leadsOfB.map((l) => l.id));
    const intersection = [...idsA].filter((id) => idsB.has(id));
    expect(intersection).toEqual([]);
  });
});
