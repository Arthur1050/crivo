/**
 * Ponte entre os tokens de movimento da Astryx (`--duration-fast`,
 * `--duration-medium`, …), que são strings CSS, e as APIs que exigem número
 * em milissegundos — Recharts, por exemplo, só aceita `animationDuration`
 * numérico.
 *
 * Lógica pura em `src/lib` porque tem branching real (unidade `s` vs `ms`,
 * token ausente, valor não numérico) e a regra viva do projeto não deixa
 * isso inline num componente que só passa pelo build gate.
 */

/**
 * Converte um valor de duração CSS em milissegundos.
 *
 * Aceita as formas que a Astryx emite (`.175s`, `0.41s`) e também `ms`.
 * Devolve `fallbackMs` quando o token está vazio, ausente ou ilegível — um
 * token que mudou de formato nunca deve virar `NaN` numa prop de animação.
 */
export function parseDurationMs(value: string | null | undefined, fallbackMs: number): number {
  if (typeof value !== "string") {
    return fallbackMs;
  }

  const trimmed = value.trim();
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/.exec(trimmed);

  if (match === null) {
    return fallbackMs;
  }

  const amount = Number.parseFloat(match[1]);

  if (!Number.isFinite(amount) || amount < 0) {
    return fallbackMs;
  }

  return match[2] === "s" ? amount * 1000 : amount;
}
