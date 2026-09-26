import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { documents, tenants } from "../../../db/schema";
import { findDocumentForDownload, findDocumentTextPreview } from "../repository";

// DOCVIEW-01 AC3/AC5/AC7 no banco real: os testes das rotas mockam os finders,
// então o predicado de tenant e de estado só é exercitado aqui (Verifier
// de T37: remover o filtro de tenant sobrevivia à suíte inteira).
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const NOW = new Date("2030-01-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

async function insert(seed: string, overrides: Partial<typeof documents.$inferInsert> = {}) {
  const [row] = await db.insert(documents).values({
    tenantId: TENANT_A, name: `${seed}.txt`, modality: "novo", mimeType: "text/plain", sizeBytes: 12n,
    storageProvider: "vercel_blob", storageKey: `documents/v1/${TENANT_A}/${seed}-${randomUUID()}`,
    storageEtag: `etag-${seed}`, contentSha256: `${seed}-${randomUUID()}`.padEnd(64, "0").slice(0, 64),
    status: "pronto", processingAttempt: 1, extractedText: `texto ${seed}`, extractedBytes: 11,
    ...overrides,
  }).returning();
  return row;
}

describe("finders de preview e download (lote-12 T39)", () => {
  beforeAll(async () => {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Finders A", agentName: "A", supportedModality: "ambos", slug: `finders-a-${TENANT_A}` },
      { id: TENANT_B, name: "Finders B", agentName: "B", supportedModality: "ambos", slug: `finders-b-${TENANT_B}` },
    ]);
  });

  afterAll(async () => {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  it("entrega download e preview ao próprio tenant", async () => {
    const doc = await insert("proprio");
    await expect(findDocumentForDownload(TENANT_A, doc.id, NOW)).resolves.toEqual({ storageKey: doc.storageKey, name: "proprio.txt", mimeType: "text/plain" });
    await expect(findDocumentTextPreview(TENANT_A, doc.id, NOW)).resolves.toEqual({ status: "pronto", extractedText: "texto proprio" });
  });

  it("documento de outro tenant é inexistente no download e no preview (AC5)", async () => {
    const doc = await insert("alheio");
    await expect(findDocumentForDownload(TENANT_B, doc.id, NOW)).resolves.toBeNull();
    await expect(findDocumentTextPreview(TENANT_B, doc.id, NOW)).resolves.toBeNull();
  });

  it("documento excluído não é entregue (AC7)", async () => {
    const doc = await insert("excluido", { deletedAt: new Date(NOW.getTime() - HOUR) });
    await expect(findDocumentForDownload(TENANT_A, doc.id, NOW)).resolves.toBeNull();
    await expect(findDocumentTextPreview(TENANT_A, doc.id, NOW)).resolves.toBeNull();
  });

  it("validade no instante exato já bloqueia (AC7)", async () => {
    const doc = await insert("expira-agora", { expiresAt: NOW });
    await expect(findDocumentForDownload(TENANT_A, doc.id, NOW)).resolves.toBeNull();
    await expect(findDocumentTextPreview(TENANT_A, doc.id, NOW)).resolves.toBeNull();
  });

  it("validade futura ainda entrega", async () => {
    const doc = await insert("expira-depois", { expiresAt: new Date(NOW.getTime() + HOUR) });
    await expect(findDocumentForDownload(TENANT_A, doc.id, NOW)).resolves.not.toBeNull();
    await expect(findDocumentTextPreview(TENANT_A, doc.id, NOW)).resolves.not.toBeNull();
  });

  it("preview exige texto de documento pronto ou fora do agente (AC3)", async () => {
    const processando = await insert("processando", { status: "processando", extractedText: null, extractedBytes: null });
    const falha = await insert("falha", { status: "falha", extractedText: null, extractedBytes: null });
    const fora = await insert("fora", { status: "fora_do_agente" });
    await expect(findDocumentTextPreview(TENANT_A, processando.id, NOW)).resolves.toBeNull();
    await expect(findDocumentTextPreview(TENANT_A, falha.id, NOW)).resolves.toBeNull();
    await expect(findDocumentTextPreview(TENANT_A, fora.id, NOW)).resolves.toEqual({ status: "fora_do_agente", extractedText: "texto fora" });
  });

  it("download do original segue disponível em falha, sem depender do texto", async () => {
    const falha = await insert("falha-original", { status: "falha", extractedText: null, extractedBytes: null });
    await expect(findDocumentForDownload(TENANT_A, falha.id, NOW)).resolves.toMatchObject({ name: "falha-original.txt" });
  });
});
