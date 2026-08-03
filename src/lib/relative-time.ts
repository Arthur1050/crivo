/**
 * Tempo relativo em pt-BR.
 *
 * O `Timestamp` da Astryx tem as strings de tempo relativo cravadas em
 * inglês no código da lib (`Timestamp.js` — "8 hours ago"), sem prop de
 * locale e sem chave no catálogo de i18n, então o
 * `InternationalizationProvider` não alcança. Como só duas telas usam
 * formato relativo, formatar aqui sai muito mais barato que dar `swizzle`
 * no componente inteiro.
 *
 * `now` é injetável de propósito: teste de tempo nunca deve depender do
 * relógio real.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function plural(amount: number, singular: string, pluralForm: string): string {
  return `há ${amount} ${amount === 1 ? singular : pluralForm}`;
}

/**
 * Formata um instante como tempo relativo ao `now` informado.
 *
 * Instantes no futuro colapsam para "agora": o dado deste CRM é sempre
 * passado (primeiro contato, última mensagem), então um valor futuro
 * significa relógio dessincronizado, não uma previsão — e "em 3 minutos"
 * seria mais confuso que útil.
 */
export function formatRelativeTimePtBR(value: Date | string, now: Date): string {
  const instant = value instanceof Date ? value : new Date(value);
  const elapsed = now.getTime() - instant.getTime();

  if (!Number.isFinite(elapsed) || elapsed < MINUTE) {
    return "agora";
  }

  if (elapsed < HOUR) {
    return plural(Math.floor(elapsed / MINUTE), "minuto", "minutos");
  }

  if (elapsed < DAY) {
    return plural(Math.floor(elapsed / HOUR), "hora", "horas");
  }

  if (elapsed < MONTH) {
    return plural(Math.floor(elapsed / DAY), "dia", "dias");
  }

  if (elapsed < YEAR) {
    return plural(Math.floor(elapsed / MONTH), "mês", "meses");
  }

  return plural(Math.floor(elapsed / YEAR), "ano", "anos");
}
