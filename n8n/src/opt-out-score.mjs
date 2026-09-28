/**
 * Pontuação da medição do classificador de opt-out (lote-13 — design.md,
 * módulo `n8n/src/opt-out-score.mjs`; spec.md OPTMED-01 AC5, AC6). Função
 * pura, sem I/O, sem dependências. É inlined só no workflow de medição
 * (`crivo-medicao-opt-out`) e fica FORA da identidade do classificador:
 * mudar a pontuação não muda o que é publicado no agente.
 *
 * Entrada: uma linha por EXECUÇÃO do classificador,
 *   `{ id, faixa, categoria }`
 * - `id`: id da frase no corpus (`n8n/fixtures/opt-out-corpus.json`);
 * - `faixa`: faixa esperada da frase (`explicita` | `ambigua` | `fora`);
 * - `categoria`: saída do classificador (`explicita` | `ambigua` | `fora` |
 *   `other` | `erro`). Qualquer valor diferente de `explicita` e `ambigua`
 *   (inclusive `other` e `erro`) conta como `fora` — nunca como explícita.
 *
 * Saída (`MeasurementReport` do design, parte calculada aqui; `date`,
 * `modelId`, `classifierHash`, `workflowVersion` e `repeticoes` são
 * carimbados por `scripts/opt-out-measurement.ts stamp`):
 *   {
 *     porFrase: { id, faixa, explicita, ambigua, fora }[],  // ordem de 1ª aparição
 *     porFaixa: { explicita|ambigua|fora: { explicita, ambigua, fora, total } },
 *     falsosPositivos,  // execuções de frases ambigua|fora classificadas explicita
 *     taxaExplicita,    // explícitas classificadas explicita / total explícitas (0 se não houver)
 *     veredito,         // "APROVADO" | "REPROVADO"
 *   }
 *
 * Barra (OPTMED-01 AC6): APROVADO só se `falsosPositivos === 0` E
 * `taxaExplicita >= minExplicitRate`. A fronteira exata aprova (L-023).
 */

export const DEFAULT_MIN_EXPLICIT_RATE = 0.9;

const FAIXAS = ["explicita", "ambigua", "fora"];

/**
 * @param {unknown} categoria
 * @returns {"explicita" | "ambigua" | "fora"}
 */
function bucketOf(categoria) {
  return categoria === "explicita" || categoria === "ambigua" ? categoria : "fora";
}

/**
 * @param {{ id: string, faixa: string, categoria: string }[]} results
 * @param {{ minExplicitRate?: number }} [options]
 */
export function scoreMeasurement(results, { minExplicitRate = DEFAULT_MIN_EXPLICIT_RATE } = {}) {
  /** @type {Map<string, { id: string, faixa: string, explicita: number, ambigua: number, fora: number }>} */
  const byPhrase = new Map();
  /** @type {Record<string, { explicita: number, ambigua: number, fora: number, total: number }>} */
  const porFaixa = {};
  for (const faixa of FAIXAS) porFaixa[faixa] = { explicita: 0, ambigua: 0, fora: 0, total: 0 };

  for (const { id, faixa, categoria } of results) {
    const bucket = bucketOf(categoria);
    if (!byPhrase.has(id)) byPhrase.set(id, { id, faixa, explicita: 0, ambigua: 0, fora: 0 });
    byPhrase.get(id)[bucket] += 1;
    if (porFaixa[faixa]) {
      porFaixa[faixa][bucket] += 1;
      porFaixa[faixa].total += 1;
    }
  }

  const falsosPositivos = porFaixa.ambigua.explicita + porFaixa.fora.explicita;
  const taxaExplicita = porFaixa.explicita.total === 0 ? 0 : porFaixa.explicita.explicita / porFaixa.explicita.total;
  const veredito = falsosPositivos === 0 && taxaExplicita >= minExplicitRate ? "APROVADO" : "REPROVADO";

  return { porFrase: [...byPhrase.values()], porFaixa, falsosPositivos, taxaExplicita, veredito };
}
