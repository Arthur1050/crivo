import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../../../../app/api/v1/leads/[id]/route";
import { POST } from "../../../../app/api/v1/leads/route";
import { LEAD_STATUS } from "../../../lib/vocabulary";
import { realEstate } from "../../../verticals/real-estate";
import { createIntegrationKit } from "../kit";

const data = vi.hoisted(() => ({
  getLead: vi.fn(),
  serviceScope: vi.fn((tenantId: string) => ({ tenantId })),
  assignForAppointment: vi.fn(),
  assignForEscalation: vi.fn(),
  updateLeadFromAgent: vi.fn(),
  createAgentLead: vi.fn(),
  recordIntegrationRefusal: vi.fn(),
}));

vi.mock("../../data", () => data);
vi.mock("../auth", () => ({ authenticate: async () => ({ tenantId: "tenant-1" }) }));
vi.mock("../../../kit/integration", async () => {
  const { createIntegrationKit } = await import("../kit");
  const { testVertical } = await import("../../../vertical-kit/__tests__/fixture-vertical");
  return createIntegrationKit(testVertical);
});

const leadId = "00000000-0000-4000-8000-000000000001";
const lead = {
  id: leadId, name: "Pessoa", status: LEAD_STATUS.engaged,
  firstContactAt: new Date("2026-08-01T00:00:00Z"),
  region: "Região gravada", budgetCents: 76543n, modality: "novo", propertyType: "casa",
  purchaseHorizon: "seis meses", motivation: "investidor", creditStatus: "fgts", chainedOperation: true,
};

