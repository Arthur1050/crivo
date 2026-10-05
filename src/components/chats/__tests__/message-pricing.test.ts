import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MessagePricingView } from "../../../server/data/whatsapp";
import { MessagePricing } from "../message-pricing";

const classifications: MessagePricingView[] = [
  { messageId: "fixture-paid", state: "paid-service", label: "Tarifável — confirmado pela Meta" },
  { messageId: "fixture-free", state: "free-service", label: "Gratuita — franquia de serviço" },
  { messageId: "fixture-fep", state: "free-entry-point", label: "Gratuita — janela de entrada gratuita" },
  { messageId: "fixture-pending", state: "pending", label: "Cobrança pendente de confirmação" },
  { messageId: "fixture-unavailable", state: "unavailable", label: "Classificação indisponível" },
  { messageId: "fixture-failed", state: "not-delivered", label: "Não entregue" },
];

function render(pricing: MessagePricingView | null, sender: "agente" | "humano" | "lead" = "agente") {
  return renderToStaticMarkup(createElement(MessagePricing, { pricing, sender }));
}

function text(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

describe("classificação por mensagem (L14b T58 / PRECO-01)", () => {
  it.each(classifications)("$state apresenta a frase confirmada completa e acessível", (pricing) => {
    const markup = render(pricing);
    expect(text(markup)).toBe(pricing.label);
    expect(markup).toContain("astryx-chat-message-metadata");
    expect(markup).toContain('data-type="supporting"');
    expect(markup).not.toMatch(/title=|aria-hidden="true"|line-clamp/);
  });

  it("inbound não recebe rótulo mesmo se houver um DTO de saída", () => {
    for (const pricing of [...classifications, null]) {
      expect(render(pricing, "lead")).toBe("");
    }
  });

  it("texto não inventa valor de fatura, promessa de gratuidade ou franquia sem confirmação", () => {
    for (const sender of ["agente", "humano"] as const) {
      for (const pricing of classifications) {
        const displayed = text(render(pricing, sender));
        expect(displayed).toBe(pricing.label);
        expect(displayed).not.toMatch(/R\$|\d|fatura|será gratuita|sempre gratui|sem custo|garantid/i);
      }
      expect(text(render(null, sender))).toBe("Classificação indisponível");
    }
  });
});
