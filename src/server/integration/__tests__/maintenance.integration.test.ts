import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { documentUploadIntents, documents, tenants, users } from "../../../db/schema";
import { DocumentStorageError, type DocumentStorage } from "../../documents/storage";

// Espiões sobre o repositório e a purga: os quatro grupos da rotina diária só
// provam independência se cada um puder falhar isoladamente (DOCLIFE-01 AC10).
// O default chama a função real; só o teste de falha sobrescreve.
vi.mock("../../documents/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../documents/repository")>();
  return {
    ...actual,
    expireDueDocuments: vi.fn(actual.expireDueDocuments),
    listTombstonedDocuments: vi.fn(actual.listTombstonedDocuments),
    expireStaleUploadIntents: vi.fn(actual.expireStaleUploadIntents),
  };
});
vi.mock("../../data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../data")>();
  return { ...actual, purgeIntegrationRefusals: vi.fn(actual.purgeIntegrationRefusals) };
});

import { purgeIntegrationRefusals } from "../../data";
import {
  expireDueDocuments,
  expireStaleUploadIntents,
  listTombstonedDocuments,
} from "../../documents/repository";
import { runDailyMaintenance } from "../lgpd";

const mockedExpireDue = vi.mocked(expireDueDocuments);
const mockedListTombstones = vi.mocked(listTombstonedDocuments);
const mockedExpireIntents = vi.mocked(expireStaleUploadIntents);
const mockedPurge = vi.mocked(purgeIntegrationRefusals);

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_A = randomUUID();
const NOW = new Date("2031-03-01T12:00:00.000Z");

function hash(seed: string) { return seed.replaceAll("-", "").padEnd(64, "0").slice(0, 64); }

function storage(input: Partial<DocumentStorage> = {}): DocumentStorage {
  return {
    authorizeClientUpload: vi.fn(),
    delete: vi.fn(async () => undefined),
    head: vi.fn(async () => null),
    open: vi.fn(),
    ...input,
  } as DocumentStorage;
}

async function createDocument(
  overrides: Partial<typeof documents.$inferInsert> = {},
  tenantId = TENANT_A
) {
  const seed = randomUUID();
  const [row] = await db.insert(documents).values({
    tenantId,
    name: `doc-${seed}.txt`,
    modality: "novo",
    mimeType: "text/plain",
    sizeBytes: 12n,
    storageProvider: "vercel_blob",
    storageKey: `documents/v1/${tenantId}/${seed}`,
    storageEtag: `etag-${seed}`,
    contentSha256: hash(seed),
    status: "pronto",
    extractedText: "conteúdo sensível",
    extractedBytes: 18,
    ...overrides,
  }).returning();
  return row;
}

async function createIntent(
  overrides: Partial<typeof documentUploadIntents.$inferInsert> = {},
  tenantId = TENANT_A
) {
  const seed = randomUUID();
  const [row] = await db.insert(documentUploadIntents).values({
    tenantId,
    requestedByUserId: USER_A,
    clientSha256: hash(seed),
    name: `intent-${seed}.txt`,
    mimeType: "text/plain",
    sizeBytes: 12n,
    modality: "novo",
    storageKey: `documents/v1/${tenantId}/intent-${seed}`,
    expiresAtIntent: new Date(NOW.getTime() - 1),
    ...overrides,
  }).returning();
  return row;
}

async function documentRow(id: string) {
  return (await db.select().from(documents).where(eq(documents.id, id)))[0];
}
async function intentRow(id: string) {
  return (await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, id)))[0];
}

async function clearFixtures() {
  await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
  await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
}

