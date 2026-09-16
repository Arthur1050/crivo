import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { documentUploadIntents, documents, tenantDocumentContextLimits, tenants, users } from "../../../db/schema";
import { createDocumentProcessingService } from "../processing";
import type { DocumentStorage } from "../storage";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const NOW = new Date("2030-01-10T12:00:00.000Z");
const bytes = new TextEncoder().encode("texto integral");

function hash(seed: string) { return seed.padEnd(64, "0").slice(0, 64); }
function stream() { return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }); }
function storage(open: DocumentStorage["open"] = vi.fn(async (key) => ({ key, etag: "etag", contentType: "text/plain", size: bytes.byteLength, stream: stream() }))) {
  return { authorizeClientUpload: vi.fn(), head: vi.fn(), delete: vi.fn(), open } as DocumentStorage;
}
async function createDocument(seed: string, overrides: Partial<typeof documents.$inferInsert> = {}, tenantId = TENANT_A) {
  const [row] = await db.insert(documents).values({
    tenantId, name: `${seed}.txt`, modality: "novo", mimeType: "text/plain", sizeBytes: BigInt(bytes.byteLength),
    storageProvider: "vercel_blob", storageKey: `documents/v1/${tenantId}/${seed}-${randomUUID()}`,
    storageEtag: `etag-${seed}`, contentSha256: hash(`${seed}-${randomUUID()}`), status: "processando",
    processingAttempt: 1, processingStartedAt: NOW, ...overrides,
  }).returning();
  return row;
}
function service(input: { storage?: DocumentStorage; extract?: ReturnType<typeof vi.fn>; start?: ReturnType<typeof vi.fn> } = {}) {
  return createDocumentProcessingService({
    storage: input.storage ?? storage(),
    extract: input.extract ?? vi.fn(async () => ({ ok: true as const, text: "texto integral", extractedBytes: bytes.byteLength })),
    start: input.start ?? vi.fn(async () => ({ id: "run-1" })), now: () => NOW,
  });
}
async function row(id: string) { return (await db.select().from(documents).where(eq(documents.id, id)))[0]; }

