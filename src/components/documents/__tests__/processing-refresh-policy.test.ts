import { describe, expect, it } from "vitest";
import {
  PROCESSING_REFRESH_INTERVAL_MS,
  shouldPollForProcessing,
  type PageVisibility,
} from "../processing-refresh-policy";

describe("política de refresh de processamento (lote-12 T26)", () => {
  it("não existe refresh quando nenhum documento está processando", () => {
    expect(shouldPollForProcessing(false, "visible")).toBe(false);
  });

  it("existe refresh com documento processando e aba visível", () => {
    expect(shouldPollForProcessing(true, "visible")).toBe(true);
  });

  it("aba oculta pausa mesmo havendo documento processando", () => {
    expect(shouldPollForProcessing(true, "hidden")).toBe(false);
  });

  it("aba oculta sem processamento continua sem refresh", () => {
    expect(shouldPollForProcessing(false, "hidden")).toBe(false);
  });

  it("voltar ao foco reativa o refresh sem nenhum estado intermediário", () => {
    // A política é uma função pura das duas condições: sair e voltar da aba
    // devolve exatamente a decisão anterior, sem depender de histórico.
    const sequence: PageVisibility[] = ["visible", "hidden", "visible"];
    expect(sequence.map((v) => shouldPollForProcessing(true, v))).toEqual([true, false, true]);
  });

  it("o estado terminal encerra o refresh, independentemente da visibilidade", () => {
    const visibilities: PageVisibility[] = ["visible", "hidden"];
    for (const visibility of visibilities) {
      expect(shouldPollForProcessing(false, visibility)).toBe(false);
    }
  });

  it("o intervalo é de aproximadamente 3 segundos", () => {
    expect(PROCESSING_REFRESH_INTERVAL_MS).toBe(3000);
  });

  it("o intervalo não é agressivo a ponto de virar polling contínuo", () => {
    expect(PROCESSING_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});
