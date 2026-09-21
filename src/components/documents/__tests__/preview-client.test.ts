import { describe, expect, it, vi } from "vitest";
import { documentPreviewPath, fetchDocumentPreview } from "../preview-client";

function respond(status: number, body?: unknown, raw?: string): typeof fetch {
  return vi.fn(async () =>
    new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), {
      status,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("preview-client (lote-12 T24)", () => {
  it("só busca o texto do documento pedido, pela rota de preview", async () => {
    const fetchImpl = respond(200, { status: "pronto", text: "corpo" });
    await fetchDocumentPreview("doc-1", fetchImpl);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("/api/documents/doc-1/preview");
  });

  it("escapa o identificador no caminho", () => {
    expect(documentPreviewPath("a/b?c")).toBe("/api/documents/a%2Fb%3Fc/preview");
  });

  it("devolve o texto e o estado de um documento pronto", async () => {
    const result = await fetchDocumentPreview("d", respond(200, { status: "pronto", text: "política" }));
    expect(result).toEqual({ ok: true, status: "pronto", text: "política", warning: undefined });
  });

  it("documento fora do agente traz o aviso junto do texto", async () => {
    const result = await fetchDocumentPreview(
      "d",
      respond(200, { status: "fora_do_agente", text: "t", warning: "fora por limite" })
    );
    expect(result).toMatchObject({ ok: true, status: "fora_do_agente", warning: "fora por limite" });
  });

  it("404 vira mensagem de documento inexistente", async () => {
    const result = await fetchDocumentPreview("d", respond(404, { error: "x" }));
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toContain("não encontrado");
  });

  it("403 vira mensagem de permissão, distinta do 404", async () => {
    const proibido = await fetchDocumentPreview("d", respond(403, { error: "x" }));
    const ausente = await fetchDocumentPreview("d", respond(404, { error: "x" }));
    expect((proibido as { message: string }).message).toContain("permissão");
    expect((proibido as { message: string }).message).not.toBe((ausente as { message: string }).message);
  });

  it("500 vira indisponibilidade retentável", async () => {
    const result = await fetchDocumentPreview("d", respond(500));
    expect((result as { message: string }).message).toContain("Tente novamente");
  });

  it("corpo que não é JSON não derruba o preview", async () => {
    const result = await fetchDocumentPreview("d", respond(200, undefined, "<html>"));
    expect(result).toMatchObject({ ok: false });
  });

  it("resposta 200 sem texto nunca é tratada como sucesso", async () => {
    const result = await fetchDocumentPreview("d", respond(200, { status: "pronto" }));
    expect(result).toMatchObject({ ok: false });
  });

  it("estado fora do vocabulário do preview é recusado", async () => {
    const result = await fetchDocumentPreview("d", respond(200, { status: "processando", text: "t" }));
    expect(result).toMatchObject({ ok: false });
  });

  it("falha de rede é distinguida de recusa do servidor", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    const result = await fetchDocumentPreview("d", fetchImpl);
    expect((result as { message: string }).message).toContain("conexão");
  });

  it("o texto atravessa intacto, sem sanitização que altere o conteúdo", async () => {
    // O documento é mostrado como texto inerte pelo CodeBlock; o cliente não
    // pode reescrever o conteúdo, senão o preview deixaria de refletir o que
    // o agente realmente recebe.
    const hostil = '<script>alert(1)</script> [link](javascript:void 0) <img onerror="x">';
    const result = await fetchDocumentPreview("d", respond(200, { status: "pronto", text: hostil }));
    expect((result as { text: string }).text).toBe(hostil);
  });

  it("texto longo não é truncado pelo cliente", async () => {
    const longo = "a".repeat(500_000);
    const result = await fetchDocumentPreview("d", respond(200, { status: "pronto", text: longo }));
    expect((result as { text: string }).text).toHaveLength(500_000);
  });
});
