import { describe, expect, it } from "vitest";
import {
  deriveDocumentState,
  deriveRowActions,
  describeFailure,
  documentDownloadPath,
  type DocumentRowState,
  type DocumentStatus,
} from "../document-row-state";

const NOW = new Date("2033-06-01T12:00:00.000Z");
const STATUSES: DocumentStatus[] = ["processando", "pronto", "falha", "fora_do_agente"];

function row(status: DocumentStatus, expiresAt: Date | string | null = null) {
  return { status, expiresAt };
}

describe("estado da linha de documento (lote-12 T25)", () => {
  describe("cada estado tem texto e semântica", () => {
    it.each(STATUSES)("%s traz rótulo, variante e descrição próprios", (status) => {
      const presentation = deriveDocumentState(row(status), NOW);
      expect(presentation.state).toBe(status);
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.description.length).toBeGreaterThan(0);
      expect(presentation.variant).toBeDefined();
    });

    it("nenhum estado compartilha rótulo com outro", () => {
      const labels = [...STATUSES, "expirado" as const].map((state) =>
        state === "expirado"
          ? deriveDocumentState(row("pronto", new Date(NOW.getTime() - 1)), NOW).label
          : deriveDocumentState(row(state), NOW).label
      );
      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  describe("expirado é derivado do instante (L-023)", () => {
    it("expiresAt exatamente igual a agora já conta como expirado", () => {
      expect(deriveDocumentState(row("pronto", NOW), NOW).state).toBe("expirado");
    });

    it("um milissegundo antes de agora já expirou", () => {
      expect(deriveDocumentState(row("pronto", new Date(NOW.getTime() - 1)), NOW).state).toBe("expirado");
    });

    it("um milissegundo depois de agora ainda não expirou", () => {
      expect(deriveDocumentState(row("pronto", new Date(NOW.getTime() + 1)), NOW).state).toBe("pronto");
    });

    it("sem validade nunca expira", () => {
      expect(deriveDocumentState(row("pronto", null), NOW).state).toBe("pronto");
    });

    it("expiração prevalece sobre qualquer estado de processamento", () => {
      for (const status of STATUSES) {
        expect(deriveDocumentState(row(status, new Date(NOW.getTime() - 1)), NOW).state).toBe("expirado");
      }
    });

    it("aceita a validade como string ISO, como chega serializada do servidor", () => {
      expect(deriveDocumentState(row("pronto", NOW.toISOString()), NOW).state).toBe("expirado");
    });

    it("validade inválida não derruba a linha nem inventa expiração", () => {
      expect(deriveDocumentState(row("pronto", "não é data"), NOW).state).toBe("pronto");
    });
  });

  describe("papéis: corretor só lê", () => {
    it.each(STATUSES)("em %s o corretor nunca vê editar, reprocessar ou excluir", (status) => {
      const actions = deriveRowActions(deriveDocumentState(row(status), NOW).state, false);
      expect(actions.canEdit).toBe(false);
      expect(actions.canRetry).toBe(false);
      expect(actions.canDelete).toBe(false);
    });

    it("admin e gestor veem escrita nos estados ativos", () => {
      const actions = deriveRowActions("pronto", true);
      expect(actions).toMatchObject({ canEdit: true, canDelete: true });
    });

    it("reprocessar existe só em falha, e só para quem escreve", () => {
      expect(deriveRowActions("falha", true).canRetry).toBe(true);
      expect(deriveRowActions("falha", false).canRetry).toBe(false);
      for (const state of ["pronto", "processando", "fora_do_agente"] as DocumentRowState[]) {
        expect(deriveRowActions(state, true).canRetry).toBe(false);
      }
    });
  });

  describe("preview e download por estado", () => {
    it("preview fica oculto em processando e falha", () => {
      expect(deriveRowActions("processando", true).canPreview).toBe(false);
      expect(deriveRowActions("falha", true).canPreview).toBe(false);
    });

    it("preview aparece onde existe texto extraído", () => {
      expect(deriveRowActions("pronto", false).canPreview).toBe(true);
      expect(deriveRowActions("fora_do_agente", false).canPreview).toBe(true);
    });

    it("download continua disponível em falha, que é quando recuperar o original importa", () => {
      expect(deriveRowActions("falha", false).canDownload).toBe(true);
    });

    it.each(["processando", "pronto", "falha", "fora_do_agente"] as DocumentRowState[])(
      "download está disponível em %s mesmo para quem só lê",
      (state) => {
        expect(deriveRowActions(state, false).canDownload).toBe(true);
      }
    );
  });

  describe("expirado bloqueia acesso, não a limpeza", () => {
    it("nem preview nem download continuam disponíveis", () => {
      const actions = deriveRowActions("expirado", true);
      expect(actions.canPreview).toBe(false);
      expect(actions.canDownload).toBe(false);
    });

    it("editar e reprocessar não fazem sentido em documento expirado", () => {
      expect(deriveRowActions("expirado", true)).toMatchObject({ canEdit: false, canRetry: false });
    });

    it("excluir permanece para quem escreve, para tirar a linha da lista", () => {
      expect(deriveRowActions("expirado", true).canDelete).toBe(true);
      expect(deriveRowActions("expirado", false).canDelete).toBe(false);
    });
  });

  describe("mensagem de falha é segura", () => {
    it("código conhecido vira frase de produto", () => {
      expect(describeFailure("EXTRACTION_NO_TEXT")).toContain("texto nativo");
    });

    it("código desconhecido nunca é exibido cru", () => {
      const message = describeFailure("PROVIDER_ERROR_https://interno/token=abc");
      expect(message).not.toContain("https://");
      expect(message).not.toContain("token");
    });

    it("ausência de código ainda produz frase legível", () => {
      expect(describeFailure(null)).toContain("não registrado");
    });

    it("nenhuma mensagem vaza provedor, caminho ou credencial", () => {
      const codes = [
        "EXTRACTION_NO_TEXT",
        "EXTRACTION_UNSUPPORTED",
        "EXTRACTION_TOO_LARGE",
        "STORAGE_OBJECT_ABSENT",
        "STORAGE_TRANSIENT_FAILURE",
        "STORAGE_PERMANENT_FAILURE",
        null,
        "DESCONHECIDO",
      ];
      for (const code of codes) {
        expect(describeFailure(code)).not.toMatch(/vercel|blob|https?:|token|documents\/v1/i);
      }
    });
  });

  it("o download passa pela rota autenticada, nunca por URL do provedor", () => {
    expect(documentDownloadPath("doc-1")).toBe("/api/documents/doc-1/download");
    expect(documentDownloadPath("a/b")).toBe("/api/documents/a%2Fb/download");
  });
});
