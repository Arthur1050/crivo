/**
 * Subtítulo real do card "Agente IA" da sidebar (lote-7 — SHELL-01).
 *
 * Função pura: recebe o instante da última mensagem `sender = 'agente'` do
 * tenant ativo (já lido do CRM por `getLastAgentMessageAt`, nunca da
 * instância n8n — INT-08) e devolve o texto certo. `now` é sempre injetado,
 * nunca lido internamente — o teste nunca depende do relógio real.
 *
 * Sem nenhuma mensagem do agente ainda, o subtítulo é um estado ocioso
 * explícito (spec.md — "Sidebar mostra atividade real do agente" AC2): nunca
 * inventa atividade que não aconteceu.
 */

import { formatRelativeTimePtBR } from "./relative-time";

const IDLE_SUBTITLE = "Nenhuma mensagem enviada ainda";

export function formatAgentActivitySubtitle(
  lastAgentMessageAt: Date | string | null,
  now: Date
): string {
  if (lastAgentMessageAt === null) {
    return IDLE_SUBTITLE;
  }
  return `Ativo pela última vez ${formatRelativeTimePtBR(lastAgentMessageAt, now)}`;
}
