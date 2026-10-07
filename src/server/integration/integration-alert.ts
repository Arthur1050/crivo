import "server-only";
import { formatIntegrationAlertEmail, planIntegrationAlerts } from "../../lib/integration-alert";
import type { EmailResult } from "../auth/email";
import {
  claimIntegrationProblems,
  getTenantHealthSnapshots,
  recordTenantHealthStates,
  releaseIntegrationProblems,
} from "../data/integration-health";

const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface IntegrationAlertDependencies {
  /** `CRIVO_OPERATOR_ALERT_EMAIL`; ausente ou vazio impede o envio, nunca o libera. */
  operatorEmail: string | undefined;
  send: (message: { to: string; subject: string; text: string }) => Promise<EmailResult>;
}

export interface IntegrationAlertResult {
  evaluated: number;
  sent: number;
  skipped: "destinatario-ausente" | null;
  sendFailed: boolean;
}

/**
 * Alerta de queda da integração (lote-15, AD-039): avalia todos os tenants com
 * a regra do Dashboard, grava inicializações e recuperações, reivindica as
 * quedas por compare-and-set e manda um único e-mail ao operador. Sem
 * destinatário ou com envio falho, a queda não fica gravada e a próxima
 * execução tenta de novo (L-030).
 */
export async function runIntegrationAlert(
  now: Date,
  deps: IntegrationAlertDependencies
): Promise<IntegrationAlertResult> {
  const snapshots = await getTenantHealthSnapshots(new Date(now.getTime() - HEALTH_WINDOW_MS));
  const plan = planIntegrationAlerts(snapshots, now);
  const result: IntegrationAlertResult = {
    evaluated: snapshots.length,
    sent: 0,
    skipped: null,
    sendFailed: false,
  };

  await recordTenantHealthStates([
    ...plan.initialize.map(({ tenantId, state }) => ({ tenantId, state, at: now })),
    ...plan.recover.map((tenantId) => ({ tenantId, state: "saudavel" as const, at: now })),
  ]);

  const to = deps.operatorEmail?.trim();
  if (!to) {
    result.skipped = "destinatario-ausente";
    return result;
  }

  const claimed = await claimIntegrationProblems(
    plan.alert.map((snapshot) => snapshot.tenantId),
    now
  );
  if (claimed.length === 0) return result;

  const claimedIds = new Set(claimed.map((claim) => claim.tenantId));
  const { subject, text } = formatIntegrationAlertEmail(
    plan.alert.filter((snapshot) => claimedIds.has(snapshot.tenantId))
  );
  let sent: EmailResult;
  try {
    sent = await deps.send({ to, subject, text });
  } catch (error) {
    sent = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (sent.ok) {
    result.sent = claimed.length;
  } else {
    await releaseIntegrationProblems(claimed);
    result.sendFailed = true;
  }
  return result;
}
