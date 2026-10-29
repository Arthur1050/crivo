import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOLDER_FIXTURES, FOLDER_NOW } from "./folder-fixtures";
import {
  deleteFolderCopy, folderErrorMessage, folderIdFromSelector,
  folderSelectorOptions, formatFileCount, formatFolderCount,
  formatFolderUpdatedLabel, NO_FOLDER_OPTION_VALUE, toFolderCardItems,
} from "../folder-presentation";

describe("apresentação das pastas (T18)", () => {
  it.each([[0, "0 arquivos"], [1, "1 arquivo"], [2, "2 arquivos"]])("conta %s arquivos", (count, label) => {
    expect(formatFileCount(Number(count))).toBe(label);
  });
  it.each([[0, "0 pastas"], [1, "1 pasta"], [2, "2 pastas"]])("conta %s pastas", (count, label) => {
    expect(formatFolderCount(Number(count))).toBe(label);
  });
  it.each([
    ["2026-07-30T14:59:01Z", "Atualizada agora"],
    ["2026-07-30T14:59:00Z", "Atualizada há 1 min"],
    ["2026-07-30T14:01:00Z", "Atualizada há 59 min"],
    ["2026-07-30T14:00:00Z", "Atualizada há 1 h"],
    ["2026-07-30T16:00:00Z", "Atualizada agora"],
    ["2026-07-29T15:00:00Z", "Atualizada ontem"],
    ["2026-07-28T15:00:00Z", "Atualizada em 28 de jul."],
    ["2025-07-29T15:00:00Z", "Atualizada em 29 de jul. de 2025"],
  ])("formata %s", (date, label) => {
    expect(formatFolderUpdatedLabel(new Date(date), FOLDER_NOW)).toBe(label);
  });
  it.each([
    ["2026-07-30T02:59:00Z", "2026-07-30T01:00:00Z", "Atualizada há 1 h"],
    ["2026-07-30T03:00:00Z", "2026-07-30T01:00:00Z", "Atualizada ontem"],
    ["2027-01-01T03:00:00Z", "2026-12-31T15:00:00Z", "Atualizada ontem"],
    ["2027-01-02T03:00:00Z", "2026-12-31T15:00:00Z", "Atualizada em 31 de dez. de 2026"],
  ])("respeita o dia civil de São Paulo em %s", (now, date, label) => {
    expect(formatFolderUpdatedLabel(new Date(date), new Date(now))).toBe(label);
  });
  it.each([
    [0, "A pasta está vazia."],
    [1, "O arquivo dela volta para Sem pasta."],
    [3, "Os 3 arquivos dela voltam para Sem pasta."],
  ])("confirma exclusão com %s arquivos", (count, description) => {
    expect(deleteFolderCopy("Contratos", Number(count))).toEqual({
      title: 'Excluir a pasta "Contratos"?', description,
    });
  });
  it.each([
    ["sem-permissao", "Acesso recusado.", "Acesso recusado."],
    ["nome-invalido", "Nome da pasta é obrigatório.", "Nome da pasta é obrigatório."],
    ["nome-duplicado", "outra mensagem", "Já existe uma pasta com esse nome."],
    ["pasta-nao-encontrada", "outra mensagem", "Pasta não encontrada."],
    ["documento-nao-encontrado", "outra mensagem", "Documento não encontrado."],
    ["selecao-invalida", "outra mensagem", "Selecione de 1 a 100 documentos."],
  ] as const)("traduz %s", (code, error, expected) => {
    expect(folderErrorMessage({ code, error })).toBe(expected);
  });
  it("preserva a ordem e oferece Sem pasta primeiro, inclusive sem pastas", () => {
    expect(folderSelectorOptions(FOLDER_FIXTURES.slice(0, 2))).toEqual([
      { value: NO_FOLDER_OPTION_VALUE, label: "Sem pasta" },
      ...FOLDER_FIXTURES.slice(0, 2).map(({ id, name }) => ({ value: id, label: name })),
    ]);
    expect(folderSelectorOptions([])).toEqual([{ value: NO_FOLDER_OPTION_VALUE, label: "Sem pasta" }]);
    expect(folderIdFromSelector(NO_FOLDER_OPTION_VALUE)).toBeNull();
    expect(folderIdFromSelector(null)).toBeNull();
    expect(folderIdFromSelector(FOLDER_FIXTURES[0].id)).toBe(FOLDER_FIXTURES[0].id);
  });
  it("prepara os rótulos no servidor e aceita lista vazia", () => {
    expect(toFolderCardItems(FOLDER_FIXTURES, FOLDER_NOW)[0]).toEqual({
      id: FOLDER_FIXTURES[0].id, name: "Contratos", fileCount: 24,
      fileCountLabel: "24 arquivos", sizeLabel: "17.5 MB", updatedLabel: "Atualizada há 12 min",
    });
    expect(toFolderCardItems([], FOLDER_NOW)).toEqual([]);
  });
  it("não depende de módulos de servidor", () => {
    const source = readFileSync("src/components/documents/folder-presentation.ts", "utf8");
    expect(source).not.toMatch(/(?:from|import)\s*["'][^"']*(?:src\/server\/|server-only)/);
  });
});
