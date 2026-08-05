/**
 * Horário comercial do tenant + janela de 24h da Meta (design.md — Camada de
 * decisão; AGT-04, AGT-06). Funções puras, sem I/O, sem dependências — rodam
 * dentro de um Code node do n8n. Toda conversão de timezone usa
 * `Intl.DateTimeFormat` nativo (nenhuma lib de datas é necessária).
 */

// Timezone fixa do produto no piloto (design.md — Tech Decisions: "100%
// Uberaba/MG; TZ por tenant é productização futura").
const TIMEZONE = "America/Sao_Paulo";

// Fallback seg-sex 9h-18h quando o tenant não configurou horário comercial
// (design.md — resolveBusinessHours; guia-integracao.md §8). ISO 1(segunda)
// a 7(domingo), mesma convenção do schema (`tenants.meeting_days`).
const FALLBACK_DAYS = [1, 2, 3, 4, 5];
const FALLBACK_START = "09:00";
const FALLBACK_END = "18:00";

/**
 * @typedef {{meetingDays: number[]|null, meetingHoursStart: string|null, meetingHoursEnd: string|null}} BusinessHoursSettings
 * @typedef {{days: number[], start: string, end: string}} ResolvedBusinessHours
 */

/**
 * Resolve o horário comercial efetivo do tenant (T3 — `GET /api/v1/settings`
 * shape). Os 3 campos são configurados como uma unidade só pelo CRM
 * (CONF-05 AC3: `validateBusinessHours` exige dias + início + fim juntos, ou
 * nada) — então qualquer um deles ausente/vazio aqui é tratado como
 * "horário comercial não configurado" e cai no fallback INTEIRO seg-sex
 * 9h-18h, nunca uma mistura parcial de default + configurado.
 *
 * @param {BusinessHoursSettings | null | undefined} settings
 * @returns {ResolvedBusinessHours}
 */
export function resolveBusinessHours(settings) {
  const days = settings?.meetingDays;
  const start = settings?.meetingHoursStart;
  const end = settings?.meetingHoursEnd;

  if (!Array.isArray(days) || days.length === 0 || !start || !end) {
    return { days: FALLBACK_DAYS, start: FALLBACK_START, end: FALLBACK_END };
  }

  return { days, start, end };
}

const ISO_WEEKDAY_BY_SHORT_NAME = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Extrai o dia da semana ISO (1=segunda..7=domingo) e o horário "HH:MM" de
 * um instante, na timezone informada.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {{isoWeekday: number|undefined, time: string}}
 */
function localDayAndTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[map.weekday];
  // Alguns motores ICU renderizam meia-noite como "24" em vez de "00" com
  // hour12:false — normalizado defensivamente (não observado no runtime
  // testado, mas o custo de checar é zero e a correção aqui é crítica para
  // não deixar o agente agendar fora do horário real).
  const hour = map.hour === "24" ? "00" : map.hour;
  return { isoWeekday, time: `${hour}:${map.minute}` };
}

/**
 * Verifica se um horário proposto (`meetingAtProposto`, ISO-8601) cai dentro
 * do horário comercial resolvido do tenant (design.md — AGT-04): dia da
 * semana permitido E horário dentro de `[start, end)`, na timezone
 * `America/Sao_Paulo` (fixa no produto).
 *
 * Escolha explícita de limite (documentada e testada): o início (`start`) é
 * INCLUSIVO — um slot exatamente às `start` é aceito; o fim (`end`) é
 * EXCLUSIVO — um slot exatamente às `end` (ex.: 18:00 quando `end="18:00"`)
 * é REJEITADO, porque a reunião começaria no instante em que o atendimento
 * já fechou.
 *
 * @param {string} isoDateTime - horário proposto, ISO-8601 com timezone
 * @param {BusinessHoursSettings | null | undefined} settings
 * @returns {boolean}
 */
export function isSlotWithinBusinessHours(isoDateTime, settings) {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return false;

  const { days, start, end } = resolveBusinessHours(settings);
  const { isoWeekday, time } = localDayAndTime(date, TIMEZONE);

  if (isoWeekday === undefined || !days.includes(isoWeekday)) return false;
  return time >= start && time < end;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Verifica se `now` está dentro da janela de 24h da Meta, contada a partir
 * da última mensagem RECEBIDA do lead (`lastInboundAt`) — regra da Cloud
 * API: mensagens proativas fora dessa janela exigem template pré-aprovada
 * (design.md — Tech Decisions). Janela FECHADA à direita e por decisão
 * explícita (documentada e testada): exatamente 24h decorridas já conta
 * como FORA da janela (`diff < 24h`, estrito) — mais seguro exigir template
 * do que arriscar um texto livre que a Meta rejeite por estar,
 * tecnicamente, no limite. `now` anterior a `lastInboundAt` (relógio/dado
 * inconsistente) é tratado defensivamente como FORA da janela.
 *
 * @param {string} lastInboundAt - ISO-8601
 * @param {string} now - ISO-8601
 * @returns {boolean}
 */
export function isWithin24h(lastInboundAt, now) {
  const last = new Date(lastInboundAt);
  const current = new Date(now);
  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return false;

  const diffMs = current.getTime() - last.getTime();
  return diffMs >= 0 && diffMs < TWENTY_FOUR_HOURS_MS;
}
