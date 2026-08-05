/**
 * crivo-agente-scheduler — esqueleto (T9).
 *
 * Fonte versionada do workflow único de varreduras agendadas (design.md —
 * "Scheduler"; AGT-05 AC2, AGT-06, AGT-07 AC3, LGPD-03 AC2). Texto de
 * ENTRADA do inliner (`scripts/n8n-inline.mjs`) — o publicável é
 * `n8n/generated/scheduler.ts`.
 *
 * Estado nesta task (T9): só o Schedule Trigger + 1 nó de exemplo provando
 * o marcador `__INLINE(...)__` com `business-hours.mjs` (usado pelas 3
 * varreduras reais). T11 estende para as 3 varreduras completas (lembretes,
 * reengajamento, escalonamento por silêncio) e publica via MCP.
 *
 * Cadência: 15 min por padrão (design.md — R3); é o primeiro parâmetro a
 * revisitar no T11 se a quota do plano n8n apertar (ver n8n/README.md).
 */
import { workflow, trigger, node } from "@n8n/workflow-sdk";

const scheduleEveryFifteenMinutes = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.3,
  config: {
    name: "A cada 15min",
    position: [0, 0],
    parameters: {
      rule: {
        interval: [{ field: "minutes", minutesInterval: 15 }],
      },
    },
  },
  output: [{}],
});

const computeWindow = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: janela de 24h (isWithin24h)",
    position: [260, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n\n" +
        "// Esqueleto T9: só demonstra o inline de business-hours.mjs — a\n" +
        "// varredura real (lembretes/reengajamento/escalonamento) é T11.\n" +
        "const now = new Date().toISOString();\n" +
        "return [{ json: { now, exampleWithin24h: isWithin24h(now, now) } }];\n",
    },
  },
  output: [{ now: "2026-08-05T12:00:00.000Z", exampleWithin24h: true }],
});

export default workflow("crivo-agente-scheduler", "crivo-agente-scheduler")
  .add(scheduleEveryFifteenMinutes)
  .to(computeWindow);
