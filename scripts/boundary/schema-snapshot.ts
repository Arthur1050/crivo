import { generateDrizzleJson } from "drizzle-kit/api";

// A ordem das exportações e os UUIDs de execução não fazem parte do DDL.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, sortKeys(entry)])
    );
  }
  return value;
}

export function snapshotSchema(schema: Record<string, unknown>): unknown {
  return sortKeys({
    ...generateDrizzleJson(schema),
    id: "00000000-0000-0000-0000-000000000000",
    prevId: "00000000-0000-0000-0000-000000000000",
  });
}
