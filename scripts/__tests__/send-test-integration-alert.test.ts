import { describe, expect, it, vi } from "vitest";
import { sendTestIntegrationAlert } from "../send-test-integration-alert";
import type { EmailResult } from "../../src/server/auth/email";

const OPERATOR = "operador@fixture.test";

function harness(send: (message: { to: string; subject: string; text: string }) => Promise<EmailResult>) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { send, log: (line: string) => out.push(line), error: (line: string) => err.push(line) } };
}

describe("L15 T7 — comando de envio de teste do alerta (ALERTA-04 AC3)", () => {
  it("envia ao destinatário do ambiente com o assunto [teste] [crivo] e sai com 0", async () => {
    const send = vi.fn(async (): Promise<EmailResult> => ({ ok: true, id: "email_1" }));
    const { deps, out } = harness(send);

    const code = await sendTestIntegrationAlert({ ...deps, operatorEmail: OPERATOR });

    expect(code).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }];
    expect(message[0].to).toBe(OPERATOR);
    expect(message[0].subject.startsWith("[teste] [crivo] Integração com problema em ")).toBe(true);
    expect(out.join("\n")).not.toContain(OPERATOR);
  });

  it("o exemplo usa só tenant fictício, no mesmo formato do alerta", async () => {
    const send = vi.fn(async (): Promise<EmailResult> => ({ ok: true, id: null }));
    const { deps } = harness(send);

    await sendTestIntegrationAlert({ ...deps, operatorEmail: OPERATOR });

    const [message] = send.mock.calls[0] as unknown as [{ subject: string; text: string }];
    expect(message.text).toContain("Imobiliária Exemplo (teste)");
    expect(message.text).toContain("exemplo-teste");
    expect(message.text).toContain("Última mensagem do agente:");
    expect(message.subject).toContain("em 1 imobiliária(s)");
  });

  it.each([[undefined], [""], ["  "]])("destinatário %j: sai com 1 sem enviar", async (operatorEmail) => {
    const send = vi.fn(async (): Promise<EmailResult> => ({ ok: true, id: null }));
    const { deps, err } = harness(send);

    const code = await sendTestIntegrationAlert({ ...deps, operatorEmail });

    expect(code).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("CRIVO_OPERATOR_ALERT_EMAIL");
  });

  it("ok: false sai com 1 e imprime o erro do adaptador", async () => {
    const send = vi.fn(async (): Promise<EmailResult> => ({ ok: false, error: "Domínio não verificado" }));
    const { deps, err } = harness(send);

    const code = await sendTestIntegrationAlert({ ...deps, operatorEmail: OPERATOR });

    expect(code).toBe(1);
    expect(err.join("\n")).toContain("Domínio não verificado");
    expect(err.join("\n")).not.toContain(OPERATOR);
  });
});
