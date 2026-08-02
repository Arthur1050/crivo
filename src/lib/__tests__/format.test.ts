import { describe, expect, it } from "vitest";
import {
  formatCurrencyBRL,
  formatDurationMinutes,
  formatPercentInt,
} from "../format";

// Intl.NumberFormat("pt-BR", { style: "currency" }) separa "R$" do valor com
// um espaco NBSP (U+00A0), nao um espaco comum: o literal de expectativa
// precisa reproduzir esse caractere para bater com o valor real formatado.
const NBSP = " ";

describe("formatCurrencyBRL", () => {
  it("formata um valor em centavos (bigint) como Real brasileiro", () => {
    expect(formatCurrencyBRL(350000n)).toBe(`R$${NBSP}3.500,00`);
  });

  it("formata um valor em centavos (number) como Real brasileiro", () => {
    expect(formatCurrencyBRL(150000)).toBe(`R$${NBSP}1.500,00`);
  });

  it("retorna null para budgetCents nulo - nunca 'R$ NaN' (lote-3 - PIPE-03)", () => {
    expect(formatCurrencyBRL(null)).toBeNull();
  });

  it("retorna null para budgetCents indefinido", () => {
    expect(formatCurrencyBRL(undefined)).toBeNull();
  });
});

// lote-4 — DASH-01: formatador do tile de 1ª resposta.
describe("formatDurationMinutes", () => {
  it("formata 0 minutos", () => {
    expect(formatDurationMinutes(0)).toBe("0min");
  });

  it("formata minutos abaixo de 60 sem horas", () => {
    expect(formatDurationMinutes(59)).toBe("59min");
  });

  it("formata exatamente 60 minutos como 1h 0min", () => {
    expect(formatDurationMinutes(60)).toBe("1h 0min");
  });

  it("formata 90 minutos como 1h 30min", () => {
    expect(formatDurationMinutes(90)).toBe("1h 30min");
  });

  it("arredonda minutos fracionários (média) para o inteiro mais próximo", () => {
    expect(formatDurationMinutes(89.6)).toBe("1h 30min");
    expect(formatDurationMinutes(44.4)).toBe("44min");
  });
});

// lote-4 — DASH-01: formatador de taxas (fração 0–1 vinda da DAL).
describe("formatPercentInt", () => {
  it("formata 0 como 0%", () => {
    expect(formatPercentInt(0)).toBe("0%");
  });

  it("formata 1 como 100%", () => {
    expect(formatPercentInt(1)).toBe("100%");
  });

  it("arredonda para o inteiro mais próximo", () => {
    expect(formatPercentInt(0.665)).toBe("67%");
    expect(formatPercentInt(0.664)).toBe("66%");
  });
});
