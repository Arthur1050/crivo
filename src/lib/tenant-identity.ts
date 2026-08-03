/**
 * Subtítulo de localização do header de marca da sidebar
 * (redesign-crm-astryx — RD-01 AC1/AC5).
 *
 * Retorna `"{city}, {state}"` apenas quando AMBOS existem e têm conteúdo;
 * caso contrário retorna `null` para que o header simplesmente omita o
 * subtítulo, sem placeholder nem vírgula solta (spec.md — Edge Cases:
 * "sidebar degrada graciosamente").
 */
export function formatTenantLocation(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  const trimmedCity = city?.trim() ?? "";
  const trimmedState = state?.trim() ?? "";

  if (trimmedCity === "" || trimmedState === "") {
    return null;
  }

  return `${trimmedCity}, ${trimmedState}`;
}
