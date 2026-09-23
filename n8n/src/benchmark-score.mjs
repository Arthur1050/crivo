/**
 * Pontuação do benchmark de teto (lote-12 — T34). Separada do gerador de
 * corpus porque o nó que pontua só precisa disto: inlinear o gerador inteiro
 * ali dobraria o tamanho do workflow publicado sem uso.
 */

function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Um fato conta como recuperado quando o valor aparece na resposta. */
export function scoreBenchmarkAnswer(answer, facts) {
  const text = normalize(answer);
  const found = facts.filter((fact) => {
    const value = normalize(fact.value);
    if (text.includes(value)) return true;
    // "12 dias úteis" também vale como "12 dias"; a taxa aceita ponto ou vírgula.
    const number = value.match(/[\d.,]+/)?.[0];
    if (!number) return false;
    return text.includes(number) || text.includes(number.replace(",", "."));
  });
  return {
    found: found.map((fact) => fact.position),
    missing: facts.filter((fact) => !found.includes(fact)).map((fact) => fact.position),
  };
}
