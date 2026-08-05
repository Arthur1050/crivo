import { describe, expect, it } from "vitest";
import { normalizeEvent } from "../normalize-event.mjs";
import metaMessageText from "../../fixtures/meta-message-text.json";
import metaMessageDuplicate from "../../fixtures/meta-message-duplicate.json";
import metaMessageMedia from "../../fixtures/meta-message-media.json";
import metaStatuses from "../../fixtures/meta-statuses.json";

describe("normalizeEvent (AGT-01)", () => {
  it("extrai waId/phoneNumberId/messageId/text/sentAt/hasMedia de uma mensagem de texto (AGT-01 AC2)", () => {
    const result = normalizeEvent(metaMessageText);

    expect(result).toEqual({
      waId: "5534999990001",
      phoneNumberId: "109876543210001",
      messageId:
        "wamid.HBgNNTUzNDk5OTk5MDAwMRUCABIYFjNBMjJCRjIzQzE3RjQ5RjQ5RjQA",
      text: "Oi, vi o anúncio do apartamento no bairro Abadia",
      sentAt: "2025-08-05T12:10:00.000Z",
      hasMedia: false,
    });
  });

  it("mensagem de mídia (imagem) é flagada hasMedia:true com text vazio, incondicionalmente (edge case)", () => {
    const result = normalizeEvent(metaMessageMedia);

    expect(result).toEqual({
      waId: "5534999990001",
      phoneNumberId: "109876543210001",
      messageId:
        "wamid.HBgNNTUzNDk5OTk5MDAwMRUCABIYFjNBMjJCRjIzQzE3RjQ5RjQ5RjRC",
      text: "",
      sentAt: "2025-08-05T12:15:00.000Z",
      hasMedia: true,
    });
  });

  it("evento statuses (delivered/read/etc.) retorna null — descartado sem erro (edge case)", () => {
    const result = normalizeEvent(metaStatuses);
    expect(result).toBeNull();
  });

  it("reentrega do mesmo evento produz o mesmo resultado normalizado, sem lançar exceção (AGT-01 AC3 — nível da função)", () => {
    const original = normalizeEvent(metaMessageText);
    const retried = normalizeEvent(metaMessageDuplicate);

    expect(retried).not.toBeNull();
    expect(retried).toEqual(original);
    expect(retried!.messageId).toBe(original!.messageId);
  });

  it("chamar a função duas vezes com o mesmo payload é determinístico (pureza — base da idempotência a jusante)", () => {
    const first = normalizeEvent(metaMessageText);
    const second = normalizeEvent(metaMessageText);
    expect(first).toEqual(second);
  });

  it("extrai phoneNumberId corretamente mesmo para um número não mapeado — descarte é decisão da Data Table tenant_config, fora desta função (AGT-01 AC4 — nível da função)", () => {
    const unmappedNumberPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "999999999999999" },
                messages: [
                  {
                    from: "5534988887777",
                    id: "wamid.NAO_MAPEADO",
                    timestamp: "1754395800",
                    type: "text",
                    text: { body: "Mensagem de número desconhecido" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = normalizeEvent(unmappedNumberPayload);
    expect(result).not.toBeNull();
    expect(result!.phoneNumberId).toBe("999999999999999");
  });

  it("payload sem mensagens (evento vazio/desconhecido) retorna null sem lançar exceção", () => {
    expect(normalizeEvent({})).toBeNull();
    expect(normalizeEvent({ entry: [] })).toBeNull();
    expect(() => normalizeEvent(null)).not.toThrow();
    expect(normalizeEvent(null)).toBeNull();
  });
});
