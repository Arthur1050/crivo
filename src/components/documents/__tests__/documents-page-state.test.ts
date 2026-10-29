import { describe, expect, it } from "vitest";
import type { FolderParam } from "../../../lib/document-folders";
import { clearFiltersHref, folderFilterFor, resolveDocumentsPageMode } from "../documents-page-state";

const folder = { id: "00000000-0000-4000-8000-000000000001", name: "Contratos" };

describe("estado da página de Documentos", () => {
  it.each([null, folder])("resolve os parâmetros da raiz e inválido com pasta %j", (found) => {
    expect(resolveDocumentsPageMode({ kind: "todas" }, found)).toEqual({ kind: "raiz", folderFilter: undefined });
    expect(resolveDocumentsPageMode({ kind: "sem-pasta" }, found)).toEqual({ kind: "raiz", folderFilter: { kind: "sem-pasta" } });
    expect(resolveDocumentsPageMode({ kind: "invalida" }, found)).toEqual({ kind: "pasta-inexistente" });
  });

  it("abre a pasta encontrada e trata a ausente como inexistente", () => {
    const param: FolderParam = { kind: "pasta", folderId: folder.id };
    expect(resolveDocumentsPageMode(param, folder)).toEqual({ kind: "pasta", folder });
    expect(resolveDocumentsPageMode(param, null)).toEqual({ kind: "pasta-inexistente" });
  });

  it("repassa os filtros exatos da pasta e da raiz à listagem", () => {
    expect(folderFilterFor({ kind: "pasta", folder })).toEqual({ kind: "pasta", folderId: folder.id });
    expect(folderFilterFor({ kind: "raiz", folderFilter: { kind: "sem-pasta" } })).toEqual({ kind: "sem-pasta" });
    expect(folderFilterFor({ kind: "raiz", folderFilter: undefined })).toBeUndefined();
    expect(folderFilterFor({ kind: "pasta-inexistente" })).toBeUndefined();
  });

  it("limpa os filtros mantendo a pasta aberta e volta à raiz nos demais modos", () => {
    expect(clearFiltersHref({ kind: "pasta", folder })).toBe(`/documentos?pasta=${folder.id}`);
    expect(clearFiltersHref({ kind: "raiz", folderFilter: { kind: "sem-pasta" } })).toBe("/documentos");
    expect(clearFiltersHref({ kind: "raiz", folderFilter: undefined })).toBe("/documentos");
    expect(clearFiltersHref({ kind: "pasta-inexistente" })).toBe("/documentos");
  });
});
