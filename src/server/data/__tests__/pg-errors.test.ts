import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation, pgErrorCode } from "../pg-errors";

describe("T5 — códigos de erro do Postgres", () => {
  it("reconhece código direto e envolvido pelo Drizzle em cause", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
    expect(pgErrorCode({ cause: { code: "23503" } })).toBe("23503");
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isForeignKeyViolation({ cause: { code: "23503" } })).toBe(true);
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
  });

  it.each([undefined, null, "23505", {}, { code: 23505 }, { cause: {} }])("sem código em %j devolve undefined", (error) => {
    expect(pgErrorCode(error)).toBeUndefined();
    expect(isUniqueViolation(error)).toBe(false);
    expect(isForeignKeyViolation(error)).toBe(false);
  });
});
