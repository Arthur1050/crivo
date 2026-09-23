import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import {
  createDocumentProcessingService,
  type ProcessingDocument,
  type ProcessingRepository,
} from "../processing";
import type { DocumentStorage } from "../storage";

const NOW = new Date("2030-01-10T12:00:00.000Z");
const bytes = new TextEncoder().encode("conteúdo canônico");

function stream(value = bytes) {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(value); controller.close(); } });
}

function documentFixture(overrides: Partial<ProcessingDocument> = {}): ProcessingDocument {
  return {
    id: "document-1", tenantId: "tenant-1", storageKey: "documents/v1/object-1",
    mimeType: "text/plain", status: "processando", processingAttempt: 1,
    expiresAt: null, deletedAt: null, ...overrides,
  };
}

function dependencies(overrides: Partial<ProcessingRepository> = {}) {
  const document = documentFixture();
  const repository: ProcessingRepository = {
    getForProcessing: vi.fn(async () => document),
    complete: vi.fn(async () => "applied" as const),
    reconcile: vi.fn(async () => undefined),
    claimRetry: vi.fn(async () => ({ kind: "claimed" as const, attempt: 2 })),
    ...overrides,
  };
  const storage: DocumentStorage = {
    authorizeClientUpload: vi.fn(), head: vi.fn(), delete: vi.fn(),
    open: vi.fn(async (key) => ({ key, etag: "etag", contentType: "text/plain", size: bytes.byteLength, stream: stream() })),
  };
  const extract = vi.fn(async () => ({ ok: true as const, text: "conteúdo canônico", extractedBytes: bytes.byteLength }));
  const start = vi.fn(async () => ({ id: "run-1" }));
  return { repository, storage, extract, start };
}

