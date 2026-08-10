import { describe, expect, it } from "vitest";
import {
  MAX_BODY_BYTES,
  parseLeadCreate,
  parseLeadPatch,
  parseMessageCreate,
  parseMessagesQuery,
} from "../parsers";

function urlWithQuery(query?: string): URL {
  return new URL(`http://local/api/v1/leads/lead-fixo/messages${query ?? ""}`);
}

describe("server/integration parsers", () => {
  it("exporta MAX_BODY_BYTES = 100 KB (design.md — Tech Decisions)", () => {
    expect(MAX_BODY_BYTES).toBe(100 * 1024);
  });

  describe("parseLeadCreate", () => {
    const validPayload = {
      name: "Ana Souza",
      phone: "+55 34 90000-0000",
      externalId: "wa_id_123",
      firstContactAt: "2026-08-01T10:00:00Z",
    };

    it("aceita um payload válido e devolve o DTO tipado (INT-02 AC1)", () => {
      const result = parseLeadCreate(validPayload);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.name).toBe("Ana Souza");
      expect(result.dto.phone).toBe("+55 34 90000-0000");
      expect(result.dto.externalId).toBe("wa_id_123");
      expect(result.dto.firstContactAt).toBeInstanceOf(Date);
      expect(result.dto.firstContactAt.toISOString()).toBe(
        "2026-08-01T10:00:00.000Z"
      );
    });

    it("apara espaços do name/phone/externalId", () => {
      const result = parseLeadCreate({
        ...validPayload,
        name: "  Ana Souza  ",
        phone: "  +55 34 90000-0000  ",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.name).toBe("Ana Souza");
      expect(result.dto.phone).toBe("+55 34 90000-0000");
    });

    it("rejeita quando o corpo não é um objeto JSON", () => {
      const result = parseLeadCreate("não é objeto");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toBeTruthy();
    });

    it.each([
      ["name", { ...validPayload, name: undefined }],
      ["name (vazio)", { ...validPayload, name: "   " }],
      ["phone", { ...validPayload, phone: undefined }],
      ["externalId", { ...validPayload, externalId: undefined }],
      ["firstContactAt", { ...validPayload, firstContactAt: undefined }],
    ])("rejeita quando '%s' está ausente/vazio (campo ausente)", (_label, payload) => {
      const result = parseLeadCreate(payload);
      expect(result.ok).toBe(false);
    });

    it("rejeita firstContactAt em formato não-ISO", () => {
      const result = parseLeadCreate({
        ...validPayload,
        firstContactAt: "01/08/2026",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("firstContactAt");
    });

    it("rejeita firstContactAt com data inválida mesmo em formato ISO (32 de agosto)", () => {
      const result = parseLeadCreate({
        ...validPayload,
        firstContactAt: "2026-08-32T10:00:00Z",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("parseLeadPatch", () => {
    it("chave ausente no JSON não entra no DTO — coluna correspondente fica intocada (SPG-1)", () => {
      const result = parseLeadPatch({ region: "Centro" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect("region" in result.dto).toBe(true);
      expect("executiveSummary" in result.dto).toBe(false);
      expect(result.dto.executiveSummary).toBeUndefined();
    });

    it("null explícito entra no DTO como null — limpa a coluna (SPG-1)", () => {
      const result = parseLeadPatch({ executiveSummary: null });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect("executiveSummary" in result.dto).toBe(true);
      expect(result.dto.executiveSummary).toBeNull();
    });

    it("valor presente entra no DTO com o valor parseado — grava (SPG-1, teste discriminante completo: ausente vs null vs valor)", () => {
      const result = parseLeadPatch({
        region: "Centro",
        executiveSummary: null,
        // purchaseHorizon ausente de propósito
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.region).toBe("Centro");
      expect(result.dto.executiveSummary).toBeNull();
      expect("purchaseHorizon" in result.dto).toBe(false);
    });

    it("status presente e válido entra no DTO", () => {
      const result = parseLeadPatch({ status: "qualificado_agendado" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.status).toBe("qualificado_agendado");
    });

    it("status: null explícito é rejeitado — coluna NOT NULL no schema, não pode ser limpa", () => {
      const result = parseLeadPatch({ status: null });
      expect(result.ok).toBe(false);
    });

    it("status fora do enum é rejeitado (enum fora do domínio)", () => {
      const result = parseLeadPatch({ status: "status_inventado" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("status");
    });

    it.each(["modality", "propertyType", "motivation", "creditStatus"] as const)(
      "%s fora do enum é rejeitado (enum fora do domínio)",
      (field) => {
        const result = parseLeadPatch({ [field]: "valor_invalido" });
        expect(result.ok).toBe(false);
      }
    );

    it("modality/propertyType/motivation/creditStatus aceitam null explícito (nullable no schema)", () => {
      const result = parseLeadPatch({
        modality: null,
        propertyType: null,
        motivation: null,
        creditStatus: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.modality).toBeNull();
      expect(result.dto.propertyType).toBeNull();
      expect(result.dto.motivation).toBeNull();
      expect(result.dto.creditStatus).toBeNull();
    });

    it("budgetCents negativo é rejeitado (budget negativo)", () => {
      const result = parseLeadPatch({ budgetCents: -100 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("budgetCents");
    });

    it("budgetCents não-inteiro é rejeitado", () => {
      const result = parseLeadPatch({ budgetCents: 100.5 });
      expect(result.ok).toBe(false);
    });

    it("budgetCents aceito como number e convertido para bigint", () => {
      const result = parseLeadPatch({ budgetCents: 350000 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.budgetCents).toBe(350000n);
    });

    it("budgetCents aceito como string numérica e convertido para bigint", () => {
      const result = parseLeadPatch({ budgetCents: "350000" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.budgetCents).toBe(350000n);
    });

    it("budgetCents string negativa é rejeitada", () => {
      const result = parseLeadPatch({ budgetCents: "-100" });
      expect(result.ok).toBe(false);
    });

    it("meetingAt em formato não-ISO é rejeitado (data não-ISO)", () => {
      const result = parseLeadPatch({ meetingAt: "01/08/2026" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("meetingAt");
    });

    it("meetingAt ISO válido é aceito e convertido para Date", () => {
      const result = parseLeadPatch({ meetingAt: "2026-08-10T14:00:00Z" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.meetingAt).toBeInstanceOf(Date);
    });

    it("chainedOperation não-booleano é rejeitado", () => {
      const result = parseLeadPatch({ chainedOperation: "sim" });
      expect(result.ok).toBe(false);
    });

    it("chainedOperation booleano é aceito", () => {
      const result = parseLeadPatch({ chainedOperation: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.chainedOperation).toBe(true);
    });

    it("objeto vazio é um patch válido — nenhum campo é tocado", () => {
      const result = parseLeadPatch({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.dto)).toHaveLength(0);
    });

    it("rejeita quando o corpo não é um objeto JSON", () => {
      const result = parseLeadPatch([1, 2, 3]);
      expect(result.ok).toBe(false);
    });
  });

  describe("parseMessageCreate", () => {
    const validPayload = {
      externalId: "wa_msg_123",
      sender: "lead",
      content: "Olá, tenho interesse.",
      sentAt: "2026-08-01T10:05:00Z",
    };

    it("aceita um payload válido e devolve o DTO tipado (INT-05 AC1)", () => {
      const result = parseMessageCreate(validPayload);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.externalId).toBe("wa_msg_123");
      expect(result.dto.sender).toBe("lead");
      expect(result.dto.content).toBe("Olá, tenho interesse.");
      expect(result.dto.sentAt).toBeInstanceOf(Date);
    });

    it.each([
      ["externalId", { ...validPayload, externalId: undefined }],
      ["content", { ...validPayload, content: undefined }],
      ["sentAt", { ...validPayload, sentAt: undefined }],
    ])("rejeita quando '%s' está ausente (campo ausente)", (_label, payload) => {
      const result = parseMessageCreate(payload);
      expect(result.ok).toBe(false);
    });

    it("rejeita sender fora do domínio {agente, lead} (sender inválido)", () => {
      const result = parseMessageCreate({ ...validPayload, sender: "robo" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("sender");
    });

    it("aceita sender 'agente'", () => {
      const result = parseMessageCreate({ ...validPayload, sender: "agente" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.dto.sender).toBe("agente");
    });

    it("rejeita sentAt em formato não-ISO (data não-ISO)", () => {
      const result = parseMessageCreate({ ...validPayload, sentAt: "hoje" });
      expect(result.ok).toBe(false);
    });
  });

  describe("parseMessagesQuery (lote-6b — CTX-02)", () => {
    it("sem 'limit' devolve o default 50 (CTX-02 AC2)", () => {
      const result = parseMessagesQuery(urlWithQuery());
      expect(result).toEqual({ ok: true, limit: 50 });
    });

    it.each(["1", "100"])(
      "'limit=%s' (extremo da faixa) é aceito",
      (limit) => {
        const result = parseMessagesQuery(urlWithQuery(`?limit=${limit}`));
        expect(result).toEqual({ ok: true, limit: Number(limit) });
      }
    );

    it("'limit=2' no meio da faixa é aceito", () => {
      const result = parseMessagesQuery(urlWithQuery("?limit=2"));
      expect(result).toEqual({ ok: true, limit: 2 });
    });

    it.each(["0", "101", "abc", "-1"])(
      "'limit=%s' é rejeitado com detail (CTX-02 AC3)",
      (limit) => {
        const result = parseMessagesQuery(urlWithQuery(`?limit=${limit}`));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.detail).toBeTruthy();
      }
    );
  });
});
