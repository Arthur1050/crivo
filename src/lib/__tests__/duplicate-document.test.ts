import { describe, expect, it } from "vitest";
import { formatDuplicateDocumentMessage } from "../../kit/duplicate-document";
import { testVertical } from "../../vertical-kit/__tests__/fixture-vertical";
import { duplicateDocumentMessage } from "../duplicate-document";

describe("mensagem de documento duplicado por vertical", () => {
  it("usa o nome da empresa para duplicatas com e sem nome de documento", () => {
    const { tenantNoun } = testVertical.brand;
    expect(duplicateDocumentMessage(tenantNoun, "  contrato.pdf  ")).toBe(
      "Este arquivo já está cadastrado nesta empresa como “contrato.pdf”. Abra esse documento na lista para editar nome, modalidade, categoria ou validade.",
    );
    for (const name of [undefined, null, " "]) {
      expect(duplicateDocumentMessage(tenantNoun, name)).toBe(
        "Este arquivo já foi enviado nesta empresa. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.",
      );
    }
  });

  it("liga o formatador da aplicação à marca da imobiliária", () => {
    expect(formatDuplicateDocumentMessage("contrato.pdf")).toBe(
      "Este arquivo já está cadastrado nesta imobiliária como “contrato.pdf”. Abra esse documento na lista para editar nome, modalidade, categoria ou validade.",
    );
    expect(formatDuplicateDocumentMessage()).toBe(
      "Este arquivo já foi enviado nesta imobiliária. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.",
    );
  });
});
