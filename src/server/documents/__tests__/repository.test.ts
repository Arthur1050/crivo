import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../db";
import {
  documentUploadIntents,
  documents,
  tenantDocumentContextLimits,
  tenants,
  users,
} from "../../../db/schema";
import {
  claimUploadIntentForFinalization,
  commitUploadIntent,
  completeDocumentProcessing,
  createUploadIntent,
  expireDueDocuments,
  listTenantDocuments,
  retryDocumentProcessing,
  tombstoneDocument,
  upsertDocumentContextLimit,
} from "../repository";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_ID = randomUUID();
const NOW = new Date("2030-01-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function hash(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64);
}

function intentInput(seed: string, overrides: Partial<Parameters<typeof createUploadIntent>[1]> = {}) {
  return {
    requestedByUserId: USER_ID,
    clientSha256: hash(`client-${seed}`),
    name: `${seed}.txt`,
    mimeType: "text/plain",
    sizeBytes: 12,
    modality: "novo" as const,
    storageKey: `documents/${TENANT_A}/${seed}/${randomUUID()}`,
    expiresAtIntent: new Date(NOW.getTime() + HOUR),
    ...overrides,
  };
}

async function claimedIntent(seed: string, tenantId = TENANT_A) {
  const created = await createUploadIntent(tenantId, intentInput(seed), NOW);
  expect(created.kind).toBe("created");
  if (created.kind !== "created") throw new Error("fixture intent was not created");
  const claim = await claimUploadIntentForFinalization(tenantId, created.intent.id, NOW);
  expect(claim.kind).toBe("claimed");
  return created.intent;
}

async function committedDocument(seed: string, tenantId = TENANT_A) {
  const intent = await claimedIntent(seed, tenantId);
  const committed = await commitUploadIntent(tenantId, intent.id, {
    storageProvider: "vercel_blob",
    storageEtag: `etag-${seed}`,
    contentSha256: hash(`content-${seed}`),
    now: NOW,
  });
  expect(committed.kind).toBe("committed");
  if (committed.kind !== "committed") throw new Error("fixture document was not committed");
  return committed.document;
}

