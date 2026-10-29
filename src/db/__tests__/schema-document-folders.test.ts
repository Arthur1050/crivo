import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyDocumentFoldersSql, verifyDocumentFoldersState } from "../../../scripts/document-folders/apply";
import { db } from "../index";
import { documentFolders, documents, documentUploadIntents, tenants, users } from "../schema";
import { currentTestDatabaseUrl } from "./vitrine-helpers";

const tenantA = randomUUID();
const tenantB = randomUUID();
const userId = randomUUID();
const tenantIds = [tenantA, tenantB];
const url = currentTestDatabaseUrl();

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { code?: string; cause?: unknown };
  return record.code ?? pgCode(record.cause);
}

describe("L17 T3 — modelo e SQL de pastas (PMOD-01, PBANCO-01)", () => {
  beforeAll(async () => {
    await db.insert(tenants).values(tenantIds.map((id) => ({
      id, name: "Teste pastas", slug: `schema-folders-${id}`, agentName: "Agente", supportedModality: "ambos" as const,
    })));
    await db.insert(users).values({ id: userId, name: "Teste pastas", email: `${userId}@example.test` });
  });

  afterAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, tenantIds));
    await db.delete(documents).where(inArray(documents.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  });

  it("recusa nome igual com outra caixa no mesmo tenant, mas aceita em outro tenant", async () => {
    await db.insert(documentFolders).values({ tenantId: tenantA, name: "Contratos" });
    const code = await db.insert(documentFolders).values({ tenantId: tenantA, name: "CONTRATOS" })
      .then(() => undefined, pgCode);
    expect(code).toBe("23505");
    const [other] = await db.insert(documentFolders).values({ tenantId: tenantB, name: "CONTRATOS" }).returning();
    expect(other).toMatchObject({ tenantId: tenantB, name: "CONTRATOS" });
    expect(other.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(other.createdAt).toBeInstanceOf(Date);
    expect(other.updatedAt).toBeInstanceOf(Date);
  });

  it("apagar pasta zera os vínculos e preserva documento e intenção", async () => {
    const [folder] = await db.insert(documentFolders).values({ tenantId: tenantA, name: "Apagar" }).returning();
    const [doc] = await db.insert(documents).values({
      tenantId: tenantA, folderId: folder.id, name: "Contrato", modality: "novo", mimeType: "text/plain",
      sizeBytes: 17n, storageProvider: "teste", storageKey: randomUUID(), storageEtag: "etag",
      contentSha256: randomUUID().replaceAll("-", "").repeat(2), status: "pronto", extractedText: "Contrato preservado",
    }).returning();
    const [intent] = await db.insert(documentUploadIntents).values({
      tenantId: tenantA, folderId: folder.id, requestedByUserId: userId, name: "Envio", modality: "novo",
      mimeType: "text/plain", sizeBytes: 18n, storageKey: randomUUID(),
      clientSha256: randomUUID().replaceAll("-", "").repeat(2), expiresAtIntent: new Date("2030-01-01"),
    }).returning();
    await db.delete(documentFolders).where(eq(documentFolders.id, folder.id));
    const [afterDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    const [afterIntent] = await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, intent.id));
    expect(afterDoc).toEqual({ ...doc, folderId: null });
    expect(afterIntent).toEqual({ ...intent, folderId: null });
  });

  it("apagar tenant apaga suas pastas em cascata", async () => {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await db.insert(tenants).values({ id: tenantId, slug: `schema-folders-${tenantId}`, name: "Cascata", agentName: "Agente", supportedModality: "ambos" });
    const [folder] = await db.insert(documentFolders).values({ tenantId, name: "Cascata" }).returning();
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    expect(await db.select().from(documentFolders).where(eq(documentFolders.id, folder.id))).toEqual([]);
  });

  it("aplica o SQL duas vezes e confere nomes e regras das FKs e todos os índices", async () => {
    await applyDocumentFoldersSql(url);
    await applyDocumentFoldersSql(url);
    expect(await verifyDocumentFoldersState(url)).toEqual([]);
    const result = await db.execute(sql`select conname, confdeltype from pg_constraint where conname in (
      'document_folders_tenant_id_tenants_id_fk', 'documents_folder_id_document_folders_id_fk',
      'document_upload_intents_folder_id_document_folders_id_fk') order by conname`);
    expect(result.rows).toEqual([
      { conname: "document_folders_tenant_id_tenants_id_fk", confdeltype: "c" },
      { conname: "document_upload_intents_folder_id_document_folders_id_fk", confdeltype: "n" },
      { conname: "documents_folder_id_document_folders_id_fk", confdeltype: "n" },
    ]);
  });

  it("detecta índice de pasta ausente e o SQL o restaura", async () => {
    try {
      await db.execute(sql`drop index document_folders_tenant_id_lower_name_idx`);
      expect(await verifyDocumentFoldersState(url)).toEqual(["índice document_folders_tenant_id_lower_name_idx ausente"]);
    } finally {
      await applyDocumentFoldersSql(url);
    }
    expect(await verifyDocumentFoldersState(url)).toEqual([]);
  });
});
