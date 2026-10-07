/**
 * `npm run alert:send-test` — envia ao operador um alerta de exemplo `[teste]`
 * (lote-15, ALERTA-04 AC3), no mesmo formato do alerta real e com um tenant
 * fictício, para provar que o Resend entrega no endereço de
 * `CRIVO_OPERATOR_ALERT_EMAIL` antes do deploy. Não lê banco nem tenant real.
 * Uso: `npm run alert:send-test`
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { formatIntegrationAlertEmail, type TenantHealthSnapshot } from "../src/lib/integration-alert";
import { sendIntegrationAlertEmail, type EmailResult } from "../src/server/auth/email";

const EXAMPLE: TenantHealthSnapshot = {
  tenantId: "00000000-0000-0000-0000-000000000000",
  name: "Imobiliária Exemplo (teste)",
  slug: "exemplo-teste",
  storedState: "saudavel",
  storedChangedAt: null,
  lastAgentMessageAt: new Date("2026-01-01T12:00:00.000Z"),
  refusals: [{ code: "invalid_token", route: "/api/v1/leads", count: 2 }],
};

export async function sendTestIntegrationAlert(deps: {
  operatorEmail: string | undefined;
  send: (message: { to: string; subject: string; text: string }) => Promise<EmailResult>;
  log: (line: string) => void;
  error: (line: string) => void;
}): Promise<number> {
  const to = deps.operatorEmail?.trim();
  if (!to) {
    deps.error("CRIVO_OPERATOR_ALERT_EMAIL ausente: defina o destinatário no ambiente local e rode de novo.");
    return 1;
  }
  const { subject, text } = formatIntegrationAlertEmail([EXAMPLE], { test: true });
  const result = await deps.send({ to, subject, text });
  if (!result.ok) {
    deps.error(`Envio falhou: ${result.error}`);
    return 1;
  }
  deps.log(`Alerta de teste enviado ao destinatário configurado (id do provedor: ${result.id ?? "sem id"}).`);
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  sendTestIntegrationAlert({
    operatorEmail: process.env.CRIVO_OPERATOR_ALERT_EMAIL,
    send: sendIntegrationAlertEmail,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then((code) => {
    // exitCode em vez de exit(): no Windows, exit() com o socket do provedor ainda
    // fechando derruba o libuv (código 127) mesmo com o envio feito.
    process.exitCode = code;
  });
}
