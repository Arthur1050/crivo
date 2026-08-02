import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_NAME_LENGTH,
  validateFileSize,
  validateMimeType,
  validateModality,
  validateName,
} from "../validation";

describe("validateName", () => {
  it("aceita um nome comum, aparado", () => {
    const result = validateName("  Imobiliária Vale do Uberaba  ");
    expect(result).toEqual({ ok: true });
  });

  it("rejeita string vazia", () => {
    const result = validateName("");
    expect(result.ok).toBe(false);
  });

  it("rejeita string composta só de espaços (vazia após o trim)", () => {
    const result = validateName("   ");
    expect(result.ok).toBe(false);
  });

  it(`aceita exatamente ${MAX_NAME_LENGTH} caracteres`, () => {
    const name = "a".repeat(MAX_NAME_LENGTH);
    const result = validateName(name);
    expect(result).toEqual({ ok: true });
  });

  it(`rejeita ${MAX_NAME_LENGTH + 1} caracteres`, () => {
    const name = "a".repeat(MAX_NAME_LENGTH + 1);
    const result = validateName(name);
    expect(result.ok).toBe(false);
  });

  it("usa o label informado na mensagem de erro", () => {
    const result = validateName("", "Nome da categoria");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Nome da categoria");
    }
  });
});

describe("validateMimeType", () => {
  for (const mimeType of ACCEPTED_MIME_TYPES) {
    it(`aceita ${mimeType}`, () => {
      expect(validateMimeType(mimeType)).toEqual({ ok: true });
    });
  }

  it("rejeita um MIME type não suportado", () => {
    const result = validateMimeType("image/png");
    expect(result.ok).toBe(false);
  });
});

describe("validateFileSize", () => {
  it(`aceita exatamente ${MAX_FILE_SIZE_BYTES} bytes (10MB)`, () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES)).toEqual({ ok: true });
  });

  it("rejeita 1 byte acima do limite", () => {
    const result = validateFileSize(MAX_FILE_SIZE_BYTES + 1);
    expect(result.ok).toBe(false);
  });

  it("aceita um bigint dentro do limite (ex.: valor lido do banco)", () => {
    expect(validateFileSize(BigInt(MAX_FILE_SIZE_BYTES))).toEqual({
      ok: true,
    });
  });

  it("rejeita um bigint acima do limite", () => {
    const result = validateFileSize(BigInt(MAX_FILE_SIZE_BYTES) + BigInt(1));
    expect(result.ok).toBe(false);
  });

  it("aceita um arquivo pequeno", () => {
    expect(validateFileSize(1024)).toEqual({ ok: true });
  });
});

describe("validateModality", () => {
  it("rejeita undefined", () => {
    const result = validateModality(undefined);
    expect(result.ok).toBe(false);
  });

  it("rejeita null", () => {
    const result = validateModality(null);
    expect(result.ok).toBe(false);
  });

  it("rejeita string vazia", () => {
    const result = validateModality("");
    expect(result.ok).toBe(false);
  });

  it("aceita 'novo'", () => {
    expect(validateModality("novo")).toEqual({ ok: true });
  });

  it("aceita 'usado'", () => {
    expect(validateModality("usado")).toEqual({ ok: true });
  });

  it("aceita 'ambos'", () => {
    expect(validateModality("ambos")).toEqual({ ok: true });
  });
});
