/** Inteiro ≥ 0, aceito como `number` ou `string` numérica — gravado bigint
 * (bigint não é serializável em JSON, então nunca chega como tal). */
export function parseBudgetCents(value: unknown): bigint | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Resolve um campo opcional-e-anulável do patch: chave ausente no JSON →
 * `{ present: false }` (dto não ganha a chave — coluna intocada, padrão
 * SPG-1); `null` explícito → `{ present: true, ok: true, value: null }`
 * (limpa a coluna); valor presente → validado por `parseValue` (`undefined`
 * de `parseValue` sinaliza formato inválido).
 */
export function optionalNullableField<T>(
  body: Record<string, unknown>,
  key: string,
  parseValue: (raw: unknown) => T | undefined
):
  | { present: false }
  | { present: true; ok: true; value: T | null }
  | { present: true; ok: false } {
  if (!(key in body)) return { present: false };
  const raw = body[key];
  if (raw === null) return { present: true, ok: true, value: null };
  const parsed = parseValue(raw);
  return parsed === undefined
    ? { present: true, ok: false }
    : { present: true, ok: true, value: parsed };
}
