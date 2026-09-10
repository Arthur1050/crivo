/**
 * Normalização de texto para busca (lote-11 — IMOV-01; design.md — Data
 * Models, "Colunas `*Normalized`"). Função pura, sem I/O — mesmo padrão de
 * `src/lib/permissions.ts` e `src/lib/broker-assignment.ts`. Sem `server-only`
 * de propósito: o mesmo código roda na escrita (DAL) e no filtro (contrato de
 * integração), o que é o que garante que os dois lados casem sem depender da
 * extensão `unaccent` do Postgres (design.md — Risks & Concerns).
 *
 * Reduz o valor a uma forma comparável: minúsculas, sem diacrítico (acento,
 * cedilha), espaços internos colapsados a um único espaço, e aparado nas
 * pontas.
 */
export function normalizeForSearch(value: string): string {
  // Bloco Unicode "Combining Diacritical Marks" (U+0300–U+036F): cobre acento
  // (á, é, í...) e cedilha (ç -> c + combining cedilla) depois de `NFD`.
  const COMBINING_DIACRITICS = /[̀-ͯ]/g;

  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
