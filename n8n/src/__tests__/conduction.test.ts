import { describe, expect, it } from "vitest";
import {
  canAgentContactProactively,
  canAgentSendInTurn,
  isHumanConducted,
  memoryResetDue,
} from "../conduction.mjs";

const MARK = "2026-10-01T12:00:00.000Z";
const OPTED_OUT = "2026-10-01T13:00:00.000Z";

describe("isHumanConducted (ASSUMIR-01 AC7; AD-034)", () => {
  it("só a marca -> true", () => {
    expect(isHumanConducted({ status: "em_qualificacao", humanTakeoverAt: MARK })).toBe(true);
  });

  it("só escalado_humano -> true", () => {
    expect(isHumanConducted({ status: "escalado_humano", humanTakeoverAt: null })).toBe(true);
  });

  it("marca e escalado_humano -> true", () => {
    expect(isHumanConducted({ status: "escalado_humano", humanTakeoverAt: MARK })).toBe(true);
  });

  it("nenhum dos dois -> false", () => {
    expect(isHumanConducted({ status: "qualificado_agendado", humanTakeoverAt: null })).toBe(false);
  });
});

describe("canAgentSendInTurn (SILENCIO-01 AC4)", () => {
  it("escalado_humano sem marca -> true (mensagem de passagem do agente que escalou)", () => {
    expect(
      canAgentSendInTurn({ status: "escalado_humano", optedOutAt: null, humanTakeoverAt: null })
    ).toBe(true);
  });

  it("com a marca -> false", () => {
    expect(
      canAgentSendInTurn({ status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: MARK })
    ).toBe(false);
  });

  it("com opt-out -> false", () => {
    expect(
      canAgentSendInTurn({ status: "em_qualificacao", optedOutAt: OPTED_OUT, humanTakeoverAt: null })
    ).toBe(false);
  });

  it("lead limpo -> true", () => {
    expect(
      canAgentSendInTurn({ status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: null })
    ).toBe(true);
  });
});

describe("canAgentContactProactively (SILENCIO-01 AC6/AC7)", () => {
  it("escalado_humano -> false", () => {
    expect(
      canAgentContactProactively({ status: "escalado_humano", optedOutAt: null, humanTakeoverAt: null })
    ).toBe(false);
  });

  it("com a marca -> false", () => {
    expect(
      canAgentContactProactively({ status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: MARK })
    ).toBe(false);
  });

  it("com opt-out -> false", () => {
    expect(
      canAgentContactProactively({ status: "em_qualificacao", optedOutAt: OPTED_OUT, humanTakeoverAt: null })
    ).toBe(false);
  });

  it("lead limpo -> true", () => {
    expect(
      canAgentContactProactively({ status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: null })
    ).toBe(true);
  });
});

describe("memoryResetDue (DEVOLVER-01 AC5/AC7)", () => {
  const REQUESTED = "2026-10-01T15:00:00.000Z";

  it("pedido nulo -> false", () => {
    expect(memoryResetDue(null, null)).toBe(false);
    expect(memoryResetDue(null, REQUESTED)).toBe(false);
  });

  it("pedido com atendido nulo -> true", () => {
    expect(memoryResetDue(REQUESTED, null)).toBe(true);
  });

  it("pedido com atendido vazio (coluna da Data Table nunca preenchida) -> true", () => {
    expect(memoryResetDue(REQUESTED, "")).toBe(true);
  });

  it("pedido mais novo que o atendido -> true", () => {
    expect(memoryResetDue(REQUESTED, "2026-10-01T14:59:59.999Z")).toBe(true);
  });

  it("pedido igual ao atendido -> false (fronteira exata, L-023)", () => {
    expect(memoryResetDue(REQUESTED, REQUESTED)).toBe(false);
  });

  it("pedido igual ao atendido em formatos diferentes (Date e ISO) -> false", () => {
    expect(memoryResetDue(new Date(REQUESTED), REQUESTED)).toBe(false);
  });

  it("pedido mais velho que o atendido -> false", () => {
    expect(memoryResetDue("2026-10-01T14:00:00.000Z", REQUESTED)).toBe(false);
  });

  it("data inválida -> false", () => {
    expect(memoryResetDue("não é data", null)).toBe(false);
    expect(memoryResetDue(REQUESTED, "não é data")).toBe(false);
  });
});
