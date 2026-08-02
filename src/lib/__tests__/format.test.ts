import { describe, expect, it } from "vitest";
import { formatCurrencyBRL } from "../format";

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
