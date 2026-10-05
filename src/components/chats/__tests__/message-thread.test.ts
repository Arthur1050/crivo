import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessageBubble } from "@astryxdesign/core/Chat";
import { describe, expect, it } from "vitest";
import type { Message } from "../../../server/data";
import type { MessagePricingView } from "../../../server/data/whatsapp";
import { MessageThread } from "../message-thread";

const at = new Date("2026-10-05T12:00:00Z");
function message(id: string, sender: Message["sender"] = "agente", authorName: string | null = null): Message {
  return { id, sender, authorName, authorUserId: null, content: `Texto fixture ${id}`, sentAt: at,
    tenantId: "fixture-tenant", conversationId: "fixture-conversation", externalId: `wamid.${id}`, whatsappPhoneNumberId: "fixture-channel" };
}
function price(messageId: string, state: MessagePricingView["state"], label: string): MessagePricingView {
  return { messageId, state, label };
}
function render(messages: Message[], pricingViews: MessagePricingView[] = []) {
  return renderToStaticMarkup(createElement(MessageThread, { messages, pricingViews, leadName: "Lead fixture",
    emptyTitle: "Sem mensagens", emptyDescription: "Fixture vazia" }));
}
function metadata(markup: string) {
  return markup.match(/astryx-chat-message-metadata\b/g) ?? [];
}
function bubbleGroups(messages: Message[]) {
  const groups: unknown[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode; group?: string }>(child)) return;
      if (child.type === ChatMessageBubble) groups.push(child.props.group);
      visit(child.props.children);
    });
  }
  visit(MessageThread({ messages, leadName: "Lead fixture", emptyTitle: "Sem mensagens", emptyDescription: "Fixture vazia" }));
  return groups;
}

describe("metadata da thread (L14b T59 / PRECO-01)", () => {
  it("primeira e última bolha do grupo têm sua própria classificação", () => {
    const markup = render([message("first"), message("last")], [
      price("first", "paid-service", "Tarifável — confirmado pela Meta"),
      price("last", "free-service", "Gratuita — franquia de serviço"),
    ]);
    expect(metadata(markup)).toHaveLength(2);
    expect(markup.indexOf("Texto fixture first")).toBeLessThan(markup.indexOf("Tarifável — confirmado pela Meta"));
    expect(markup.indexOf("Tarifável — confirmado pela Meta")).toBeLessThan(markup.indexOf("Texto fixture last"));
    expect(markup.indexOf("Texto fixture last")).toBeLessThan(markup.indexOf("Gratuita — franquia de serviço"));
  });

  it("humano, agente normal e retomada usam a classificação de sua mensagem", () => {
    const messages = [message("human", "humano", "Autor fixture"), message("normal"), message("retomada")];
    const markup = render(messages, messages.map(({ id }) => price(id, "pending", "Cobrança pendente de confirmação")));
    expect(metadata(markup)).toHaveLength(3);
    expect(markup.match(/Cobrança pendente de confirmação/g)).toHaveLength(3);
    for (const { content } of messages) expect(markup).toContain(content);
  });

  it("inbound conserva metadata de horário e não ganha rótulo de saída", () => {
    const messages = [message("inbound", "lead")];
    const markup = render(messages, [price("inbound", "paid-service", "Tarifável — confirmado pela Meta")]);
    expect(markup).toBe(render(messages));
    expect(metadata(markup)).toHaveLength(1);
    expect(markup).toContain('dateTime="2026-10-05T12:00:00.000Z"');
    expect(markup).not.toContain("Tarifável");
  });

  it("autores diferentes continuam identificados e em grupos diferentes", () => {
    const markup = render([message("one", "humano", "Autora fixture"), message("two", "humano", "Autor fixture")]);
    expect(markup).toContain("Autora fixture");
    expect(markup).toContain("Autor fixture");
    expect(markup.match(/<article\b/g)).toHaveLength(2);
    expect(bubbleGroups([message("one", "humano", "Autora fixture"), message("two", "humano", "Autor fixture")])).toEqual([undefined, undefined]);
  });

  it("agrupamento e horário original da última bolha são preservados", () => {
    const markup = render([message("first"), message("last")]);
    expect(bubbleGroups([message("first"), message("last")])).toEqual(["first", "last"]);
    expect(markup.match(/dateTime="2026-10-05T12:00:00.000Z"/g)).toHaveLength(2);
    expect(markup.match(/Classificação indisponível/g)).toHaveLength(2);
  });

  it("novo render com recibo confirmado troca somente a classificação pendente", () => {
    const messages = [message("updated")];
    const before = render(messages, [price("updated", "pending", "Cobrança pendente de confirmação")]);
    const after = render(messages, [price("updated", "paid-service", "Tarifável — confirmado pela Meta")]);
    expect(before).toContain("Cobrança pendente de confirmação");
    expect(after).toContain("Tarifável — confirmado pela Meta");
    expect(after).not.toContain("Cobrança pendente de confirmação");
    expect(after).toContain("Texto fixture updated");
    expect(metadata(after)).toHaveLength(1);
  });

  it("FEP confirmado aparece na mensagem independentemente da previsão anterior", () => {
    const messages = [message("fep")];
    const before = render(messages, [price("fep", "pending", "Cobrança pendente de confirmação")]);
    const after = render(messages, [price("fep", "free-entry-point", "Gratuita — janela de entrada gratuita")]);
    expect(before).toContain("Cobrança pendente de confirmação");
    expect(after).toContain("Gratuita — janela de entrada gratuita");
    expect(after).not.toMatch(/Tarifável|Cobrança pendente de confirmação|R\$/);
  });

  it("saída desconhecida fica indisponível sem herdar classificação de outra mensagem", () => {
    const markup = render([message("unknown")], [price("another-id", "free-service", "Gratuita — franquia de serviço")]);
    expect(markup).toContain("Classificação indisponível");
    expect(markup).not.toContain("Gratuita — franquia de serviço");
  });
});
