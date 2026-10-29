import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOLDER_ERROR_MESSAGES,
  FOLDER_NAME_LABEL,
  MAX_DOCUMENTS_PER_MOVE,
  NO_FOLDER_LABEL,
  NO_FOLDER_PARAM,
  folderHref,
  isUuid,
  parseFolderParam,
} from "../document-folders";

const FOLDER_ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("parseFolderParam — parâmetro `pasta` da URL (PVAZIO-01 AC4, PABRIR-01 AC1, PRAIZ-01 AC8)", () => {
  it("ausente ou vazio é a raiz com todas as pastas", () => {
    expect(parseFolderParam(undefined)).toEqual({ kind: "todas" });
    expect(parseFolderParam("")).toEqual({ kind: "todas" });
  });

  it('"sem-pasta" é o filtro de documentos sem pasta', () => {
    expect(parseFolderParam("sem-pasta")).toEqual({ kind: "sem-pasta" });
  });

  it("UUID abre a pasta", () => {
    expect(parseFolderParam(FOLDER_ID)).toEqual({ kind: "pasta", folderId: FOLDER_ID });
  });

  it("UUID em maiúsculas abre a mesma pasta, em minúsculas", () => {
    expect(parseFolderParam(FOLDER_ID.toUpperCase())).toEqual({ kind: "pasta", folderId: FOLDER_ID });
  });

  it("array usa o primeiro valor", () => {
    expect(parseFolderParam([FOLDER_ID, "sem-pasta"])).toEqual({ kind: "pasta", folderId: FOLDER_ID });
    expect(parseFolderParam(["sem-pasta", FOLDER_ID])).toEqual({ kind: "sem-pasta" });
  });

  it("qualquer outro valor é pasta inválida, sem chegar ao banco", () => {
    expect(parseFolderParam("abc")).toEqual({ kind: "invalida" });
    expect(parseFolderParam(`${FOLDER_ID}0`)).toEqual({ kind: "invalida" });
    expect(parseFolderParam("Sem-Pasta")).toEqual({ kind: "invalida" });
  });
});

describe("isUuid — id que não é UUID nunca vai ao banco (PLER-01 AC8)", () => {
  it("aceita o formato 8-4-4-4-12 em hexadecimal, em qualquer caixa", () => {
    expect(isUuid(FOLDER_ID)).toBe(true);
    expect(isUuid(FOLDER_ID.toUpperCase())).toBe(true);
  });

  it("recusa outros formatos", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid(`${FOLDER_ID}0`)).toBe(false);
    expect(isUuid(FOLDER_ID.slice(1))).toBe(false);
    expect(isUuid(FOLDER_ID.replace(/-/g, ""))).toBe(false);
    expect(isUuid("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6g")).toBe(false);
    expect(isUuid(` ${FOLDER_ID}`)).toBe(false);
  });
});

describe("folderHref — link da pasta (PRAIZ-01 AC4, PLINK-01 AC1)", () => {
  it("aponta para /documentos?pasta=<id>", () => {
    expect(folderHref(FOLDER_ID)).toBe(`/documentos?pasta=${FOLDER_ID}`);
  });
});

describe("constantes do contrato", () => {
  it("valor reservado, rótulo, teto e rótulo do nome são os da spec", () => {
    expect(NO_FOLDER_PARAM).toBe("sem-pasta");
    expect(NO_FOLDER_LABEL).toBe("Sem pasta");
    expect(MAX_DOCUMENTS_PER_MOVE).toBe(100);
    expect(FOLDER_NAME_LABEL).toBe("Nome da pasta");
  });

  it("mensagens fixas dos erros de pasta (PCRIAR-01 AC3, PREN-01 AC5, PMOVER-01 AC5, AC7)", () => {
    expect(FOLDER_ERROR_MESSAGES).toEqual({
      "nome-duplicado": "Já existe uma pasta com esse nome.",
      "pasta-nao-encontrada": "Pasta não encontrada.",
      "documento-nao-encontrado": "Documento não encontrado.",
      "selecao-invalida": "Selecione de 1 a 100 documentos.",
    });
  });
});

describe("pureza do módulo — T1 Done when (L-020)", () => {
  it("não importa nada: nem src/server, nem src/db, nem server-only", () => {
    const source = readFileSync(path.resolve(__dirname, "../document-folders.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from ["'](.+)["'];?$/gm)].map((m) => m[1]);
    const sideEffectImports = [...source.matchAll(/^import ["'](.+)["'];?$/gm)].map((m) => m[1]);
    expect([...imports, ...sideEffectImports]).toEqual([]);
  });
});
