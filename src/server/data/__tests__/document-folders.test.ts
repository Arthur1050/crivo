import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { documentCategories, documentFolders, documents, documentUploadIntents, tenants, users } from "../../../db/schema";
import { createDocumentFolder, deleteDocumentFolder, getDocumentFolder, listDocumentFolderSummaries, moveDocumentsToFolder, renameDocumentFolder } from "../document-folders";

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

describe("T7 — escrita das pastas (PCRIAR-01, PREN-01, PEXC-01)", () => {
  it("cria com data explícita, recusa duplicada e resolve corrida sem lançar", async () => {
    const result = await createDocumentFolder(tenantA, "Criada", NOW);
    expect(result).toMatchObject({ kind: "created", folder: { name: "Criada" } });
    if (result.kind !== "created") throw new Error("Pasta não criada");
    const [stored] = await db.select().from(documentFolders).where(eq(documentFolders.id, result.folder.id));
    expect(stored).toEqual({ id: result.folder.id, tenantId: tenantA, name: "Criada", createdAt: NOW, updatedAt: NOW });
    expect(await createDocumentFolder(tenantA, "CRIADA")).toEqual({ kind: "duplicate_name" });
    const race = await Promise.all([createDocumentFolder(tenantA, "Corrida"), createDocumentFolder(tenantA, "CORRIDA")]);
    expect(race.map((r) => r.kind).sort()).toEqual(["created", "duplicate_name"]);
  });

  it("renomeia, aceita a própria grafia e só a caixa, mas recusa nome de outra pasta", async () => {
    const row = await folder("Antes");
    const doc = await document(row.id);
    expect(await renameDocumentFolder(tenantA, row.id, "Depois", NOW)).toEqual({ kind: "renamed", folder: { id: row.id, name: "Depois" } });
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0].updatedAt).toEqual(NOW);
    expect(await renameDocumentFolder(tenantA, row.id, "DEPOIS")).toEqual({ kind: "renamed", folder: { id: row.id, name: "DEPOIS" } });
    expect(await renameDocumentFolder(tenantA, row.id, "DEPOIS")).toEqual({ kind: "renamed", folder: { id: row.id, name: "DEPOIS" } });
    await folder("Ocupada");
    const [before] = await db.select().from(documentFolders).where(eq(documentFolders.id, row.id));
    expect(await renameDocumentFolder(tenantA, row.id, "OCUPADA")).toEqual({ kind: "duplicate_name" });
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0]).toEqual(before);
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
  });

  it("escritas em pasta estrangeira, inexistente ou id inválido não mudam linhas", async () => {
    const foreign = await folder("Protegida", tenantB);
    for (const id of [foreign.id, randomUUID(), "abc"]) {
      expect(await renameDocumentFolder(tenantA, id, "Intrusa")).toEqual({ kind: "not_found" });
      expect(await deleteDocumentFolder(tenantA, id)).toEqual({ kind: "not_found" });
    }
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, foreign.id)))[0]).toEqual(foreign);
  });

  it("exclui contando só os ativos e preservando todos os demais campos e as intenções", async () => {
    const row = await folder("Excluir");
    const [category] = await db.insert(documentCategories).values({ tenantId: tenantA, name: "Preservada" }).returning();
    const live = await document(row.id, { categoryId: category.id });
    const deleted = await document(row.id, { status: "falha", deletedAt: NOW, categoryId: category.id });
    const [intent] = await db.insert(documentUploadIntents).values({
      tenantId: tenantA, folderId: row.id, requestedByUserId: userId, name: "Envio", mimeType: "text/plain",
      sizeBytes: 21n, modality: "usado", storageKey: randomUUID(), clientSha256: randomUUID().replaceAll("-", "").repeat(2), expiresAtIntent: NOW,
    }).returning();
    expect(await deleteDocumentFolder(tenantA, row.id)).toEqual({ kind: "deleted", movedToRootCount: 1 });
    expect(await getDocumentFolder(tenantA, row.id)).toBeNull();
    for (const doc of [live, deleted]) {
      expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual({ ...doc, folderId: null });
    }
    expect((await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, intent.id)))[0]).toEqual({ ...intent, folderId: null });
  });
});

afterAll(async () => {
  await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [tenantA, tenantB]));
  await db.delete(documents).where(inArray(documents.tenantId, [tenantA, tenantB]));
  await db.delete(documentCategories).where(inArray(documentCategories.tenantId, [tenantA, tenantB]));
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


