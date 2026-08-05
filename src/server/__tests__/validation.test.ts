import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  CATEGORY_COLOR_PALETTE,
  LEAD_STATUSES,
  MAX_FILE_SIZE_BYTES,
  MAX_NAME_LENGTH,
  validateBusinessHours,
  validateCategoryColor,
  validateFileSize,
  validateLeadStatus,
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

describe("validateCategoryColor", () => {
  for (const color of CATEGORY_COLOR_PALETTE) {
    it(`aceita '${color}' (paleta fixa)`, () => {
      expect(validateCategoryColor(color)).toEqual({ ok: true });
    });
  }

  it("rejeita uma cor fora da paleta", () => {
    const result = validateCategoryColor("magenta");
    expect(result.ok).toBe(false);
  });

  it("rejeita string vazia", () => {
    const result = validateCategoryColor("");
    expect(result.ok).toBe(false);
  });

  it("rejeita a mesma cor com casing diferente ('Gray' !== 'gray')", () => {
    const result = validateCategoryColor("Gray");
    expect(result.ok).toBe(false);
  });
});

describe("validateLeadStatus", () => {
  for (const status of LEAD_STATUSES) {
    it(`aceita '${status}' (enum lead_status)`, () => {
      expect(validateLeadStatus(status)).toEqual({ ok: true });
    });
  }

  it("rejeita um status fora do enum", () => {
    const result = validateLeadStatus("arquivado");
    expect(result.ok).toBe(false);
  });

  it("rejeita string vazia", () => {
    const result = validateLeadStatus("");
    expect(result.ok).toBe(false);
  });
});

describe("validateBusinessHours (CONF-05)", () => {
  it("aceita os 3 campos vazios (horário comercial não configurado — limpa)", () => {
    const result = validateBusinessHours({
      meetingDays: null,
      meetingHoursStart: null,
      meetingHoursEnd: null,
    });
    expect(result).toEqual({ ok: true });
  });

  it("aceita meetingDays null e horas em string vazia (equivalente a ausente)", () => {
    const result = validateBusinessHours({
      meetingDays: null,
      meetingHoursStart: "",
      meetingHoursEnd: "",
    });
    expect(result).toEqual({ ok: true });
  });

  it("aceita dias + janela completos com início < fim", () => {
    const result = validateBusinessHours({
      meetingDays: [1, 2, 3, 4, 5],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "18:00",
    });
    expect(result).toEqual({ ok: true });
  });

  it("aceita um único dia (sábado) com janela reduzida", () => {
    const result = validateBusinessHours({
      meetingDays: [6],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "12:00",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejeita início igual ao fim (início < fim é estrito)", () => {
    const result = validateBusinessHours({
      meetingDays: [1],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "09:00",
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita início depois do fim", () => {
    const result = validateBusinessHours({
      meetingDays: [1],
      meetingHoursStart: "18:00",
      meetingHoursEnd: "09:00",
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita 0 dias com janela preenchida", () => {
    const result = validateBusinessHours({
      meetingDays: [],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "18:00",
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita meetingDays null com janela preenchida (equivalente a 0 dias)", () => {
    const result = validateBusinessHours({
      meetingDays: null,
      meetingHoursStart: "09:00",
      meetingHoursEnd: "18:00",
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita só o início preenchido, sem o fim", () => {
    const result = validateBusinessHours({
      meetingDays: [1, 2, 3],
      meetingHoursStart: "09:00",
      meetingHoursEnd: null,
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita só o fim preenchido, sem o início", () => {
    const result = validateBusinessHours({
      meetingDays: [1, 2, 3],
      meetingHoursStart: null,
      meetingHoursEnd: "18:00",
    });
    expect(result.ok).toBe(false);
  });
});
