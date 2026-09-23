import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { documentUploadIntents, documents, tenants, users } from "../../../db/schema";
import { createDocumentLifecycle } from "../lifecycle";
import { completeDocumentProcessing, tombstoneDocument } from "../repository";
import { DocumentStorageError, type DocumentStorage } from "../storage";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const NOW = new Date("2030-02-01T12:00:00.000Z");

function hash(seed: string) { return seed.padEnd(64, "0").slice(0, 64); }
async function createDocument(seed: string, overrides: Partial<typeof documents.$inferInsert> = {}, tenantId = TENANT_A) {
  const [row] = await db.insert(documents).values({
    tenantId, name: `${seed}.txt`, modality: "novo", mimeType: "text/plain", sizeBytes: 12n,
    storageProvider: "vercel_blob", storageKey: `documents/v1/${tenantId}/${seed}-${randomUUID()}`,
    storageEtag: `etag-${seed}`, contentSha256: hash(`${seed}-${randomUUID()}`), status: "processando",
    processingAttempt: 1, processingStartedAt: NOW, extractedText: "segredo", extractedBytes: 7,
    failureCode: "old", failureMessage: "provider://secret", ...overrides,
  }).returning();
  return row;
}
async function row(id: string) { return (await db.select().from(documents).where(eq(documents.id, id)))[0]; }
function storage(input: Partial<DocumentStorage> = {}) {
  return {
    authorizeClientUpload: vi.fn(),
    delete: vi.fn(async () => undefined),
    head: vi.fn(async () => null),
    open: vi.fn(),
    ...input,
  } as DocumentStorage;
}
function lifecycle(value: DocumentStorage) { return createDocumentLifecycle({ storage: value, now: () => NOW }); }

