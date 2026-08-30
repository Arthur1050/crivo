import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../db";
import {
  integrationRefusals,
  leads,
  tenant_members,
  tenantApiKeys,
  tenants,
  users,
} from "../../../../db/schema";
import { updateLeadStatus } from "../../../data";
import { PATCH } from "../../../../../app/api/v1/leads/[id]/route";

/**
 * `PATCH /api/v1/leads/{id}` — atribuição no agendamento e no escalonamento
 * (tasks.md — T28; spec.md ATRIB-02, ATRIB-03; AD-022).
 *
 * Imobiliárias PRÓPRIAS deste arquivo, separadas das de `leads-patch.test.ts`:
 * lá os tenants não têm corretor nenhum, e é assim que os testes de máquina de
 * estados daquele arquivo continuam medindo exatamente o que mediam antes.
 *
 * Datas com offset explícito de America/Sao_Paulo. 2026-08-24 é segunda.
 */

const MANHA = { days: [1, 2, 3, 4, 5], start: "08:00", end: "14:00" };
const TARDE = { days: [1, 2, 3, 4, 5], start: "14:00", end: "19:00" };

/** Segunda 10:00-10:30 — coberto pela manhã, fora da tarde. */
const SLOT = new Date("2026-08-24T10:00:00-03:00");
/** Segunda 11:00-11:30 — também coberto pela manhã, e livre das outras provas. */
const SLOT_CORRIDA = new Date("2026-08-24T11:00:00-03:00");
/** Sábado — fora de qualquer janela seg-sex. */
const SLOT_FORA_DE_JANELA = new Date("2026-08-29T10:00:00-03:00");