describe("document processing service (lote-12 T13)", () => {
  it("processa o attempt atual e conclui com texto integral", async () => {
    const deps = dependencies();
    const result = await createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(result).toEqual({ kind: "completed", status: "pronto" });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ status: "pronto", extractedText: "conteúdo canônico", extractedBytes: bytes.byteLength, processingAttempt: 1, now: NOW }));
  });

  it("não lê storage quando o attempt já é obsoleto", async () => {
    const deps = dependencies({ getForProcessing: vi.fn(async () => null) });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "stale" });
    expect(deps.storage.open).not.toHaveBeenCalled();
  });

  it("não conclui documento excluído", async () => {
    const deps = dependencies({ getForProcessing: vi.fn(async () => documentFixture({ deletedAt: NOW })) });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "stale" });
    expect(deps.repository.complete).not.toHaveBeenCalled();
  });

  it("não conclui documento expirado no boundary", async () => {
    const deps = dependencies({ getForProcessing: vi.fn(async () => documentFixture({ expiresAt: NOW })) });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "stale" });
    expect(deps.storage.open).not.toHaveBeenCalled();
  });

  it("trata objeto ausente como falha permanente preservando o original", async () => {
    const deps = dependencies();
    (deps.storage.open as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "failed", code: "original_ausente" });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ status: "falha", failureCode: "original_ausente" }));
  });

  it("classifica extração sem texto como falha permanente", async () => {
    const deps = dependencies();
    deps.extract.mockResolvedValue({ ok: false, code: "nenhum_texto_extraivel" });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "failed", code: "nenhum_texto_extraivel" });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ status: "falha", failureCode: "nenhum_texto_extraivel" }));
  });

  it("classifica extração transitória sem vazar a causa", async () => {
    const deps = dependencies();
    deps.extract.mockResolvedValue({ ok: false, code: "extracao_transitoria" });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "retryable", code: "extracao_transitoria" });
    expect(deps.repository.complete).not.toHaveBeenCalled();
  });

  it("reconcilia orçamento depois de sucesso", async () => {
    const deps = dependencies();
    await createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(deps.repository.reconcile).toHaveBeenCalledWith("tenant-1", NOW);
  });

  it("não reconcilia quando o CAS final fica stale", async () => {
    const deps = dependencies({ complete: vi.fn(async () => "stale" as const) });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 })).resolves.toEqual({ kind: "stale" });
    expect(deps.repository.reconcile).not.toHaveBeenCalled();
  });

  it("resultado CAS atrasado não substitui a tentativa vigente", async () => {
    const deps = dependencies({ complete: vi.fn(async () => "stale" as const) });
    await createDocumentProcessingService({ ...deps, now: () => NOW }).process({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ processingAttempt: 1, extractedText: "conteúdo canônico" }));
  });

  it("retry concorrente reutiliza o attempt lógico existente", async () => {
    const deps = dependencies({ claimRetry: vi.fn(async () => ({ kind: "active" as const, attempt: 2 })) });
    const result = await createDocumentProcessingService({ ...deps, now: () => NOW }).retry({ tenantId: "tenant-1", documentId: "document-1" });
    expect(result).toEqual({ kind: "scheduled", attempt: 2, runId: "run-1" });
    expect(deps.start).toHaveBeenCalledWith({ tenantId: "tenant-1", documentId: "document-1", attempt: 2 });
  });

  it("retry cria apenas um novo attempt lógico", async () => {
    const deps = dependencies();
    const service = createDocumentProcessingService({ ...deps, now: () => NOW });
    await Promise.all([service.retry({ tenantId: "tenant-1", documentId: "document-1" }), service.retry({ tenantId: "tenant-1", documentId: "document-1" })]);
    expect(deps.repository.claimRetry).toHaveBeenCalledTimes(2);
    expect(deps.start).toHaveBeenCalledWith({ tenantId: "tenant-1", documentId: "document-1", attempt: 2 });
  });

  it("recusa retry de documento inexistente sem iniciar workflow", async () => {
    const deps = dependencies({ claimRetry: vi.fn(async () => ({ kind: "stale" as const })) });
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).retry({ tenantId: "tenant-1", documentId: "missing" })).resolves.toEqual({ kind: "stale" });
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("falha de dispatch é retomável até a terceira tentativa", async () => {
    const deps = dependencies();
    deps.start.mockRejectedValue(new Error("offline"));
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).retry({ tenantId: "tenant-1", documentId: "document-1" })).resolves.toEqual({ kind: "dispatch_failed", attempt: 2 });
    expect(deps.repository.complete).not.toHaveBeenCalled();
  });

  it("terceira falha de dispatch encerra o processamento", async () => {
    const deps = dependencies({ claimRetry: vi.fn(async () => ({ kind: "claimed" as const, attempt: 3 })) });
    deps.start.mockRejectedValue(new Error("offline"));
    await expect(createDocumentProcessingService({ ...deps, now: () => NOW }).retry({ tenantId: "tenant-1", documentId: "document-1" })).resolves.toEqual({ kind: "failed", code: "processamento_indisponivel" });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ processingAttempt: 3, status: "falha", failureCode: "processamento_indisponivel" }));
  });

  it("despacho inicial agenda o attempt reservado sem tocar o repositório", async () => {
    const deps = dependencies();
    const result = await createDocumentProcessingService({ ...deps, now: () => NOW }).dispatch({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(result).toEqual({ kind: "scheduled", attempt: 1, runId: "run-1" });
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.start).toHaveBeenCalledWith({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(deps.repository.complete).not.toHaveBeenCalled();
  });

  it("despacho inicial insiste até a terceira tentativa imediata", async () => {
    const deps = dependencies();
    deps.start.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    const result = await createDocumentProcessingService({ ...deps, now: () => NOW }).dispatch({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(result).toEqual({ kind: "scheduled", attempt: 1, runId: "run-1" });
    expect(deps.start).toHaveBeenCalledTimes(3);
    expect(deps.repository.complete).not.toHaveBeenCalled();
  });

  it("três falhas de despacho inicial gravam falha segura no mesmo attempt", async () => {
    const deps = dependencies();
    deps.start.mockRejectedValue(new Error("token privado em /caminho"));
    const result = await createDocumentProcessingService({ ...deps, now: () => NOW }).dispatch({ tenantId: "tenant-1", documentId: "document-1", attempt: 1 });
    expect(result).toEqual({ kind: "failed", code: "processamento_indisponivel" });
    expect(deps.start).toHaveBeenCalledTimes(3);
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({
      processingAttempt: 1, status: "falha", failureCode: "processamento_indisponivel",
      failureMessage: "Não foi possível processar agora. Tente novamente.",
    }));
  });

  it("não expõe mensagem interna de dispatch na falha persistida", async () => {
    const deps = dependencies({ claimRetry: vi.fn(async () => ({ kind: "claimed" as const, attempt: 3 })) });
    deps.start.mockRejectedValue(new Error("token privado em /caminho"));
    await createDocumentProcessingService({ ...deps, now: () => NOW }).retry({ tenantId: "tenant-1", documentId: "document-1" });
    expect(deps.repository.complete).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ failureMessage: "Não foi possível processar agora. Tente novamente." }));
  });
});