describe("document lifecycle integration (lote-12 T18)", () => {
  beforeAll(async () => {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Lifecycle A", agentName: "A", supportedModality: "ambos", slug: `lifecycle-a-${TENANT_A}` },
      { id: TENANT_B, name: "Lifecycle B", agentName: "B", supportedModality: "ambos", slug: `lifecycle-b-${TENANT_B}` },
    ]);
    await db.insert(users).values([{ id: USER_A, name: "Lifecycle A", email: `lifecycle-a-${USER_A}@example.test` }, { id: USER_B, name: "Lifecycle B", email: `lifecycle-b-${USER_B}@example.test` }]);
  });
  afterAll(async () => {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  it("tombstone limpa texto e erros antes de chamar o storage", async () => {
    const d = await createDocument("atomic");
    const s = storage({ delete: vi.fn(async () => { expect(await row(d.id)).toMatchObject({ deletedAt: NOW, extractedText: null, extractedBytes: null, failureCode: null, failureMessage: null }); }) });
    await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "removed" });
  });
  // Em produção todo documento nasce de uma intenção de upload que aponta para
  // ele por FK. Os testes acima criam o documento direto e nunca viam a FK: o
  // DELETE físico falhava em produção e o documento ficava tombstone para sempre.
  it("remove documento que nasceu de upload, junto com a intenção que o referencia", async () => {
    const d = await createDocument("with-intent");
    const [intent] = await db.insert(documentUploadIntents).values({
      tenantId: TENANT_A, requestedByUserId: USER_A, clientSha256: d.contentSha256, name: d.name,
      mimeType: d.mimeType, sizeBytes: d.sizeBytes, modality: d.modality, storageKey: d.storageKey,
      expiresAtIntent: NOW, state: "committed", documentId: d.id, storageEtag: d.storageEtag,
    }).returning();

    await expect(lifecycle(storage()).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "removed" });
    expect(await row(d.id)).toBeUndefined();
    expect(await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, intent.id))).toHaveLength(0);
  });

  it("remove a linha apenas depois de delete e head confirmarem ausência", async () => { const d = await createDocument("order"); const s = storage(); await lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }); expect(s.delete).toHaveBeenCalledWith(d.storageKey); expect(s.head).toHaveBeenCalledWith(d.storageKey); expect(await row(d.id)).toBeUndefined(); });
  it("trata ausência já existente como remoção idempotente", async () => { const d = await createDocument("absent"); const s = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("absent"); }) }); await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "removed" }); expect(await row(d.id)).toBeUndefined(); });
  it("não remove a linha quando head ainda encontra o objeto", async () => { const d = await createDocument("head-present"); const s = storage({ head: vi.fn(async (key) => ({ key, etag: "etag", contentType: "text/plain", size: 12 })) }); await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "retryable", code: "STORAGE_PERMANENT_FAILURE" }); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, deletionAttempts: 1, deletionLastErrorCode: "STORAGE_PERMANENT_FAILURE" }); });
  it("falha transitória preserva tombstone e código sanitizado", async () => { const d = await createDocument("transient"); const s = storage({ delete: vi.fn(async () => { throw new Error("https://secret.example/token"); }) }); await lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, deletionAttempts: 1, deletionLastErrorCode: "STORAGE_PERMANENT_FAILURE" }); });
  it("falha transitória tipada mantém linha inacessível", async () => { const d = await createDocument("typed-transient"); const s = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) }); await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "retryable", code: "STORAGE_TRANSIENT_FAILURE" }); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, extractedText: null, deletionLastErrorCode: "STORAGE_TRANSIENT_FAILURE" }); });
  it("falha de head é retentável e não faz hard delete", async () => { const d = await createDocument("head-fail"); const s = storage({ head: vi.fn(async () => { throw new DocumentStorageError("transient"); }) }); await lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, deletionAttempts: 1, deletionLastErrorCode: "STORAGE_TRANSIENT_FAILURE" }); });
  it("retry de tombstone existente conclui remoção", async () => { const d = await createDocument("retry"); await tombstoneDocument(TENANT_A, d.id, NOW); const s = storage(); await expect(lifecycle(s).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "removed" }); expect(await row(d.id)).toBeUndefined(); });
  it("retry de linha ativa não toca o storage", async () => { const d = await createDocument("active"); const s = storage(); await expect(lifecycle(s).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "not_found" }); expect(s.delete).not.toHaveBeenCalled(); });
  it("outro tenant não consegue tombstonar nem abrir remoção", async () => { const d = await createDocument("other", {}, TENANT_B); const s = storage(); await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "not_found" }); expect(s.delete).not.toHaveBeenCalled(); expect((await row(d.id)).deletedAt).toBeNull(); });
  it("duas remoções concorrentes convergem sem reabrir o documento", async () => { const d = await createDocument("race"); const s = storage(); const results = await Promise.all([lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }), lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })]); expect(results.map((value) => value.kind).sort()).toEqual(["not_found", "removed"]); expect(await row(d.id)).toBeUndefined(); });
  it("conclusão tardia de workflow não reativa o tombstone", async () => { const d = await createDocument("late"); await tombstoneDocument(TENANT_A, d.id, NOW); await expect(completeDocumentProcessing(TENANT_A, { documentId: d.id, processingAttempt: 1, status: "pronto", extractedText: "não", extractedBytes: 3, now: NOW })).resolves.toBe("stale"); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, extractedText: null }); });
  it("tombstone preserva storageKey até confirmação física", async () => { const d = await createDocument("key"); const s = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) }); await lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }); expect((await row(d.id)).storageKey).toBe(d.storageKey); });
  it("retry posterior incrementa tentativas e limpa a linha ao sucesso", async () => { const d = await createDocument("retry-count"); const failing = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) }); await lifecycle(failing).remove({ tenantId: TENANT_A, documentId: d.id }); await expect(lifecycle(storage()).retry({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "removed" }); expect(await row(d.id)).toBeUndefined(); });
  it("remoção repetida após hard delete é idempotente", async () => { const d = await createDocument("repeat"); const s = storage(); await lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id }); await expect(lifecycle(s).remove({ tenantId: TENANT_A, documentId: d.id })).resolves.toEqual({ kind: "not_found" }); });
  it("expiração usa o mesmo tombstone e bloqueia texto imediatamente", async () => { const d = await createDocument("expired", { expiresAt: NOW }); await tombstoneDocument(TENANT_A, d.id, NOW); expect(await row(d.id)).toMatchObject({ deletedAt: NOW, extractedText: null, failureCode: null }); });
});