describe("routes: PATCH /api/v1/leads/[id] — atribuição por agenda", () => {
  let tenantId: string;
  let semCorretorTenantId: string;
  let apiKey: string;
  let semCorretorApiKey: string;
  let manhaUserId: string;
  let tardeUserId: string;
  const manhaEmail = `manha-${randomUUID()}@fixture.test`;
  const tardeEmail = `tarde-${randomUUID()}@fixture.test`;
  const createdUserIds: string[] = [];

  async function createTenant(name: string): Promise<{ id: string; key: string }> {
    const id = randomUUID();
    await db.insert(tenants).values({
      id,
      name: `${name} ${id}`,
      agentName: "Agente Atribuição",
      supportedModality: "ambos",
      slug: `fixture-${id}`,
    });
    const key = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: id,
      label: "leads-patch-atribuicao.test.ts",
      keyHash: createHash("sha256").update(key).digest("hex"),
    });
    return { id, key };
  }

  async function createBroker(
    organizationId: string,
    name: string,
    email: string,
    window: { days: number[]; start: string; end: string } | null,
    options: { deactivated?: boolean; role?: string } = {}
  ): Promise<string> {
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, name, email });
    createdUserIds.push(userId);
    await db.insert(tenant_members).values({
      organizationId,
      userId,
      role: options.role ?? "corretor",
      workDays: window?.days ?? null,
      workHoursStart: window?.start ?? null,
      workHoursEnd: window?.end ?? null,
      deactivatedAt: options.deactivated ? new Date() : null,
    });
    return userId;
  }

  async function createLead(
    forTenantId: string,
    status: "em_qualificacao" | "qualificado_agendado" | "escalado_humano" = "em_qualificacao"
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId: forTenantId,
      name: "Lead Atribuição",
      phone: "+55 34 90000-0000",
      status,
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    return id;
  }

  function callPatch(leadId: string, body: unknown, key = apiKey) {
    const request = new Request(`http://local/api/v1/leads/${leadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    return PATCH(request, { params: Promise.resolve({ id: leadId }) });
  }

  async function readLead(leadId: string) {
    const rows = await db.select().from(leads).where(eq(leads.id, leadId));
    return rows[0];
  }

  beforeAll(async () => {
    const principal = await createTenant("Tenant Atribuição");
    tenantId = principal.id;
    apiKey = principal.key;

    const semCorretor = await createTenant("Tenant Sem Corretor");
    semCorretorTenantId = semCorretor.id;
    semCorretorApiKey = semCorretor.key;

    manhaUserId = await createBroker(tenantId, "Corretora Manhã", manhaEmail, MANHA);
    tardeUserId = await createBroker(tenantId, "Corretor Tarde", tardeEmail, TARDE);

    // A imobiliária sem corretor ATIVO tem gente — só ninguém elegível.
    await createBroker(
      semCorretorTenantId,
      "Gestor Sem Carteira",
      `gestor-${randomUUID()}@fixture.test`,
      MANHA,
      { role: "gestor" }
    );
    await createBroker(
      semCorretorTenantId,
      "Corretor Desativado",
      `desativado-${randomUUID()}@fixture.test`,
      MANHA,
      { deactivated: true }
    );
  });

  afterAll(async () => {
    const tenantIds = [tenantId, semCorretorTenantId];
    // integration_refusals precisa sumir ANTES do tenant — FK sem
    // onDelete, um tenant com recusa pendurada nunca deleta (lote-9 — T12).
    await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db
      .delete(tenantApiKeys)
      .where(inArray(tenantApiKeys.tenantId, tenantIds));
    await db
      .delete(tenant_members)
      .where(inArray(tenant_members.organizationId, tenantIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.$client.end();
  });

  // ATRIB-02 AC2/AC3/AC4 — caminho feliz.
  it("agendamento devolve o corretor escolhido e grava a reunião (200)", async () => {
    const leadId = await createLead(tenantId);

    const response = await callPatch(leadId, {
      status: "qualificado_agendado",
      meetingAt: SLOT.toISOString(),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    // AC4: o chamador recebe QUEM ficou — nome e e-mail, para convidar ao
    // evento do calendário.
    expect(body.assignedBroker).toEqual({
      name: "Corretora Manhã",
      email: manhaEmail,
    });
    expect(body.status).toBe("qualificado_agendado");
    expect(body.meetingAt).toBe(SLOT.toISOString());

    // AC4 (metade negativa): a lista de candidatos NUNCA sai do CRM. O outro
    // corretor da imobiliária não aparece em lugar nenhum da resposta, nem o
    // id interno do escolhido.
    const payload = JSON.stringify(body);
    expect(payload).not.toContain(tardeEmail);
    expect(payload).not.toContain(tardeUserId);
    expect(payload).not.toContain(manhaUserId);

    const saved = await readLead(leadId);
    expect(saved.assignedUserId).toBe(manhaUserId);
    expect(saved.meetingAt).toEqual(SLOT);
  });

  // ATRIB-02 AC5.
  it("nenhum corretor cobre o horário: 409 sem-corretor-disponivel e nada é gravado", async () => {
    const leadId = await createLead(tenantId);

    const response = await callPatch(leadId, {
      status: "qualificado_agendado",
      meetingAt: SLOT_FORA_DE_JANELA.toISOString(),
      executiveSummary: "Resumo que não pode ser gravado.",
    });

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const body = await response.json();
    expect(body.code).toBe("sem-corretor-disponivel");

    // A reunião não foi criada — e nem o resto do patch entrou.
    const saved = await readLead(leadId);
    expect(saved.meetingAt).toBeNull();
    expect(saved.assignedUserId).toBeNull();
    expect(saved.status).toBe("em_qualificacao");
    expect(saved.executiveSummary).toBeNull();

    // lote-9 — SAUDE-01/T12: a rota instrumentada grava a recusa com o
    // código correto e o tenant que autenticou a chamada.
    const refusals = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantId));
    expect(
      refusals.some((r) => r.code === "sem-corretor-disponivel" && r.status === 409)
    ).toBe(true);
  });

  // ATRIB-02 AC7 — o código do perdedor da corrida, de forma determinística:
  // uma transação aberta reserva o slot e segura o lock; a requisição
  // concorrente escolhe o mesmo corretor (a reserva não confirmada é invisível
  // em read committed) e trava no índice único até a reserva confirmar.
  it("agendamento que perde a corrida pelo mesmo intervalo: 409 conflito-de-agenda", async () => {
    const leadReservado = await createLead(tenantId);
    const leadPerdedor = await createLead(tenantId);

    let liberar!: () => void;
    const portao = new Promise<void>((resolve) => {
      liberar = resolve;
    });

    const reserva = db.transaction(async (tx) => {
      await tx
        .update(leads)
        .set({ assignedUserId: manhaUserId, meetingAt: SLOT_CORRIDA })
        .where(eq(leads.id, leadReservado));
      await portao;
    });

    await waitFor(async () => {
      const abertas = await db.execute(
        sql`select count(*)::int as n from pg_locks where granted and locktype = 'transactionid'`
      );
      return Number((abertas.rows[0] as { n: number }).n) > 0;
    });

    const perdedor = callPatch(leadPerdedor, {
      status: "qualificado_agendado",
      meetingAt: SLOT_CORRIDA.toISOString(),
    });

    const bloqueou = await waitFor(async () => {
      const espera = await db.execute(
        sql`select count(*)::int as n from pg_stat_activity
            where wait_event_type = 'Lock' and state = 'active'`
      );
      return Number((espera.rows[0] as { n: number }).n) > 0;
    });

    liberar();
    await reserva;

    const response = await perdedor;
    expect(bloqueou).toBe(true);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("conflito-de-agenda");

    // Só uma reunião existe naquele corretor e instante.
    const comReuniao = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        sql`${leads.tenantId} = ${tenantId} and ${leads.assignedUserId} = ${manhaUserId} and ${leads.meetingAt} = ${SLOT_CORRIDA}`
      );
    expect(comReuniao).toHaveLength(1);
    expect(comReuniao[0].id).toBe(leadReservado);

    // lote-9 — SAUDE-01/T12: a rota instrumentada grava a recusa com o
    // código correto e o tenant que autenticou a chamada.
    const refusals = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantId));
    expect(
      refusals.some((r) => r.code === "conflito-de-agenda" && r.status === 409)
    ).toBe(true);
  });

  // ATRIB-03 AC1/AC2.
  it("escalonamento sem responsável atribui na mesma operação que grava o status", async () => {
    const leadId = await createLead(tenantId);

    const response = await callPatch(leadId, {
      status: "escalado_humano",
      escalationReason: "Lead pediu corretor humano.",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("escalado_humano");
    expect(body.assignedBroker).toMatchObject({ email: expect.any(String) });

    const saved = await readLead(leadId);
    expect(saved.status).toBe("escalado_humano");
    expect(saved.assignedUserId).not.toBeNull();
    expect([manhaUserId, tardeUserId]).toContain(saved.assignedUserId);
  });

  // ATRIB-03 AC4.
  it("imobiliária sem corretor ativo registra o escalonamento com o lead sem responsável", async () => {
    const leadId = await createLead(semCorretorTenantId);

    const response = await callPatch(
      leadId,
      {
        status: "escalado_humano",
        escalationReason: "Ninguém para atender.",
      },
      semCorretorApiKey
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("escalado_humano");
    expect(body.assignedBroker).toBeUndefined();

    const saved = await readLead(leadId);
    expect(saved.status).toBe("escalado_humano");
    expect(saved.assignedUserId).toBeNull();
  });

  // ATRIB-03 AC6: a trava humana continua valendo, com o mesmo código — e
  // recusa ANTES de qualquer atribuição.
  it("lead travado por humano continua recusado com lead-travado-por-humano, sem atribuir ninguém", async () => {
    const leadId = await createLead(tenantId);
    await updateLeadStatus(tenantId, leadId, "em_qualificacao", "humano");

    const response = await callPatch(leadId, {
      status: "escalado_humano",
      escalationReason: "Tentativa do agente sobre lead travado.",
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("lead-travado-por-humano");

    const saved = await readLead(leadId);
    expect(saved.assignedUserId).toBeNull();
    expect(saved.status).toBe("em_qualificacao");
    expect(saved.escalationReason).toBeNull();
  });
});

/** Espera uma condição do banco ficar verdadeira, com teto de tempo. */
async function waitFor(
  condition: () => Promise<boolean>,
  attempts = 60,
  intervalMs = 50
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