describe("rotina diária de manutenção documental (lote-12 T19)", () => {
  beforeAll(async () => {
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Manutenção A", agentName: "A", supportedModality: "ambos", slug: `maint-a-${TENANT_A}` },
      { id: TENANT_B, name: "Manutenção B", agentName: "B", supportedModality: "ambos", slug: `maint-b-${TENANT_B}` },
    ]);
    await db.insert(users).values([{ id: USER_A, name: "Manutenção A", email: `maint-a-${USER_A}@example.test` }]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearFixtures();
  });

  afterAll(async () => {
    await clearFixtures();
    await db.delete(users).where(eq(users.id, USER_A));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  describe("boundary de expiração (L-023)", () => {
    it("documento com expiresAt exatamente igual a now é expirado e removido", async () => {
      const document = await createDocument({ expiresAt: NOW });
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result.deletedByTenant[TENANT_A]).toBe(1);
      expect(await documentRow(document.id)).toBeUndefined();
    });

    it("documento com expiresAt um milissegundo depois de now sobrevive intacto", async () => {
      const document = await createDocument({ expiresAt: new Date(NOW.getTime() + 1) });
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result.deletedByTenant[TENANT_A]).toBeUndefined();
      expect(await documentRow(document.id)).toMatchObject({ deletedAt: null, extractedText: "conteúdo sensível" });
    });

    it("documento com expiresAt um milissegundo antes de now é removido", async () => {
      const document = await createDocument({ expiresAt: new Date(NOW.getTime() - 1) });
      await runDailyMaintenance(NOW, { storage: storage() });
      expect(await documentRow(document.id)).toBeUndefined();
    });

    it("documento sem validade nunca é alcançado pela expiração", async () => {
      const document = await createDocument({ expiresAt: null });
      await runDailyMaintenance(NOW, { storage: storage() });
      expect(await documentRow(document.id)).toMatchObject({ deletedAt: null });
    });
  });

  describe("falha de storage na expiração (DOCLIFE-01 AC5)", () => {
    it("deixa o documento tombstone, sem texto, contado como pendência", async () => {
      const document = await createDocument({ expiresAt: NOW });
      const failing = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) });

      const result = await runDailyMaintenance(NOW, { storage: failing });

      expect(result.pendingByTenant[TENANT_A]).toBe(1);
      expect(result.deletedByTenant[TENANT_A]).toBeUndefined();
      expect(await documentRow(document.id)).toMatchObject({
        deletedAt: NOW,
        extractedText: null,
        deletionAttempts: 1,
        deletionLastErrorCode: "STORAGE_TRANSIENT_FAILURE",
      });
    });

    it("não impede a purga de recusas de integração no mesmo ciclo", async () => {
      await createDocument({ expiresAt: NOW });
      const failing = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) });

      const result = await runDailyMaintenance(NOW, { storage: failing });

      expect(result.refusalsPurgeFailed).toBe(false);
      expect(mockedPurge).toHaveBeenCalledTimes(1);
    });
  });

  describe("independência entre grupos", () => {
    it("falha do grupo de expiração não impede intents nem purga de recusas", async () => {
      mockedExpireDue.mockRejectedValueOnce(new Error("falha simulada de expiração"));
      const intent = await createIntent();

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.expiryFailed).toBe(true);
      expect(result.total).toBe(0);
      expect(result.intentsExpired).toBe(1);
      expect(result.refusalsPurgeFailed).toBe(false);
      expect(await intentRow(intent.id)).toMatchObject({ state: "failed" });
    });

    it("falha do retry de tombstones não impede expiração, intents nem purga", async () => {
      mockedListTombstones.mockRejectedValueOnce(new Error("falha simulada de retry"));
      const document = await createDocument({ expiresAt: NOW });
      await createIntent();

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.tombstoneRetryFailed).toBe(true);
      expect(result.tombstonesRemoved).toBe(0);
      expect(result.deletedByTenant[TENANT_A]).toBe(1);
      expect(result.intentsExpired).toBe(1);
      expect(result.refusalsPurgeFailed).toBe(false);
      expect(await documentRow(document.id)).toBeUndefined();
    });

    it("falha do grupo de intents não impede expiração nem purga de recusas", async () => {
      mockedExpireIntents.mockRejectedValueOnce(new Error("falha simulada de intents"));
      const document = await createDocument({ expiresAt: NOW });

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.intentCleanupFailed).toBe(true);
      expect(result.intentsExpired).toBe(0);
      expect(result.deletedByTenant[TENANT_A]).toBe(1);
      expect(result.refusalsPurgeFailed).toBe(false);
      expect(await documentRow(document.id)).toBeUndefined();
    });

    it("falha da purga de recusas não impede expiração nem compensação de intents", async () => {
      mockedPurge.mockRejectedValueOnce(new Error("falha simulada de purga"));
      const document = await createDocument({ expiresAt: NOW });
      const intent = await createIntent();

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.refusalsPurgeFailed).toBe(true);
      expect(result.refusalsDeleted).toBe(0);
      expect(result.deletedByTenant[TENANT_A]).toBe(1);
      expect(result.intentsExpired).toBe(1);
      expect(await documentRow(document.id)).toBeUndefined();
      expect(await intentRow(intent.id)).toMatchObject({ state: "failed" });
    });

    it("os quatro grupos falhando juntos devolvem resultado sanitizado, sem exceção", async () => {
      mockedExpireDue.mockRejectedValueOnce(new Error("provider://token-secreto"));
      mockedListTombstones.mockRejectedValueOnce(new Error("provider://token-secreto"));
      mockedExpireIntents.mockRejectedValueOnce(new Error("provider://token-secreto"));
      mockedPurge.mockRejectedValueOnce(new Error("provider://token-secreto"));

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result).toMatchObject({
        expiryFailed: true,
        tombstoneRetryFailed: true,
        intentCleanupFailed: true,
        refusalsPurgeFailed: true,
        total: 0,
        intentsExpired: 0,
        refusalsDeleted: 0,
      });
      expect(JSON.stringify(result)).not.toContain("token-secreto");
    });
  });

  describe("intenções de upload vencidas (DOCBIN-01)", () => {
    it("intenção vencida vira failed e o objeto órfão sai do storage", async () => {
      const intent = await createIntent();
      const store = storage();

      const result = await runDailyMaintenance(NOW, { storage: store });

      expect(result.intentsExpired).toBe(1);
      expect(result.intentObjectsRemoved).toBe(1);
      expect(store.delete).toHaveBeenCalledWith(intent.storageKey);
      expect(await intentRow(intent.id)).toMatchObject({ state: "failed" });
    });

    it("intenção ainda dentro do prazo não é tocada", async () => {
      const intent = await createIntent({ expiresAtIntent: new Date(NOW.getTime() + 60_000) });
      const store = storage();

      const result = await runDailyMaintenance(NOW, { storage: store });

      expect(result.intentsExpired).toBe(0);
      expect(store.delete).not.toHaveBeenCalledWith(intent.storageKey);
      expect(await intentRow(intent.id)).toMatchObject({ state: "pending" });
    });

    it("intenção já committed não é reaberta pela compensação", async () => {
      const intent = await createIntent({ state: "committed" });
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result.intentsExpired).toBe(0);
      expect(await intentRow(intent.id)).toMatchObject({ state: "committed" });
    });

    it("objeto órfão ausente conta como compensado, sem pendência", async () => {
      await createIntent();
      const absent = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("absent"); }) });

      const result = await runDailyMaintenance(NOW, { storage: absent });

      expect(result.intentsExpired).toBe(1);
      expect(result.intentObjectsRemoved).toBe(1);
    });

    it("falha transitória do objeto órfão não conta como compensada nem derruba o grupo", async () => {
      const intent = await createIntent();
      const failing = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) });

      const result = await runDailyMaintenance(NOW, { storage: failing });

      expect(result.intentsExpired).toBe(1);
      expect(result.intentObjectsRemoved).toBe(0);
      expect(result.intentCleanupFailed).toBe(false);
      expect(await intentRow(intent.id)).toMatchObject({ state: "failed" });
    });
  });

  describe("retry de tombstones pendentes (DOCLIFE-01 AC10)", () => {
    it("tombstone que sobrou de uma execução anterior é concluído", async () => {
      const document = await createDocument({ expiresAt: NOW });
      const failing = storage({ delete: vi.fn(async () => { throw new DocumentStorageError("transient"); }) });
      await runDailyMaintenance(NOW, { storage: failing });
      expect(await documentRow(document.id)).toMatchObject({ deletedAt: NOW });

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.tombstonesRemoved).toBeGreaterThanOrEqual(1);
      expect(await documentRow(document.id)).toBeUndefined();
    });

    it("documento expirado nesta execução não é contado também como retry", async () => {
      await createDocument({ expiresAt: NOW });

      const result = await runDailyMaintenance(NOW, { storage: storage() });

      expect(result.deletedByTenant[TENANT_A]).toBe(1);
      expect(result.tombstonesRemoved).toBe(0);
    });
  });

  it("expiração de um tenant não afeta documentos nem contagens de outro (DOCLIFE-01 AC11)", async () => {
    const expiredA = await createDocument({ expiresAt: NOW });
    const activeB = await createDocument({ expiresAt: new Date(NOW.getTime() + 60_000) }, TENANT_B);

    const result = await runDailyMaintenance(NOW, { storage: storage() });

    expect(result.deletedByTenant[TENANT_A]).toBe(1);
    expect(result.deletedByTenant[TENANT_B]).toBeUndefined();
    expect(await documentRow(expiredA.id)).toBeUndefined();
    expect(await documentRow(activeB.id)).toMatchObject({ deletedAt: null, extractedText: "conteúdo sensível" });
  });
});