function patchRequest(body: object) {
  return PATCH(new Request(`http://local/api/v1/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: leadId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  data.getLead.mockResolvedValue(lead);
  data.updateLeadFromAgent.mockResolvedValue(lead);
  data.assignForAppointment.mockResolvedValue({ ok: true, assigneeId: null, lead });
  data.assignForEscalation.mockResolvedValue({ ok: true, assigneeId: null, lead });
  data.createAgentLead.mockResolvedValue({ created: true, lead });
});

describe("costura de qualificação — QUAL-01 e QUAL-02", () => {
  it.each([
    ["modality", "usado"], ["region", "Zona Norte"], ["budgetCents", 67890123],
    ["propertyType", "apartamento"], ["purchaseHorizon", "dois meses"], ["motivation", "morador"],
    ["creditStatus", "pre_aprovado"], ["chainedOperation", false],
  ])("recusa o campo %s sem faceta, incluindo null e valor inválido", async (field, value) => {
    for (const input of [value, null, []]) {
      const response = await patchRequest({ [field]: input });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "urn:acme:problem:payload-invalido", detail: `Campo '${field}' inválido.`,
      });
    }
    expect(data.getLead).not.toHaveBeenCalled();
    expect(data.updateLeadFromAgent).not.toHaveBeenCalled();
  });

  it("sem faceta, cita o primeiro campo na ordem de LEAD_QUALIFICATION_FIELDS, não a do corpo", async () => {
    const response = await patchRequest({ chainedOperation: true, region: "Centro", budgetCents: 1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      type: "urn:acme:problem:payload-invalido", detail: "Campo 'region' inválido.",
    });
    expect(data.updateLeadFromAgent).not.toHaveBeenCalled();
  });

  it.each([
    ["status", { status: "inexistente" }, /^Campo 'status' inválido\. Valores aceitos: /],
    ["executiveSummary", { executiveSummary: 7 }, /^Campo 'executiveSummary' deve ser uma string\.$/],
    ["escalationReason", { escalationReason: 7 }, /^Campo 'escalationReason' deve ser uma string\.$/],
  ])("sem faceta, a validação de %s vem antes da recusa do campo de qualificação", async (_, core, detail) => {
    const response = await patchRequest({ ...core, region: "Centro" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ type: "urn:acme:problem:payload-invalido" });
    expect(body.detail).toMatch(detail);
    expect(data.updateLeadFromAgent).not.toHaveBeenCalled();
  });

  it("aceita status sem qualificação e omite os dados gravados do JSON", async () => {
    const response = await patchRequest({ status: LEAD_STATUS.goal_reached });
    expect(response.status).toBe(200);
    expect(data.updateLeadFromAgent).toHaveBeenCalledWith("tenant-1", leadId, {
      status: LEAD_STATUS.goal_reached,
    });
    const body = await response.json();
    expect(body).toMatchObject({ id: leadId, name: "Pessoa" });
    for (const field of ["modality", "region", "budgetCents", "propertyType", "purchaseHorizon", "motivation", "creditStatus", "chainedOperation"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("ignora os campos de qualificação na criação do lead", async () => {
    const response = await POST(new Request("http://local/api/v1/leads", {
      method: "POST",
      body: JSON.stringify({
        name: "Pessoa nova", phone: "+5534900000000", externalId: "externo-1",
        firstContactAt: "2026-08-01T00:00:00Z", region: "Centro", budgetCents: -100,
      }),
    }), undefined);
    expect(response.status).toBe(201);
    expect(data.createAgentLead).toHaveBeenCalledWith("tenant-1", {
      name: "Pessoa nova", phone: "+5534900000000", externalId: "externo-1",
      firstContactAt: new Date("2026-08-01T00:00:00Z"),
    });
  });

  it.each([
    { core: {}, target: "updateLeadFromAgent", args: [] },
    { core: { meetingAt: "2026-09-01T12:00:00Z" }, target: "assignForAppointment", args: [new Date("2026-09-01T12:00:00Z")] },
    { core: { status: LEAD_STATUS.escalated, escalationReason: "Pedido" }, target: "assignForEscalation", args: [expect.any(Date)] },
  ] as const)("mapeia a qualificação antes da escrita por $target", async ({ core, target, args }) => {
    const facet = realEstate.qualification!;
    const toLeadColumns = vi.fn(facet.toLeadColumns);
    const kit = createIntegrationKit({ ...realEstate, qualification: { ...facet, toLeadColumns } });
    const patch = kit.parseLeadPatch({ ...core, region: "  Centro  ", budgetCents: "34567", chainedOperation: null });
    expect(patch.ok).toBe(true);
    if (!patch.ok) throw new Error(patch.detail);
    const expected = { region: "Centro", budgetCents: 34567n, chainedOperation: null };
    expect(await kit.applyLeadPatch("tenant-1", leadId, patch.dto)).toMatchObject({ ok: true });
    expect(toLeadColumns).toHaveBeenCalledExactlyOnceWith(expected);
    expect(data[target]).toHaveBeenCalledExactlyOnceWith("tenant-1", leadId, ...args, {
      ...("meetingAt" in core ? { appointmentAt: args[0] } : core),
      leadColumns: expected,
    });
  });
});

describe("agendamento opcional no PATCH — APPT-01", () => {
  it.each(["2026-09-02T15:00:00Z", null, "horário inválido"])(
    "recusa meetingAt igual a %s quando o vertical desliga o agendamento",
    async (meetingAt) => {
      const response = await patchRequest({ meetingAt });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "urn:acme:problem:payload-invalido",
        detail: "Campo 'meetingAt' deve ser uma data ISO-8601 válida.",
      });
      expect(data.getLead).not.toHaveBeenCalled();
      expect(data.assignForAppointment).not.toHaveBeenCalled();
      expect(data.assignForEscalation).not.toHaveBeenCalled();
      expect(data.updateLeadFromAgent).not.toHaveBeenCalled();
    }
  );

  it("grava a transição para goal_reached sem horário no vertical de teste", async () => {
    data.updateLeadFromAgent.mockResolvedValue({ ...lead, status: LEAD_STATUS.goal_reached });

    const response = await patchRequest({ status: LEAD_STATUS.goal_reached });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "qualificado_agendado", meetingAt: null });
    expect(data.updateLeadFromAgent).toHaveBeenCalledExactlyOnceWith("tenant-1", leadId, {
      status: LEAD_STATUS.goal_reached,
    });
    expect(data.assignForAppointment).not.toHaveBeenCalled();
    expect(data.assignForEscalation).not.toHaveBeenCalled();
  });

  it("preserva o nulo explícito com o agendamento ligado", () => {
    expect(createIntegrationKit(realEstate).parseLeadPatch({ meetingAt: null }))
      .toEqual({ ok: true, dto: { appointmentAt: null } });
  });
});
