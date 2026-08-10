import { describe, expect, it } from "vitest";
import { resolveFileKind } from "../file-type";

// UI-02 Done-when: "resolveFileKind cobre PDF, DOCX, XLSX, PPTX, imagem,
// OpenDocument e desconhecido → generico".
describe("resolveFileKind (UI-02)", () => {
  it("classifica application/pdf como pdf", () => {
    expect(resolveFileKind("application/pdf")).toBe("pdf");
  });

  it("classifica DOCX (Word OOXML) como documento", () => {
    expect(
      resolveFileKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("documento");
  });

  it("classifica DOC legado (application/msword) como documento", () => {
    expect(resolveFileKind("application/msword")).toBe("documento");
  });

  it("classifica XLSX (Excel OOXML) como planilha", () => {
    expect(
      resolveFileKind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe("planilha");
  });

  it("classifica XLS legado (application/vnd.ms-excel) como planilha", () => {
    expect(resolveFileKind("application/vnd.ms-excel")).toBe("planilha");
  });

  it("classifica PPTX (PowerPoint OOXML) como apresentacao", () => {
    expect(
      resolveFileKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).toBe("apresentacao");
  });

  it("classifica PPT legado (application/vnd.ms-powerpoint) como apresentacao", () => {
    expect(resolveFileKind("application/vnd.ms-powerpoint")).toBe(
      "apresentacao"
    );
  });

  it("classifica image/png e image/jpeg como imagem", () => {
    expect(resolveFileKind("image/png")).toBe("imagem");
    expect(resolveFileKind("image/jpeg")).toBe("imagem");
  });

  it("classifica os 3 formatos OpenDocument (texto, planilha, apresentação)", () => {
    expect(resolveFileKind("application/vnd.oasis.opendocument.text")).toBe(
      "documento"
    );
    expect(
      resolveFileKind("application/vnd.oasis.opendocument.spreadsheet")
    ).toBe("planilha");
    expect(
      resolveFileKind("application/vnd.oasis.opendocument.presentation")
    ).toBe("apresentacao");
  });

  it("devolve generico para um MIME desconhecido, nunca lança erro", () => {
    expect(resolveFileKind("application/x-desconhecido")).toBe("generico");
  });

  it("devolve generico para string vazia (edge case defensivo)", () => {
    expect(resolveFileKind("")).toBe("generico");
  });
});
