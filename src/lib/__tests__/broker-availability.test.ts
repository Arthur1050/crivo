import { describe, expect, it } from "vitest";
import { assignBroker } from "../broker-assignment";
import {
  selectForEscalation,
  selectForMeeting,
  type BrokerCandidate,
} from "../broker-availability";
import type { WorkWindow } from "../work-window";

/** 2026-08-24 é segunda (ISO 1); 2026-08-29 é sábado (6). */
function saoPaulo(isoLocal: string): Date {
  return new Date(`${isoLocal}-03:00`);
}

const MANHA: WorkWindow = { days: [1, 2, 3, 4, 5], start: "08:00", end: "14:00" };
const TARDE: WorkWindow = { days: [1, 2, 3, 4, 5], start: "13:00", end: "19:00" };

function candidate(
  id: string,
  overrides: Partial<BrokerCandidate> = {}
): BrokerCandidate {
  return {
    id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    activeLeads: 0,
    window: MANHA,
    meetings: [],
    ...overrides,
  };
}

describe("selectForMeeting (ATRIB-02 — candidatos ao agendamento)", () => {
  it("mantém só quem tem janela cobrindo o intervalo inteiro da reunião", () => {
    // 10:00-10:30 de segunda: dentro da manhã, fora da tarde.
    const manha = candidate("manha", { window: MANHA });
    const tarde = candidate("tarde", { window: TARDE });

    const selected = selectForMeeting(
      [manha, tarde],
      saoPaulo("2026-08-24T10:00:00"),
      saoPaulo("2026-08-24T10:30:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["manha"]);
  });

  it("exclui quem não declarou janela (AGENDA-01 AC5)", () => {
    const semJanela = candidate("sem-janela", { window: null });
    const comJanela = candidate("com-janela", { window: MANHA });

    const selected = selectForMeeting(
      [semJanela, comJanela],
      saoPaulo("2026-08-24T10:00:00"),
      saoPaulo("2026-08-24T10:30:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["com-janela"]);
  });

  it("exclui quem já tem reunião sobreposta ao mesmo intervalo (AC6)", () => {
    const ocupado = candidate("ocupado", {
      meetings: [
        {
          start: saoPaulo("2026-08-24T10:15:00"),
          end: saoPaulo("2026-08-24T10:45:00"),
        },
      ],
    });
    const livre = candidate("livre");

    const selected = selectForMeeting(
      [ocupado, livre],
      saoPaulo("2026-08-24T10:00:00"),
      saoPaulo("2026-08-24T10:30:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["livre"]);
  });

  it("reunião encostada (termina no minuto em que a nova começa) não é sobreposição", () => {
    const encostado = candidate("encostado", {
      meetings: [
        {
          start: saoPaulo("2026-08-24T09:30:00"),
          end: saoPaulo("2026-08-24T10:00:00"),
        },
        {
          start: saoPaulo("2026-08-24T10:30:00"),
          end: saoPaulo("2026-08-24T11:00:00"),
        },
      ],
    });

    const selected = selectForMeeting(
      [encostado],
      saoPaulo("2026-08-24T10:00:00"),
      saoPaulo("2026-08-24T10:30:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["encostado"]);
  });

  it("devolve lista vazia quando nenhum corretor cobre o horário (insumo da AC5)", () => {
    const selected = selectForMeeting(
      [candidate("manha", { window: MANHA }), candidate("tarde", { window: TARDE })],
      saoPaulo("2026-08-29T10:00:00"), // sábado — fora de toda janela seg-sex
      saoPaulo("2026-08-29T10:30:00")
    );

    expect(selected).toEqual([]);
  });

  it("entre os que cobrem, o desempate segue determinístico: carga → createdAt → id (AC3)", () => {
    const start = saoPaulo("2026-08-24T13:15:00"); // 13:15-13:45: manhã E tarde
    const end = saoPaulo("2026-08-24T13:45:00");

    const carregado = candidate("carregado", { window: MANHA, activeLeads: 5 });
    const leveNovo = candidate("leve-novo", {
      window: TARDE,
      activeLeads: 2,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    const leveAntigo = candidate("leve-antigo", {
      window: TARDE,
      activeLeads: 2,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const selected = selectForMeeting(
      [carregado, leveNovo, leveAntigo],
      start,
      end
    );

    expect(selected.map((broker) => broker.id).sort()).toEqual([
      "carregado",
      "leve-antigo",
      "leve-novo",
    ]);
    expect(assignBroker(selected)).toBe("leve-antigo");
  });

  it("o candidato devolvido não carrega janela nem reuniões (a lista nunca sai da regra)", () => {
    const selected = selectForMeeting(
      [candidate("unico")],
      saoPaulo("2026-08-24T10:00:00"),
      saoPaulo("2026-08-24T10:30:00")
    );

    expect(selected).toEqual([
      {
        id: "unico",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        activeLeads: 0,
      },
    ]);
  });
});

describe("selectForEscalation (ATRIB-03 — candidatos ao escalonamento)", () => {
  it("mantém só quem está em janela naquele instante (AC2)", () => {
    const selected = selectForEscalation(
      [candidate("manha", { window: MANHA }), candidate("tarde", { window: TARDE })],
      saoPaulo("2026-08-24T09:00:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["manha"]);
  });

  it("escolhe o de menor carga entre os que estão em janela (AC2)", () => {
    const selected = selectForEscalation(
      [
        candidate("manha-carregado", { window: MANHA, activeLeads: 4 }),
        candidate("manha-leve", { window: MANHA, activeLeads: 1 }),
        candidate("tarde-vazio", { window: TARDE, activeLeads: 0 }),
      ],
      saoPaulo("2026-08-24T09:00:00")
    );

    // O de carga 0 está FORA da janela às 09:00 — não pode ser o escolhido.
    expect(selected.map((broker) => broker.id).sort()).toEqual([
      "manha-carregado",
      "manha-leve",
    ]);
    expect(assignBroker(selected)).toBe("manha-leve");
  });

  it("com ninguém em janela, devolve TODOS os candidatos em vez de nenhum (AC3)", () => {
    const todos = [
      candidate("manha", { window: MANHA, activeLeads: 3 }),
      candidate("tarde", { window: TARDE, activeLeads: 1 }),
      candidate("sem-janela", { window: null, activeLeads: 9 }),
    ];

    // Sábado 22:00: fora de toda janela declarada.
    const selected = selectForEscalation(todos, saoPaulo("2026-08-29T22:00:00"));

    expect(selected.map((broker) => broker.id).sort()).toEqual([
      "manha",
      "sem-janela",
      "tarde",
    ]);
    expect(assignBroker(selected)).toBe("tarde");
  });

  it("quem não declarou janela é excluído enquanto houver alguém em janela", () => {
    const selected = selectForEscalation(
      [
        candidate("sem-janela", { window: null, activeLeads: 0 }),
        candidate("em-janela", { window: MANHA, activeLeads: 7 }),
      ],
      saoPaulo("2026-08-24T09:00:00")
    );

    expect(selected.map((broker) => broker.id)).toEqual(["em-janela"]);
  });

  it("sem nenhum candidato, devolve lista vazia (imobiliária sem corretor ativo — AC4)", () => {
    expect(selectForEscalation([], saoPaulo("2026-08-24T09:00:00"))).toEqual([]);
    expect(assignBroker(selectForEscalation([], saoPaulo("2026-08-24T09:00:00")))).toBeNull();
  });
});
