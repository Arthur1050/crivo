import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { documentFolders, documents, documentUploadIntents, tenants, users } from "../../../db/schema";
import { getDocumentFolder, listDocumentFolderSummaries } from "../document-folders";

const tenantA = randomUUID();
const tenantB = randomUUID();
const userId = randomUUID();
const OLD = new Date("2020-01-01T12:00:00Z");
const UPLOADED = new Date("2021-01-01T12:00:00Z");
const NOW = new Date("2024-01-01T12:00:00Z");

async function folder(name: string, tenantId = tenantA, updatedAt = OLD) {
  const [row] = await db.insert(documentFolders).values({ tenantId, name, createdAt: OLD, updatedAt }).returning();
  return row;
}

async function document(folderId: string | null, overrides: Partial<typeof documents.$inferInsert> = {}) {
  const [row] = await db.insert(documents).values({
    tenantId: tenantA, folderId, name: "Documento", mimeType: "text/plain", sizeBytes: 12n,
    modality: "novo", storageProvider: "teste", storageKey: randomUUID(), storageEtag: "etag",
    contentSha256: randomUUID().replaceAll("-", "").repeat(2), status: "pronto", uploadedAt: UPLOADED,
    extractedText: "Texto que o agente recebe", processingAttempt: 3, ...overrides,
  }).returning();
  return row;
}

beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
    id, name: "Pastas DAL", slug: `pastas-dal-${id}`, agentName: "Agente", supportedModality: "ambos" as const,
  })));
  await db.insert(users).values({ id: userId, name: "Pastas DAL", email: `${userId}@example.test` });
});

afterAll(async () => {
  await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [tenantA, tenantB]));
  await db.delete(documents).where(inArray(documents.tenantId, [tenantA, tenantB]));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.delete(users).where(eq(users.id, userId));
  await db.$client.end();
});

describe("T6 — leitura das pastas (PLER-01)", () => {
  it("conta só documentos ativos do mesmo tenant, soma mais de 2 GiB e usa o upload mais recente", async () => {
    const a = await folder("Resumo");
    const b = await folder("Estrangeira", tenantB);
    await document(a.id, { sizeBytes: 3_000_000_000n });
    await document(a.id, { sizeBytes: 19n });
    await document(a.id, { sizeBytes: 999n, deletedAt: NOW, uploadedAt: NOW });
    await document(a.id, { tenantId: tenantB, sizeBytes: 888n, uploadedAt: NOW });
    const result = await listDocumentFolderSummaries(tenantA);
    expect(result.find((f) => f.id === a.id)).toEqual({
      id: a.id, name: "Resumo", fileCount: 2, totalSizeBytes: 3_000_000_019, lastActivityAt: UPLOADED,
    });
    expect(result.some((f) => f.id === b.id)).toBe(false);
  });

  it("usa updated_at quando maior e o preserva também em pasta vazia", async () => {
    const updated = await folder("Atualizada", tenantA, NOW);
    await document(updated.id);
    const empty = await folder("Vazia", tenantA, NOW);
    const result = await listDocumentFolderSummaries(tenantA);
    expect(result.find((f) => f.id === updated.id)?.lastActivityAt).toEqual(NOW);
    expect(result.find((f) => f.id === empty.id)).toEqual({
      id: empty.id, name: "Vazia", fileCount: 0, totalSizeBytes: 0, lastActivityAt: NOW,
    });
  });

  it("ordena em português e desempata por id", async () => {
    const accent = await folder("Ágape");
    const plain = await folder("agape");
    const banco = await folder("banco");
    const zeta = await folder("Zeta");
    const ids = [accent.id, plain.id, banco.id, zeta.id];
    const rows = (await listDocumentFolderSummaries(tenantA)).filter((f) => ids.includes(f.id));
    expect(rows.map((f) => f.id)).toEqual([...ids.slice(0, 2).sort(), banco.id, zeta.id]);
  });

  it("lê só a pasta do dono; UUID inválido retorna null sem consulta", async () => {
    const row = await folder("Busca");
    expect(await getDocumentFolder(tenantA, row.id)).toEqual({ id: row.id, name: "Busca" });
    expect(await getDocumentFolder(tenantB, row.id)).toBeNull();
    expect(await getDocumentFolder(tenantA, randomUUID())).toBeNull();
    const select = vi.spyOn(db, "select");
    try {
      expect(await getDocumentFolder(tenantA, "abc")).toBeNull();
      expect(select).not.toHaveBeenCalled();
    } finally { select.mockRestore(); }
  });
});