describe("documents repository (lote-12 T4)", () => {
  beforeAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(eq(users.id, USER_ID));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Repository A", agentName: "A", supportedModality: "ambos", slug: `repository-a-${TENANT_A}` },
      { id: TENANT_B, name: "Repository B", agentName: "B", supportedModality: "ambos", slug: `repository-b-${TENANT_B}` },
    ]);
    await db.insert(users).values({ id: USER_ID, name: "Repository user", email: `repository-${USER_ID}@example.test` });
  });

  afterAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(eq(users.id, USER_ID));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  it("cria uma reserva tenant-scoped com metadados e TTL (DOCBIN-01)", async () => {
    const result = await createUploadIntent(TENANT_A, intentInput("reserve"), NOW);
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.intent.tenantId).toBe(TENANT_A);
      expect(result.intent.state).toBe("pending");
      expect(result.intent.expiresAtIntent).toEqual(new Date(NOW.getTime() + HOUR));
    }
  });

  it("rejeita reserva ativa do mesmo hash no mesmo tenant com resultado estável", async () => {
    const original = intentInput("same-hash");
    expect((await createUploadIntent(TENANT_A, original, NOW)).kind).toBe("created");
    expect((await createUploadIntent(TENANT_A, { ...intentInput("other-key"), clientSha256: original.clientSha256 }, NOW)).kind).toBe("active_duplicate");
  });

  it("permite o mesmo hash em outro tenant sem revelar a reserva original", async () => {
    const input = intentInput("cross-tenant");
    expect((await createUploadIntent(TENANT_A, input, NOW)).kind).toBe("created");
    const other = await createUploadIntent(TENANT_B, { ...input, storageKey: `documents/${TENANT_B}/cross/${randomUUID()}` }, NOW);
    expect(other.kind).toBe("created");
    if (other.kind === "created") expect(other.intent.tenantId).toBe(TENANT_B);
  });

  it("expira a reserva anterior antes de aceitar novamente o mesmo hash", async () => {
    const input = intentInput("expired-reserve", { expiresAtIntent: new Date(NOW.getTime() - 1) });
    expect((await createUploadIntent(TENANT_A, input, NOW)).kind).toBe("created");
    const later = await createUploadIntent(TENANT_A, { ...intentInput("renewed"), clientSha256: input.clientSha256 }, NOW);
    expect(later.kind).toBe("created");
  });

  it("uma corrida de reservas do mesmo hash deixa uma única reserva ativa", async () => {
    const input = intentInput("race");
    const results = await Promise.all([
      createUploadIntent(TENANT_A, input, NOW),
      createUploadIntent(TENANT_A, { ...input, storageKey: `${input.storageKey}-other` }, NOW),
    ]);
    expect(results.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "active_duplicate")).toHaveLength(1);
  });

  it("reivindica uma intent pendente por CAS e não a reivindica duas vezes", async () => {
    const created = await createUploadIntent(TENANT_A, intentInput("claim"), NOW);
    if (created.kind !== "created") throw new Error("fixture intent was not created");
    expect((await claimUploadIntentForFinalization(TENANT_A, created.intent.id, NOW)).kind).toBe("claimed");
    expect((await claimUploadIntentForFinalization(TENANT_A, created.intent.id, NOW)).kind).toBe("not_claimable");
  });

  it("não reivindica intent expirada", async () => {
    const created = await createUploadIntent(TENANT_A, intentInput("expired-claim", { expiresAtIntent: new Date(NOW.getTime() - 1) }), NOW);
    if (created.kind !== "created") throw new Error("fixture intent was not created");
    expect((await claimUploadIntentForFinalization(TENANT_A, created.intent.id, NOW)).kind).toBe("expired");
  });

  it("não expõe intent de outro tenant", async () => {
    const created = await createUploadIntent(TENANT_A, intentInput("hidden-claim"), NOW);
    if (created.kind !== "created") throw new Error("fixture intent was not created");
    expect((await claimUploadIntentForFinalization(TENANT_B, created.intent.id, NOW)).kind).toBe("not_found");
  });

  it("finaliza uma intent reivindicada em documento processando com attempt inicial", async () => {
    const intent = await claimedIntent("commit");
    const result = await commitUploadIntent(TENANT_A, intent.id, { storageProvider: "vercel_blob", storageEtag: "etag-commit", contentSha256: hash("content-commit"), now: NOW });
    expect(result.kind).toBe("committed");
    if (result.kind === "committed") {
      expect(result.document.status).toBe("processando");
      expect(result.document.processingAttempt).toBe(1);
      expect(result.document.storageKey).toBe(intent.storageKey);
    }
  });

  it("repetir a finalização devolve o mesmo documentId", async () => {
    const intent = await claimedIntent("idempotent-commit");
    const input = { storageProvider: "vercel_blob", storageEtag: "etag-idempotent", contentSha256: hash("content-idempotent"), now: NOW };
    const first = await commitUploadIntent(TENANT_A, intent.id, input);
    if (first.kind !== "committed") throw new Error("fixture document was not committed");
    expect(await commitUploadIntent(TENANT_A, intent.id, input)).toEqual({ kind: "already_committed", documentId: first.document.id });
  });

  it("violação de hash ativo retorna duplicata de domínio, não erro do Postgres", async () => {
    const first = await claimedIntent("duplicate-source");
    const sharedHash = hash("shared-content");
    expect((await commitUploadIntent(TENANT_A, first.id, { storageProvider: "vercel_blob", storageEtag: "etag-source", contentSha256: sharedHash, now: NOW })).kind).toBe("committed");
    const second = await claimedIntent("duplicate-target");
    const duplicate = await commitUploadIntent(TENANT_A, second.id, { storageProvider: "vercel_blob", storageEtag: "etag-target", contentSha256: sharedHash, now: NOW });
    expect(duplicate.kind).toBe("duplicate_content");
  });

  it("listagem ativa é isolada e não seleciona extractedText", async () => {
    const a = await committedDocument("list-a");
    const b = await committedDocument("list-b", TENANT_B);
    await completeDocumentProcessing(TENANT_A, { documentId: a.id, processingAttempt: 1, status: "pronto", extractedText: "segredo", extractedBytes: 7, extractorVersion: "v1", now: NOW });
    const listed = await listTenantDocuments(TENANT_A);
    expect(listed.some((item) => item.id === a.id)).toBe(true);
    expect(listed.some((item) => item.id === b.id)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(listed.find((item) => item.id === a.id)!, "extractedText")).toBe(false);
  });

  it("retry de falha incrementa attempt uma vez e limpa falha anterior", async () => {
    const document = await committedDocument("retry");
    expect(await completeDocumentProcessing(TENANT_A, { documentId: document.id, processingAttempt: 1, status: "falha", failureCode: "pdf_invalido", now: NOW })).toBe("applied");
    expect(await retryDocumentProcessing(TENANT_A, document.id, NOW)).toBe("applied");
    expect(await retryDocumentProcessing(TENANT_A, document.id, NOW)).toBe("stale");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row).toMatchObject({ status: "processando", processingAttempt: 2, failureCode: null, extractedText: null });
  });

  it("conclusão CAS recusa resultado atrasado e aplica somente attempt vigente", async () => {
    const document = await committedDocument("completion-cas");
    expect(await completeDocumentProcessing(TENANT_A, { documentId: document.id, processingAttempt: 2, status: "pronto", extractedText: "late", now: NOW })).toBe("stale");
    expect(await completeDocumentProcessing(TENANT_A, { documentId: document.id, processingAttempt: 1, status: "pronto", extractedText: "atual", extractedBytes: 5, extractorVersion: "v1", now: NOW })).toBe("applied");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row.extractedText).toBe("atual");
  });

  it("tombstone bloqueia nova conclusão e limpa texto imediatamente", async () => {
    const document = await committedDocument("tombstone");
    await completeDocumentProcessing(TENANT_A, { documentId: document.id, processingAttempt: 1, status: "pronto", extractedText: "privado", extractedBytes: 7, extractorVersion: "v1", now: NOW });
    expect(await tombstoneDocument(TENANT_A, document.id, NOW)).toBe("tombstoned");
    expect(await tombstoneDocument(TENANT_A, document.id, NOW)).toBe("already_tombstoned");
    expect(await completeDocumentProcessing(TENANT_A, { documentId: document.id, processingAttempt: 1, status: "pronto", extractedText: "reativar", now: NOW })).toBe("stale");
    const [row] = await db.select().from(documents).where(eq(documents.id, document.id));
    expect(row).toMatchObject({ extractedText: null, deletedAt: NOW });
  });

  it("expiração marca apenas documentos vencidos e remove o texto", async () => {
    const expired = await claimedIntent("expiry");
    const result = await commitUploadIntent(TENANT_A, expired.id, { storageProvider: "vercel_blob", storageEtag: "etag-expiry", contentSha256: hash("expiry"), now: NOW });
    if (result.kind !== "committed") throw new Error("fixture document was not committed");
    await db.update(documents).set({ expiresAt: new Date(NOW.getTime() - 1), extractedText: "expirar" }).where(eq(documents.id, result.document.id));
    expect((await expireDueDocuments(NOW)).map((row) => row.id)).toContain(result.document.id);
    const [row] = await db.select().from(documents).where(eq(documents.id, result.document.id));
    expect(row).toMatchObject({ extractedText: null, deletedAt: NOW });
  });

  it("limites são upsertados por tenant e modalidade sem alterar outro tenant", async () => {
    const base = { queryModality: "novo" as const, maxResponseBytes: 100, modelId: "model-a", workflowVersion: "workflow-a", systemMessageHash: "system-a", toolsHash: "tools-a", memoryWindow: 50, benchmarkedAt: NOW, metrics: { bytes: 100 } };
    await upsertDocumentContextLimit(TENANT_A, base);
    await upsertDocumentContextLimit(TENANT_A, { ...base, maxResponseBytes: 80, metrics: { bytes: 80 } });
    await upsertDocumentContextLimit(TENANT_B, base);
    const rows = await db.select().from(tenantDocumentContextLimits).where(and(eq(tenantDocumentContextLimits.queryModality, "novo"), inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B])));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.tenantId === TENANT_A)?.maxResponseBytes).toBe(80);
    expect(rows.find((row) => row.tenantId === TENANT_B)?.maxResponseBytes).toBe(100);
  });

  it("tombstone de outro tenant é indistinguível de documento inexistente", async () => {
    const document = await committedDocument("other-tombstone");
    expect(await tombstoneDocument(TENANT_B, document.id, NOW)).toBe("not_found");
    const [active] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, document.id), isNull(documents.deletedAt)));
    expect(active.id).toBe(document.id);
  });
});