describe("T8: movimentacao atomica (PMOVER-01)", () => {
  it("move de duas origens, atualiza as tres pastas e preserva todos os outros campos", async () => {
    const fromA = await folder("Mover origem A");
    const fromB = await folder("Mover origem B");
    const dest = await folder("Mover destino");
    const docs = [await document(fromA.id), await document(fromB.id, { status: "fora_do_agente" })];
    expect(await moveDocumentsToFolder(tenantA, docs.map((d) => d.id), dest.id, NOW)).toEqual({ kind: "moved", movedCount: 2 });
    for (const doc of docs) {
      expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual({ ...doc, folderId: dest.id });
    }
    for (const row of [fromA, fromB, dest]) {
      expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0].updatedAt).toEqual(NOW);
    }
  });

  it("deduplica, retira para a raiz e nao toca data quando todos ja estao no destino", async () => {
    const row = await folder("Mover repetido");
    const doc = await document(null);
    expect(await moveDocumentsToFolder(tenantA, [doc.id, doc.id], row.id, NOW)).toEqual({ kind: "moved", movedCount: 1 });
    expect(await moveDocumentsToFolder(tenantA, [doc.id], row.id, new Date("2025-01-01"))).toEqual({ kind: "moved", movedCount: 0 });
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0].updatedAt).toEqual(NOW);
    expect(await moveDocumentsToFolder(tenantA, [doc.id], null, UPLOADED)).toEqual({ kind: "moved", movedCount: 1 });
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0].updatedAt).toEqual(UPLOADED);
  });

  it("recusa selecoes invalidas e destinos invalidos sem alterar linhas", async () => {
    const source = await folder("Origem invalida");
    const foreign = await folder("Destino estrangeiro", tenantB);
    const doc = await document(source.id);
    for (const ids of [[], Array.from({ length: 101 }, () => randomUUID()), [doc.id, "abc"]]) {
      expect(await moveDocumentsToFolder(tenantA, ids, null)).toEqual({ kind: "invalid_selection" });
    }
    for (const target of [foreign.id, randomUUID(), "abc"]) {
      expect(await moveDocumentsToFolder(tenantA, [doc.id], target)).toEqual({ kind: "folder_not_found" });
    }
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, source.id)))[0]).toEqual(source);
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, foreign.id)))[0]).toEqual(foreign);
  });

  it("um documento ausente, excluido ou estrangeiro impede a lista inteira", async () => {
    const source = await folder("Origem atomica");
    const dest = await folder("Destino atomico");
    const valid = await document(source.id);
    const foreign = await document(null, { tenantId: tenantB });
    const deleted = await document(source.id, { deletedAt: NOW });
    for (const missing of [foreign.id, deleted.id, randomUUID()]) {
      expect(await moveDocumentsToFolder(tenantA, [valid.id, missing], dest.id)).toEqual({ kind: "document_not_found" });
      expect((await db.select().from(documents).where(eq(documents.id, valid.id)))[0]).toEqual(valid);
    }
    expect((await db.select().from(documents).where(eq(documents.id, foreign.id)))[0]).toEqual(foreign);
    expect((await db.select().from(documents).where(eq(documents.id, deleted.id)))[0]).toEqual(deleted);
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, dest.id)))[0]).toEqual(dest);
  });

  it("espera a exclusao concorrente da pasta e retorna folder_not_found (L-052)", async () => {
    const dest = await folder("Destino concorrente");
    const doc = await document(null);
    const locker = await db.$client.connect();
    let pending: ReturnType<typeof moveDocumentsToFolder> | undefined;
    try {
      await locker.query("begin");
      const pid = (await locker.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
      await locker.query("select id from document_folders where id=$1 and tenant_id=$2 for update", [dest.id, tenantA]);
      pending = moveDocumentsToFolder(tenantA, [doc.id], dest.id);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const result = await db.$client.query<{ waiting: boolean }>(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))) as waiting", [pid]
        );
        waiting = result.rows[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
      await locker.query("delete from document_folders where id=$1 and tenant_id=$2", [dest.id, tenantA]);
      await locker.query("commit");
      expect(await pending).toEqual({ kind: "folder_not_found" });
      expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
    } finally {
      await locker.query("rollback");
      locker.release();
      await pending;
    }
  });
});
