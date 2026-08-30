/**
 * Regras puras de instrumentação de métricas do piloto (lote-9 — BASE-02,
 * PRES-01, PRES-02, SAUDE-02).
 *
 * Função pura, sem I/O — mesmo padrão de `src/lib/broker-assignment.ts` e
 * `src/lib/permissions.ts`: a regra vive aqui e é testada em vitest; quem faz
 * I/O (a DAL, os componentes de Dashboard) apenas a consome. Nenhum
 * `server-only` aqui de propósito, pela mesma razão das duas libs acima.
 */

const DAY_MS = 86400000;

// Duração fixa do slot de reunião do produto (design.md — Assumptions).
// Mesmo valor de `MEETING_DURATION_MS` em `src/server/data/index.ts:1146` —
// mantido como constante própria aqui porque esta lib é I/O-free e não pode
// importar de um módulo `server-only`.
const MEETING_DURATION_MS = 30 * 60 * 1000;

// Prescrição da confirmação de comparecimento (design.md — PendingMeeting).
const ATTENDANCE_PRESCRIPTION_MS = 14 * DAY_MS;

// Janela de saúde da integração (SAUDE-02 AC4 / assumption confirmada):
// além desse intervalo sem sucesso, o estado é "problema" mesmo sem recusa.
const HEALTH_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Dias corridos entre `from` e `to`, inclusivo nas duas pontas (o milissegundo
 * de `to` conta) e SEM arredondar para baixo: um período de poucas horas
 * devolve uma fração, nunca zero. `to`/`from` costumam vir de
 * `resolveDashboardPeriod` (`from` = início do dia UTC, `to` = fim do dia UTC,
 * ou seja, início do dia seguinte menos 1ms) — somar 1ms antes de dividir é o
 * que faz um período de exatamente N dias completos devolver N inteiro.
 */
export function periodDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime() + 1) / DAY_MS;
}

/**
 * Normaliza um baseline mensal (30 dias) para a duração real do período
 * exibido (BASE-02 — comparação na mesma unidade). Zero é um valor válido de
 * baseline (a imobiliária registrou "zero" de propósito) — a normalização não
 * distingue "zero" de "ausência de baseline"; essa distinção é do chamador
 * (`baseline === null`), não desta função.
 */
export function normalizeMonthlyBaseline(monthly: number, days: number): number {
  return (monthly / 30) * days;
}

/**
 * Janela de cobrança de confirmação de comparecimento (PRES-01/PRES-02):
 * abre 30 minutos após o início da reunião (tempo do slot, para a reunião já
 * ter encerrado) e prescreve 14 dias depois disso.
 */
export function attendanceWindow(meetingAt: Date): {
  pendingFrom: Date;
  expiresAt: Date;
} {
  const pendingFrom = new Date(meetingAt.getTime() + MEETING_DURATION_MS);
  const expiresAt = new Date(pendingFrom.getTime() + ATTENDANCE_PRESCRIPTION_MS);
  return { pendingFrom, expiresAt };
}

/**
 * Uma reunião cobra confirmação quando: ainda não foi confirmada
 * (`attended === null`), já encerrou (`now >= pendingFrom`, limite incluso) e
 * ainda não prescreveu (`now < expiresAt`, limite excluso — no instante exato
 * da prescrição já é tarde demais).
 */
export function isPendingAttendance(
  meetingAt: Date,
  attended: boolean | null,
  now: Date
): boolean {
  if (attended !== null) return false;

  const { pendingFrom, expiresAt } = attendanceWindow(meetingAt);
  return now.getTime() >= pendingFrom.getTime() && now.getTime() < expiresAt.getTime();
}

/**
 * Estado de saúde da integração agente↔CRM (SAUDE-02). "problema" se: houve
 * qualquer recusa na janela que o chamador já filtrou (`refusalCount > 0`
 * decide sozinho, independente do sucesso mais recente), OU nunca houve
 * sucesso (`lastSuccessAt === null` — ausência total de atividade lê como
 * problema, nunca como silêncio), OU o último sucesso está a mais de 24h de
 * `now`. `refusalCount` já vem filtrado pela janela de 24h por quem chama —
 * esta função só decide o estado a partir da contagem e do `lastSuccessAt`.
 */
export function resolveIntegrationHealth(
  input: { lastSuccessAt: Date | null; refusalCount: number },
  now: Date
): "saudavel" | "problema" {
  if (input.refusalCount > 0) return "problema";
  if (input.lastSuccessAt === null) return "problema";
  if (now.getTime() - input.lastSuccessAt.getTime() > HEALTH_STALE_MS) return "problema";
  return "saudavel";
}
