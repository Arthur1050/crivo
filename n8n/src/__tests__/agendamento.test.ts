import { describe, expect, it } from "vitest";
import {
  interpretarPatchAgendamento,
  montarRecusaAgendamento,
  montarRespostaAgendamento,
} from "../agendamento.mjs";

/** Resposta do nó HTTP Request com `fullResponse` — o envelope que o
 * `PATCH /leads/{id}` entrega ao Code node seguinte. */
function envelope(statusCode: number, body: unknown) {
  return { statusCode, headers: {}, body };
}

const CORRETORA = { name: "Corretora Manhã", email: "corretora.manha@imobiliaria-a.com.br" };

describe("interpretarPatchAgendamento (ATRIB-02 AC4/AC5/AC7)", () => {
  it("200 com status agendado confirma e devolve o corretor escolhido pelo CRM", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(200, {
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "qualificado_agendado",
        assignedBroker: CORRETORA,
      })
    );

    expect(resultado.crmConfirmou).toBe(true);
    expect(resultado.reason).toBeNull();
    expect(resultado.corretor).toEqual(CORRETORA);
  });

  it("o convidado do evento é o e-mail do corretor devolvido (AC8)", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(200, { status: "qualificado_agendado", assignedBroker: CORRETORA })
    );

    expect(resultado.convidados).toEqual(["corretora.manha@imobiliaria-a.com.br"]);
  });

  it("`sem-corretor-disponivel` não confirma: nenhum evento é criado (AC5)", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(409, {
        type: "urn:crivo:problem:sem-corretor-disponivel",
        status: 409,
        code: "sem-corretor-disponivel",
      })
    );

    expect(resultado.crmConfirmou).toBe(false);
    expect(resultado.reason).toBe("sem-corretor-disponivel");
    expect(resultado.corretor).toBeNull();
    expect(resultado.convidados).toEqual([]);
  });

  it("`conflito-de-agenda` não confirma e preserva o código do contrato (AC7)", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(409, { status: 409, code: "conflito-de-agenda" })
    );

    expect(resultado.crmConfirmou).toBe(false);
    expect(resultado.reason).toBe("conflito-de-agenda");
    expect(resultado.convidados).toEqual([]);
  });

  it("qualquer outro code do contrato também recusa, com o code preservado", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(409, { status: 409, code: "lead-travado-por-humano" })
    );

    expect(resultado.crmConfirmou).toBe(false);
    expect(resultado.reason).toBe("lead-travado-por-humano");
  });

  it("falha de transporte (sem statusCode, sem corpo) recusa com motivo nomeado, nunca em silêncio", () => {
    const resultado = interpretarPatchAgendamento({ error: "ECONNRESET" });

    expect(resultado.crmConfirmou).toBe(false);
    expect(resultado.reason).toBe("falha-ao-atualizar-crm");
    expect(resultado.convidados).toEqual([]);
  });

  it("200 com status diferente de agendado NÃO confirma (as duas metades são exigidas)", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(200, { status: "em_qualificacao" })
    );

    expect(resultado.crmConfirmou).toBe(false);
    expect(resultado.reason).toBe("falha-ao-atualizar-crm");
  });

  it("confirmação sem `assignedBroker` cria o evento sem convidado, em vez de recusar", () => {
    const resultado = interpretarPatchAgendamento(
      envelope(200, { status: "qualificado_agendado" })
    );

    expect(resultado.crmConfirmou).toBe(true);
    expect(resultado.corretor).toBeNull();
    expect(resultado.convidados).toEqual([]);
  });
});

describe("montarRecusaAgendamento (ATRIB-02 AC5)", () => {
  it("`sem-corretor-disponivel` manda o agente oferecer outro horário e nega a reunião", () => {
    const recusa = montarRecusaAgendamento("sem-corretor-disponivel");

    expect(recusa.ok).toBe(false);
    expect(recusa.reason).toBe("sem-corretor-disponivel");
    expect(recusa.eventoCriado).toBe(false);
    expect(recusa.orientacao).toBe(
      "Nenhum corretor da imobiliária atende nesse horário. A reunião NÃO foi marcada: ofereça outro horário ao lead."
    );
  });

  it("`conflito-de-agenda` também manda oferecer outro horário", () => {
    const recusa = montarRecusaAgendamento("conflito-de-agenda");

    expect(recusa.reason).toBe("conflito-de-agenda");
    expect(recusa.orientacao).toBe(
      "O corretor desse horário já tem outra reunião marcada. A reunião NÃO foi marcada: ofereça outro horário ao lead."
    );
  });

  it("motivo desconhecido recebe orientação padrão que proíbe confirmar a reunião", () => {
    const recusa = montarRecusaAgendamento("transicao-invalida");

    expect(recusa.reason).toBe("transicao-invalida");
    expect(recusa.orientacao).toBe(
      "Não foi possível registrar a reunião no CRM. NÃO confirme a reunião ao lead e ofereça outro horário."
    );
  });

  it("motivo ausente cai no motivo padrão em vez de devolver vazio", () => {
    expect(montarRecusaAgendamento(undefined).reason).toBe("falha-ao-atualizar-crm");
    expect(montarRecusaAgendamento("   ").reason).toBe("falha-ao-atualizar-crm");
  });
});

describe("montarRespostaAgendamento (divergência CRM x Calendar nunca é silenciosa)", () => {
  it("evento criado devolve link, corretor e nenhum aviso", () => {
    const resposta = montarRespostaAgendamento({
      meetingAt: "2026-08-17T13:00:00.000Z",
      evento: { htmlLink: "https://calendar.google.com/event?eid=evt123" },
      corretor: CORRETORA,
    });

    expect(resposta.ok).toBe(true);
    expect(resposta.eventoCriado).toBe(true);
    expect(resposta.meetLink).toBe("https://calendar.google.com/event?eid=evt123");
    expect(resposta.meetingAt).toBe("2026-08-17T13:00:00.000Z");
    expect(resposta.corretor).toEqual(CORRETORA);
    expect(resposta.aviso).toBeNull();
  });

  it("CRM gravado e evento faltando devolve aviso explícito da divergência", () => {
    const resposta = montarRespostaAgendamento({
      meetingAt: "2026-08-17T13:00:00.000Z",
      evento: { error: "Google Calendar: quota exceeded" },
      corretor: CORRETORA,
    });

    expect(resposta.crmAtualizado).toBe(true);
    expect(resposta.eventoCriado).toBe(false);
    expect(resposta.meetLink).toBeNull();
    expect(resposta.aviso).toBe(
      "Reunião registrada no CRM, mas o evento no Google Calendar não foi criado — confirme a reunião ao lead, diga que o link do Meet chega em seguida, e sinalize a falha."
    );
  });

  it("evento ausente por completo também produz aviso, não silêncio", () => {
    const resposta = montarRespostaAgendamento({ meetingAt: "2026-08-17T13:00:00.000Z" });

    expect(resposta.eventoCriado).toBe(false);
    expect(resposta.aviso).not.toBeNull();
  });
});
