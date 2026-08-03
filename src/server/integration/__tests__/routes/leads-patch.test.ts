import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { leads, tenantApiKeys, tenants } from "../../../../db/schema";
import { updateLeadStatus } from "../../../data";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/leads/[id]/route";
import { MAX_BODY_BYTES } from "../../parsers";

describe("routes: PATCH /api/v1/leads/[id]", () => {
  // Dois tenants PRÓPRIOS (A e B) — nunca os do seed — para provar o
  // isolamento cross-tenant (INT-01 AC3) sem risco de poluir o snapshot do
  // seed usado por outros arquivos de teste.
  let tenantAId: string;
  let apiKeyA: string;
  let tenantBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A leads-patch ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B leads-patch ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "leads-patch.test.ts",
      keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
    });
  });

  afterAll(async () => {
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  async function createLead(
    tenantId: string,
    status: "em_qualificacao" | "qualificado_agendado" | "escalado_humano" = "em_qualificacao"
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Teste PATCH",
      phone: "+55 34 90000-0000",
      status,
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    return id;
  }

  function makeRequest(
    leadId: string,
    body: unknown,
    opts?: { apiKey?: string; raw?: string }
  ): Request {
    return new Request(`http://local/api/v1/leads/${leadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.apiKey !== undefined
          ? opts.apiKey
            ? { Authorization: `Bearer ${opts.apiKey}` }
            : {}
          : { Authorization: `Bearer ${apiKeyA}` }),
      },
      body: opts?.raw ?? JSON.stringify(body),
    });
  }

  function callPatch(leadId: string, body: unknown, opts?: { apiKey?: string }) {
    return PATCH(makeRequest(leadId, body, opts), {
      params: Promise.resolve({ id: leadId }),
    });
  }

  it(
    "sequência completa do Independent Test da spec: qualificar → escalar sem motivo (409) → " +
      "escalar com motivo (200) → tentar sair de escalado_humano via API (409) → humano move " +
      "no Kanban → API tenta mudar status (409 lead-travado-por-humano), mas PATCH só de campos passa (200)",
    async () => {
      const leadId = await createLead(tenantAId, "em_qualificacao");

      // 1. Qualificar (só campos, sem status) → 200.
      const qualifyRes = await callPatch(leadId, {
        region: "Centro",
        budgetCents: 350000,
        propertyType: "apartamento",
        motivation: "morador",
        creditStatus: "pre_aprovado",
        purchaseHorizon: "30 dias",
        executiveSummary: "Lead qualificado via API.",
      });
      expect(qualifyRes.status).toBe(200);
      const qualifyBody = await qualifyRes.json();
      expect(qualifyBody.region).toBe("Centro");
      expect(qualifyBody.status).toBe("em_qualificacao");

      // 2. Escalar sem escalationReason → 409 motivo-escalonamento-obrigatorio.
      const escalateNoReasonRes = await callPatch(leadId, {
        status: "escalado_humano",
      });
      expect(escalateNoReasonRes.status).toBe(409);
      const escalateNoReasonBody = await escalateNoReasonRes.json();
      expect(escalateNoReasonBody.code).toBe("motivo-escalonamento-obrigatorio");

      // 3. Escalar com escalationReason → 200, status vira escalado_humano.
      const escalateRes = await callPatch(leadId, {
        status: "escalado_humano",
        escalationReason: "Lead pediu corretor humano.",
      });
      expect(escalateRes.status).toBe(200);
      const escalateBody = await escalateRes.json();
      expect(escalateBody.status).toBe("escalado_humano");
      expect(escalateBody.escalationReason).toBe("Lead pediu corretor humano.");

      // 4. Tentar sair de escalado_humano via API → 409 transicao-invalida
      // (a tabela de transições não permite nenhum destino a partir daqui).
      const unlockAttemptRes = await callPatch(leadId, {
        status: "qualificado_agendado",
      });
      expect(unlockAttemptRes.status).toBe(409);
      const unlockAttemptBody = await unlockAttemptRes.json();
      expect(unlockAttemptBody.code).toBe("transicao-invalida");

      // 5. Humano move o lead pelo Kanban de volta para em_qualificacao
      // (fora da API — mesmo mecanismo do PipelineBoard).
      const afterHumanMove = await updateLeadStatus(
        tenantAId,
        leadId,
        "em_qualificacao",
        "humano"
      );
      expect(afterHumanMove!.statusChangedBy).toBe("humano");

      // 6. API tenta mudar status (transição válida na tabela a partir de
      // em_qualificacao) → 409 lead-travado-por-humano, porque um humano
      // mexeu por último.
      const blockedByHumanRes = await callPatch(leadId, {
        status: "qualificado_agendado",
      });
      expect(blockedByHumanRes.status).toBe(409);
      const blockedByHumanBody = await blockedByHumanRes.json();
      expect(blockedByHumanBody.code).toBe("lead-travado-por-humano");

      // 7. PATCH só de campos (sem status) continua aceito mesmo travado.
      const fieldsOnlyRes = await callPatch(leadId, { region: "Bairro Novo" });
      expect(fieldsOnlyRes.status).toBe(200);
      const fieldsOnlyBody = await fieldsOnlyRes.json();
      expect(fieldsOnlyBody.region).toBe("Bairro Novo");
      expect(fieldsOnlyBody.status).toBe("em_qualificacao");
    }
  );

  it("chave do tenant A sobre lead do tenant B responde 404, nunca 403 (INT-01 AC3)", async () => {
    const leadOfB = await createLead(tenantBId, "em_qualificacao");
    const response = await callPatch(leadOfB, { region: "Tentativa Cross-Tenant" });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("lead inexistente responde 404 recurso-nao-encontrado", async () => {
    const response = await callPatch(randomUUID(), { region: "X" });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("null explícito limpa a coluna; chave ausente no mesmo patch preserva o valor anterior (SPG-1 na rota)", async () => {
    const leadId = await createLead(tenantAId, "em_qualificacao");

    const setupRes = await callPatch(leadId, {
      region: "Região Original",
      executiveSummary: "Resumo original",
    });
    expect(setupRes.status).toBe(200);

    // region: null → limpa; executiveSummary ausente → preserva.
    const clearRes = await callPatch(leadId, { region: null });
    expect(clearRes.status).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody.region).toBeNull();
    expect(clearBody.executiveSummary).toBe("Resumo original");
  });

  it("payload inválido (enum fora do domínio) responde 400 e não grava nada", async () => {
    const leadId = await createLead(tenantAId, "em_qualificacao");
    const response = await callPatch(leadId, { modality: "modalidade_invalida" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");

    const rows = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(rows[0].modality).toBeNull();
  });

  it("corpo maior que o limite responde 413 corpo-grande-demais", async () => {
    const leadId = await createLead(tenantAId, "em_qualificacao");
    const hugeValue = "x".repeat(MAX_BODY_BYTES + 1);
    const request = makeRequest(leadId, undefined, {
      raw: JSON.stringify({ executiveSummary: hugeValue }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: leadId }) });
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.code).toBe("corpo-grande-demais");
  });

  it("sem header Authorization responde 401", async () => {
    const leadId = await createLead(tenantAId, "em_qualificacao");
    const response = await callPatch(leadId, { region: "X" }, { apiKey: "" });
    expect(response.status).toBe(401);
  });

  it("verbo não suportado (GET/POST/PUT/DELETE) responde 405 problem+json", async () => {
    for (const handler of [GET, POST, PUT, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });
});
