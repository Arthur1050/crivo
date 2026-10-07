/**
 * Regras puras do alerta de queda da integração (lote-15 — ALERTA-01,
 * ALERTA-02, AD-039).
 *
 * Sem I/O, irmão de `pilot-metrics.ts` (L-020): decide, por tenant, entre
 * inicializar, recuperar, alertar ou nada, e monta assunto e corpo do e-mail.
 * Quem lê o banco e envia o e-mail está em `src/server/integration/`.
 */
import { resolveIntegrationHealth } from "./pilot-metrics";

export type IntegrationHealthState = "saudavel" | "problema";

export interface TenantHealthSnapshot {
  tenantId: string;
  name: string;
  slug: string;
  storedState: IntegrationHealthState | null;
  storedChangedAt: Date | null;
  lastAgentMessageAt: Date | null;
  refusals: { code: string | null; route: string; count: number }[];
}

export interface AlertPlan {
  initialize: { tenantId: string; state: IntegrationHealthState }[];
  recover: string[];
  alert: TenantHealthSnapshot[];
}

export function planIntegrationAlerts(snapshots: TenantHealthSnapshot[], now: Date): AlertPlan {
  const plan: AlertPlan = { initialize: [], recover: [], alert: [] };
  for (const snapshot of snapshots) {
    const state = resolveIntegrationHealth(
      {
        lastSuccessAt: snapshot.lastAgentMessageAt,
        refusalCount: snapshot.refusals.reduce((sum, refusal) => sum + refusal.count, 0),
      },
      now
    );
    if (snapshot.storedState === null) {
      plan.initialize.push({ tenantId: snapshot.tenantId, state });
    } else if (snapshot.storedState === "saudavel" && state === "problema") {
      plan.alert.push(snapshot);
    } else if (snapshot.storedState === "problema" && state === "saudavel") {
      plan.recover.push(snapshot.tenantId);
    }
  }
  return plan;
}

function describeTenant(snapshot: TenantHealthSnapshot): string {
  const lines = [`${snapshot.name} (${snapshot.slug})`];
  if (snapshot.refusals.length > 0) {
    lines.push("  Recusas do contrato nas últimas 24h:");
    for (const refusal of snapshot.refusals) {
      lines.push(`    ${refusal.code ?? "sem code"} ${refusal.route}: ${refusal.count}`);
    }
  } else {
    lines.push("  Sem recusas nas últimas 24h; o agente está em silêncio.");
  }
  lines.push(
    `  Última mensagem do agente: ${snapshot.lastAgentMessageAt?.toISOString() ?? "nunca"}`
  );
  return lines.join("\n");
}

export function formatIntegrationAlertEmail(
  alerts: TenantHealthSnapshot[],
  options: { test?: boolean } = {}
): { subject: string; text: string } {
  const subject = `${options.test ? "[teste] " : ""}[crivo] Integração com problema em ${alerts.length} imobiliária(s)`;
  const text = [
    "A integração do agente com o CRM passou a ter problema nas imobiliárias abaixo.",
    "",
    alerts.map(describeTenant).join("\n\n"),
  ].join("\n");
  return { subject, text };
}