describe("document processing integration (lote-12 T13)", () => {
  beforeAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Processing A", agentName: "A", supportedModality: "ambos", slug: `processing-a-${TENANT_A}` },
      { id: TENANT_B, name: "Processing B", agentName: "B", supportedModality: "ambos", slug: `processing-b-${TENANT_B}` },
    ]);
    await db.insert(users).values([{ id: USER_A, name: "Processing A", email: `processing-a-${USER_A}@example.test` }, { id: USER_B, name: "Processing B", email: `processing-b-${USER_B}@example.test` }]);
  });
  afterAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  it("persiste texto integral e status pronto", async () => { const d = await createDocument("success"); await expect(service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "completed", status: "pronto" }); expect(await row(d.id)).toMatchObject({ status: "pronto", extractedText: "texto integral", extractedBytes: bytes.byteLength, failureCode: null }); });
  it("marca sucesso que não cabe no teto como fora_do_agente sem cortar texto", async () => {
    await db.insert(tenantDocumentContextLimits).values(["novo", "usado", "ambos"].map((queryModality) => ({ tenantId: TENANT_A, queryModality: queryModality as "novo" | "usado" | "ambos", maxResponseBytes: 1, modelId: "model", workflowVersion: "workflow", systemMessageHash: "system", toolsHash: "tools", memoryWindow: 50, benchmarkedAt: NOW, metrics: {} })));
    const d = await createDocument("outside-budget");
    await service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 });
    expect(await row(d.id)).toMatchObject({ status: "fora_do_agente", extractedText: "texto integral" });
    await db.delete(tenantDocumentContextLimits).where(eq(tenantDocumentContextLimits.tenantId, TENANT_A));
  });
  it("não lê nem altera resultado de attempt antigo", async () => { const d = await createDocument("late", { processingAttempt: 2 }); const s = storage(); await expect(service({ storage: s }).process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "stale" }); expect(s.open).not.toHaveBeenCalled(); expect(await row(d.id)).toMatchObject({ status: "processando", processingAttempt: 2, extractedText: null }); });
  it("não reativa tombstone", async () => { const d = await createDocument("deleted", { deletedAt: NOW }); await expect(service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "stale" }); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, extractedText: null }); });
  it("trata expiresAt igual a now como stale", async () => { const d = await createDocument("boundary", { expiresAt: NOW }); await expect(service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "stale" }); expect(await row(d.id)).toMatchObject({ status: "processando", extractedText: null }); });
  it("preserva linha e original ao marcar original ausente", async () => { const d = await createDocument("missing"); await expect(service({ storage: storage(vi.fn(async () => null)) }).process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "failed", code: "original_ausente" }); expect(await row(d.id)).toMatchObject({ status: "falha", failureCode: "original_ausente", storageKey: d.storageKey }); });
  it("persiste falha de texto vazio com código seguro", async () => { const d = await createDocument("empty"); await service({ extract: vi.fn(async () => ({ ok: false as const, code: "nenhum_texto_extraivel" })) }).process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 }); expect(await row(d.id)).toMatchObject({ status: "falha", failureCode: "nenhum_texto_extraivel", extractedText: null }); });
  it("mantém processando para erro transitório de extração", async () => { const d = await createDocument("transient"); await expect(service({ extract: vi.fn(async () => ({ ok: false as const, code: "extracao_transitoria" })) }).process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "retryable", code: "extracao_transitoria" }); expect(await row(d.id)).toMatchObject({ status: "processando", extractedText: null }); });
  it("limpa erro anterior ao concluir com sucesso", async () => { const d = await createDocument("clear-error", { failureCode: "old", failureMessage: "old" }); await service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 }); expect(await row(d.id)).toMatchObject({ status: "pronto", failureCode: null, failureMessage: null }); });
  it("claim de retry incrementa falha para um attempt novo", async () => { const d = await createDocument("retry", { status: "falha", failureCode: "x" }); const start = vi.fn(async () => ({ id: "run-retry" })); await expect(service({ start }).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "scheduled", attempt: 2, runId: "run-retry" }); expect(await row(d.id)).toMatchObject({ status: "processando", processingAttempt: 2, failureCode: null }); });
  it("retry concorrente converge no mesmo attempt", async () => { const d = await createDocument("retry-race", { status: "falha" }); const start = vi.fn(async () => ({ id: "run-race" })); const s = service({ start }); const results = await Promise.all([s.retry({ tenantId: TENANT_A, documentId: d.id }), s.retry({ tenantId: TENANT_A, documentId: d.id })]); expect(results.map((r) => r.kind)).toEqual(["scheduled", "scheduled"]); expect(results.map((r) => "attempt" in r ? r.attempt : null)).toEqual([2, 2]); expect((await row(d.id)).processingAttempt).toBe(2); });
  it("não inicia retry para outro tenant", async () => { const d = await createDocument("cross-tenant", {}, TENANT_B); const start = vi.fn(async () => ({ id: "leak" })); await expect(service({ start }).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "stale" }); expect(start).not.toHaveBeenCalled(); expect((await row(d.id)).status).toBe("processando"); });
  it("não inicia retry para documento pronto", async () => { const d = await createDocument("ready", { status: "pronto", extractedText: "ready" }); const start = vi.fn(async () => ({ id: "bad" })); await expect(service({ start }).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "stale" }); expect(start).not.toHaveBeenCalled(); });
  it("primeira falha de dispatch mantém attempt retomável", async () => { const d = await createDocument("dispatch-first", { status: "falha" }); await expect(service({ start: vi.fn(async () => { throw new Error("offline"); }) }).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "dispatch_failed", attempt: 2 }); expect(await row(d.id)).toMatchObject({ status: "processando", processingAttempt: 2 }); });
  it("terceira falha de dispatch encerra sem processando eterno", async () => { const d = await createDocument("dispatch-third", { status: "falha", processingAttempt: 2 }); await expect(service({ start: vi.fn(async () => { throw new Error("offline"); }) }).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "failed", code: "processamento_indisponivel" }); expect(await row(d.id)).toMatchObject({ status: "falha", processingAttempt: 3, failureCode: "processamento_indisponivel" }); });
  it("sanitiza mensagem interna de dispatch", async () => { const d = await createDocument("dispatch-sanitize", { status: "falha", processingAttempt: 2 }); await service({ start: vi.fn(async () => { throw new Error("secret /private/path"); }) }).retry({ tenantId: TENANT_A, documentId: d.id }); expect((await row(d.id)).failureMessage).toBe("Não foi possível processar agora. Tente novamente."); });
  it("não muda documento de outro tenant durante conclusão", async () => { const d = await createDocument("other-complete", {}, TENANT_B); await expect(service().process({ tenantId: TENANT_A, documentId: d.id, attempt: 1 })).resolves.toEqual({ kind: "stale" }); expect((await row(d.id)).extractedText).toBeNull(); });
});
