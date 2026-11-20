/**
 * krivo-tool-agendar-reuniao — sub-workflow tool `agendar_reuniao` (T8).
 *
 * Compõe disponibilidade + criação do evento no Google Calendar + `PATCH`
 * do CRM + fila de lembrete numa unidade só (design.md — Components:
 * "Sub-workflow krivo-tool-agendar-reuniao"; "Por que 3 tools nativas e 2
 * sub-workflows"). Chamado pelo nó AI Agent (T11) via `toolWorkflow`.
 * Requisito: AGN-03.
 *
 * Contrato de entrada (`Execute Workflow Trigger`): `meetingAtProposto` é o
 * único campo preenchido pelo modelo (fromAi, no wiring do T11). Todo o
 * resto — `tenantSlug`, `waId`, `leadId`, `calendarId`,
 * `contactName`, `meetingDays`, `meetingHoursStart`, `meetingHoursEnd` —
 * vem de expressão do fluxo (o `HTTP: GET /settings` e o contexto do lead
 * já resolvidos em `principal.ts` antes do agente rodar), NUNCA de
 * `$fromAI` (mesmo risco de escrita cross-lead do design.md — Risks &
 * Concerns).
 *
 * AD-018 (tool boundary): horário fora do expediente ou ocupado DEGRADA —
 * devolve ao agente uma sugestão/motivo nomeado, nunca falha em silêncio, e
 * nunca cria efeito colateral (evento/PATCH) sem a checagem determinística
 * ter passado.
 *
 * lote-8 (T29, ATRIB-02): a ordem foi INVERTIDA — o `PATCH` do CRM acontece
 * ANTES da criação do evento. É o CRM que escolhe o corretor responsável pelo
 * horário acordado (AD-022) e devolve `assignedBroker`, que entra como
 * convidado do evento pelo e-mail. Uma recusa do CRM
 * (`sem-corretor-disponivel`, `conflito-de-agenda`) não cria evento nenhum: o
 * agente recebe o motivo e oferece outro horário. A decisão de "criar ou
 * recusar" é determinística e mora em `n8n/src/agendamento.mjs`.
 *
 * SEM FUNÇÕES CUSTOMIZADAS no nível deste arquivo (mesma regra de
 * `principal.ts`/`tool-responder-lead.ts` — confirmada pelo
 * `validate_workflow` do MCP).
 */
import { workflow, node, trigger, ifElse, newCredential, expr } from "@n8n/workflow-sdk";

// __IF(appointments)__
// __BLOCK(schedule-appointment-workflow)__
// __ENDIF__
