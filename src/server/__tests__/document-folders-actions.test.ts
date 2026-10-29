import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import { documentFolders, documents, tenants } from "../../db/schema";
import type { AuthContext } from "../auth/session";
import { createDocumentFolderAction, deleteDocumentFolderAction, moveDocumentsToFolderAction, renameDocumentFolderAction } from "../actions/document-folders";

const session = vi.hoisted(() => ({ tenantId: "", roles: ["gestor"] as AuthContext["roles"] }));
vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  const fake = async (): Promise<AuthContext> => ({
    user: { id: "00000000-0000-4000-8000-0000000000aa", name: "Gestor", email: "gestor@example.test" },
    tenantId: session.tenantId, roles: session.roles, leadScope: { tenantId: session.tenantId, assignedUserId: null },
  });
  return { ...actual, verifySession: fake,
    requirePermission: async (resource: Parameters<typeof actual.requirePermission>[0], action: Parameters<typeof actual.requirePermission>[1]) => actual.authorizeOrThrow(await fake(), resource, action),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";

const tenantA = randomUUID();
const tenantB = randomUUID();
const OLD = new Date("2020-01-01");

async function addFolder(name: string, tenantId = tenantA) {
  const [row] = await db.insert(documentFolders).values({ tenantId, name, updatedAt: OLD }).returning();
  return row;
}

async function addDocument(folderId: string | null = null) {
  const [row] = await db.insert(documents).values({ tenantId: tenantA, folderId, name: "Mover action", modality: "novo", mimeType: "text/plain", sizeBytes: 10n,
    storageProvider: "teste", storageKey: randomUUID(), storageEtag: "etag", contentSha256: randomUUID().replaceAll("-", "").repeat(2), status: "pronto" }).returning();
  return row;
}

beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
    id, name: "Actions pastas", slug: `actions-pastas-${id}`, agentName: "Agente", supportedModality: "ambos" as const,
  })));
});

