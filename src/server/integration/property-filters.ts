/**
 * Parser puro dos filtros de busca de `GET /api/v1/properties` (lote-11 —
 * BUSCA-01/03; design.md — `src/server/integration/property-filters.ts`).
 * Sem I/O — mesmo padrão `ParseResult` de `parsers.ts`, e a mesma disciplina
 * do `parsers.ts:202`: os valores aceitos de enum vêm direto do schema
 * (`modalityEnum`/`propertyKindEnum`), nunca duplicados como lista literal.
 *
 * Módulo IRMÃO de `parsers.ts`, não extensão dele: `parsers.ts` parseia
 * corpo JSON de ESCRITA de lead; este parseia query string de LEITURA de
 * imóvel — responsabilidades e formatos de retorno distintos (design.md —
 * Components).
 */
import { modalityEnum, propertyKindEnum } from "../../db/schema";
import { normalizeForSearch } from "../../lib/normalize-text";
import type { Modality, PropertyKind } from "../data";

export type PropertyFiltersParseResult =
  | { ok: true; filters: PropertySearchFilters }
  | { ok: false; detail: string };

/**
 * Filtros já validados e prontos para a consulta (T12 —
 * `searchVisibleProperties`). Preço em CENTAVOS aqui — a conversão de reais
 * (o que a query string recebe) para centavos acontece só neste módulo, uma
 * única vez. `neighborhood`/`city` já saem normalizados
 * (`normalizeForSearch`), prontos para comparar contra as colunas
 * `*Normalized`.
 */
export interface PropertySearchFilters {
  modality?: Modality;
  kind?: PropertyKind;
  neighborhood?: string;
  city?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  minBedrooms?: number;
}

const CENTS_PER_REAL = 100;

/** Inteiro maior que zero em formato estritamente decimal — nunca sinal,
 * ponto ou notação científica reinterpretados. */
function parsePositiveInteger(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * `parsePropertyFilters(params)` — BUSCA-01 AC2, BUSCA-03. Todo filtro é
 * opcional; ausência de todos é aceita (devolve `{}`). Cada filtro presente é
 * validado isoladamente antes de qualquer combinação entre eles.
 */
export function parsePropertyFilters(
  params: URLSearchParams
): PropertyFiltersParseResult {
  const filters: PropertySearchFilters = {};

  const modalidade = params.get("modalidade");
  if (modalidade !== null) {
    if (!(modalityEnum.enumValues as readonly string[]).includes(modalidade)) {
      return {
        ok: false,
        detail: `Parâmetro 'modalidade' inválido. Valores aceitos: ${modalityEnum.enumValues.join(", ")}.`,
      };
    }
    filters.modality = modalidade as Modality;
  }

  const tipo = params.get("tipo");
  if (tipo !== null) {
    if (!(propertyKindEnum.enumValues as readonly string[]).includes(tipo)) {
      return {
        ok: false,
        detail: `Parâmetro 'tipo' inválido. Valores aceitos: ${propertyKindEnum.enumValues.join(", ")}.`,
      };
    }
    filters.kind = tipo as PropertyKind;
  }

  const bairro = params.get("bairro");
  if (bairro !== null) {
    filters.neighborhood = normalizeForSearch(bairro);
  }

  const cidade = params.get("cidade");
  if (cidade !== null) {
    filters.city = normalizeForSearch(cidade);
  }

  const precoMinRaw = params.get("precoMin");
  if (precoMinRaw !== null) {
    const reais = parsePositiveInteger(precoMinRaw);
    if (reais === undefined) {
      return {
        ok: false,
        detail:
          "Parâmetro 'precoMin' deve ser um inteiro maior que zero, em reais.",
      };
    }
    filters.minPriceCents = reais * CENTS_PER_REAL;
  }

  const precoMaxRaw = params.get("precoMax");
  if (precoMaxRaw !== null) {
    const reais = parsePositiveInteger(precoMaxRaw);
    if (reais === undefined) {
      return {
        ok: false,
        detail:
          "Parâmetro 'precoMax' deve ser um inteiro maior que zero, em reais.",
      };
    }
    filters.maxPriceCents = reais * CENTS_PER_REAL;
  }

  // Edge Case: precoMin > precoMax é recusa explícita, nunca lista vazia
  // silenciosa — o detalhe nomeia os dois valores em conflito.
  if (
    filters.minPriceCents !== undefined &&
    filters.maxPriceCents !== undefined &&
    filters.minPriceCents > filters.maxPriceCents
  ) {
    return {
      ok: false,
      detail: `Parâmetro 'precoMin' (${precoMinRaw}) não pode ser maior que 'precoMax' (${precoMaxRaw}).`,
    };
  }

  const quartosMinRaw = params.get("quartosMin");
  if (quartosMinRaw !== null) {
    const value = parsePositiveInteger(quartosMinRaw);
    if (value === undefined) {
      return {
        ok: false,
        detail: "Parâmetro 'quartosMin' deve ser um inteiro maior que zero.",
      };
    }
    filters.minBedrooms = value;
  }

  return { ok: true, filters };
}