describe("T14 — action de mover (PMOVER-01, PPERM-01)", () => {
  it("move no tenant ativo, devolve movedCount real e revalida; null retira da pasta", async () => {
    const row = await addFolder("Mover action");
    const doc = await addDocument();
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id], folderId: row.id })).toEqual({ ok: true, movedCount: 1 });
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual({ ...doc, folderId: row.id });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/documentos");
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id], folderId: row.id })).toEqual({ ok: true, movedCount: 0 });
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id], folderId: null })).toEqual({ ok: true, movedCount: 1 });
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
  });

  it("traduz cada erro de domínio com mensagem exata e não revalida ou muda linhas", async () => {
    const row = await addFolder("Destino estrangeiro action", tenantB);
    const doc = await addDocument();
    expect(await moveDocumentsToFolderAction({ documentIds: [], folderId: null })).toEqual({ ok: false, code: "selecao-invalida", error: "Selecione de 1 a 100 documentos." });
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id], folderId: row.id })).toEqual({ ok: false, code: "pasta-nao-encontrada", error: "Pasta não encontrada." });
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id, randomUUID()], folderId: null })).toEqual({ ok: false, code: "documento-nao-encontrado", error: "Documento não encontrado." });
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0]).toEqual(row);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("corretor recebe sem-permissao e mantém a pasta atual do documento", async () => {
    const row = await addFolder("Origem protegida action");
    const doc = await addDocument(row.id);
    session.roles = ["corretor"];
    expect(await moveDocumentsToFolderAction({ documentIds: [doc.id], folderId: null })).toEqual({ ok: false, code: "sem-permissao", error: "Sem permissão para escrever documentos." });
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual(doc);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
beforeEach(() => { session.tenantId = tenantA; session.roles = ["gestor"]; vi.clearAllMocks(); });
afterAll(async () => {
  await db.delete(documents).where(inArray(documents.tenantId, [tenantA, tenantB]));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.$client.end();
});

describe("T13 — actions de pasta (PCRIAR-01, PREN-01, PEXC-01, PPERM-01)", () => {
  it("cria e renomeia sem espaços, salva no tenant da sessão e revalida no sucesso (L-026)", async () => {
    const result = await createDocumentFolderAction({ name: "  Contratos  " });
    expect(result).toMatchObject({ ok: true, folder: { name: "Contratos" } });
    if (!result.ok) throw new Error("Pasta não criada");
    const [created] = await db.select().from(documentFolders).where(eq(documentFolders.id, result.folder.id));
    expect(created).toMatchObject({ tenantId: tenantA, name: "Contratos" });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/documentos");
    vi.mocked(revalidatePath).mockClear();
    expect(await renameDocumentFolderAction({ folderId: result.folder.id, name: "  CONTRATOS NOVOS  " })).toEqual({ ok: true, folder: { id: result.folder.id, name: "CONTRATOS NOVOS" } });
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, result.folder.id)))[0].name).toBe("CONTRATOS NOVOS");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/documentos");
  });

  it.each(["", "   ", "x".repeat(121)])("recusa nome inválido %j nas duas actions sem gravar nem revalidar", async (name) => {
    const row = await addFolder(`Nome inválido ${randomUUID()}`);
    const before = await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA));
    const error = name.trim().length === 0 ? "Nome da pasta não pode ser vazio." : "Nome da pasta deve ter no máximo 120 caracteres.";
    expect(await createDocumentFolderAction({ name })).toEqual({ ok: false, code: "nome-invalido", error });
    expect(await renameDocumentFolderAction({ folderId: row.id, name })).toEqual({ ok: false, code: "nome-invalido", error });
    expect(await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA))).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("aceita 120 caracteres e renomear só a caixa ou para o mesmo nome", async () => {
    const name = "x".repeat(120);
    const result = await createDocumentFolderAction({ name });
    expect(result).toMatchObject({ ok: true, folder: { name } });
    if (!result.ok) throw new Error("Pasta não criada");
    expect(await renameDocumentFolderAction({ folderId: result.folder.id, name: name.toUpperCase() })).toEqual({ ok: true, folder: { id: result.folder.id, name: name.toUpperCase() } });
    expect(await renameDocumentFolderAction({ folderId: result.folder.id, name: name.toUpperCase() })).toEqual({ ok: true, folder: { id: result.folder.id, name: name.toUpperCase() } });
  });

  it("traduz nome duplicado em criação e renomeação sem alterar as pastas", async () => {
    await addFolder("Duplicada");
    const other = await addFolder("Outra");
    const before = await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA));
    const error = { ok: false, code: "nome-duplicado", error: "Já existe uma pasta com esse nome." };
    expect(await createDocumentFolderAction({ name: "DUPLICADA" })).toEqual(error);
    expect(await renameDocumentFolderAction({ folderId: other.id, name: "DUPLICADA" })).toEqual(error);
    expect(await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA))).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("pasta estrangeira, inexistente e id inválido devolvem o mesmo erro sem gravar", async () => {
    const row = await addFolder("Estrangeira", tenantB);
    const error = { ok: false, code: "pasta-nao-encontrada", error: "Pasta não encontrada." };
    for (const folderId of [row.id, randomUUID(), "abc"]) {
      expect(await renameDocumentFolderAction({ folderId, name: "Intrusa" })).toEqual(error);
      expect(await deleteDocumentFolderAction({ folderId })).toEqual(error);
    }
    expect((await db.select().from(documentFolders).where(eq(documentFolders.id, row.id)))[0]).toEqual(row);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("corretor é recusado nas três actions sem alterar linhas ou revalidar", async () => {
    const row = await addFolder("Somente leitura");
    session.roles = ["corretor"];
    const before = await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA));
    for (const call of [() => createDocumentFolderAction({ name: "Proibida" }), () => renameDocumentFolderAction({ folderId: row.id, name: "Proibida" }), () => deleteDocumentFolderAction({ folderId: row.id })]) {
      const result = await call();
      expect(result).toEqual({ ok: false, code: "sem-permissao", error: "Sem permissão para escrever documentos." });
    }
    expect(await db.select().from(documentFolders).where(eq(documentFolders.tenantId, tenantA))).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("exclui no tenant ativo, devolve a contagem e revalida (L-026)", async () => {
    const row = await addFolder("Excluir action");
    const [doc] = await db.insert(documents).values({ tenantId: tenantA, folderId: row.id, name: "Documento", modality: "novo", mimeType: "text/plain", sizeBytes: 10n,
      storageProvider: "teste", storageKey: randomUUID(), storageEtag: "etag", contentSha256: randomUUID().replaceAll("-", "").repeat(2), status: "pronto" }).returning();
    expect(await deleteDocumentFolderAction({ folderId: row.id })).toEqual({ ok: true, movedToRootCount: 1 });
    expect(await db.select().from(documentFolders).where(eq(documentFolders.id, row.id))).toEqual([]);
    expect((await db.select().from(documents).where(eq(documents.id, doc.id)))[0]).toEqual({ ...doc, folderId: null });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/documentos");
  });
});
