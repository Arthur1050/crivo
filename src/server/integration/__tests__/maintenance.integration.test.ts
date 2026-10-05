import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, documentUploadIntents, documents, humanMessageSends, leadAgentState, leads, messages, reengagementEpisodes, tenantDocumentContextLimits, tenants, users, whatsappChannels, whatsappMessageReceipts, whatsappUsage } from "../../../db/schema";
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
vi.mock("../../reengagement/retention", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../reengagement/retention")>();
  return { ...actual, purgeReengagementMetadata: vi.fn(actual.purgeReengagementMetadata) };
});

import { purgeIntegrationRefusals } from "../../data";
import {
  expireDueDocuments,
  expireStaleUploadIntents,
  listTombstonedDocuments,
  upsertDocumentContextLimit,
} from "../../documents/repository";
import { runDailyMaintenance } from "../lgpd";
import { purgeReengagementMetadata, REENGAGEMENT_RETENTION_MS } from "../../reengagement/retention";
import { createExpireDocumentsHandler } from "../../../../app/api/cron/expire-documents/route";

const mockedExpireDue = vi.mocked(expireDueDocuments);
const mockedListTombstones = vi.mocked(listTombstonedDocuments);
const mockedExpireIntents = vi.mocked(expireStaleUploadIntents);
const mockedPurge = vi.mocked(purgeIntegrationRefusals);
const mockedReengagementRetention = vi.mocked(purgeReengagementMetadata);

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
  await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, [TENANT_A, TENANT_B]));
}

async function clearOperationalFixtures() {
  const ids = [TENANT_A, TENANT_B];
  await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, ids));
  await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, ids));
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
}

async function createOperationalMetadata() {
  const old = new Date(NOW.getTime() - REENGAGEMENT_RETENTION_MS), phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: TENANT_A, phoneNumberId, configurationRevision: 2, ownershipVerifiedAt: old });
  const [lead] = await db.insert(leads).values({ tenantId: TENANT_A, name: "Fixture T64", phone: "123", status: "em_qualificacao", firstContactAt: old, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: TENANT_A, leadId: lead.id }).returning();
  const [anchor, output] = await db.insert(messages).values([
    { tenantId: TENANT_A, conversationId: conversation.id, sender: "lead" as const, content: "Âncora factual T64", sentAt: old, whatsappPhoneNumberId: phoneNumberId },
    { tenantId: TENANT_A, conversationId: conversation.id, sender: "agente" as const, content: "Mensagem já gravada T64", sentAt: old, externalId: randomUUID(), whatsappPhoneNumberId: phoneNumberId },
  ]).returning();
  const [episode] = await db.insert(reengagementEpisodes).values({ tenantId: TENANT_A, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: old, agentStateRevision: 1,
    state: "accepted", dispatchAuthorizedAt: old, dispatchCompletionDeadline: new Date(old.getTime() + 120000), acceptedAt: old, wamid: output.externalId!, messageId: output.id,
    originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id, submittedText: output.content, createdAt: old, updatedAt: old }).returning();
  const orphanId = randomUUID();
  await db.insert(whatsappMessageReceipts).values([
    { tenantId: TENANT_A, phoneNumberId, wamid: orphanId, firstSeenAt: old, lastSeenAt: old, orphanExpiresAt: NOW },
    { tenantId: TENANT_A, phoneNumberId, wamid: output.externalId!, messageId: output.id, classification: "free_service", firstSeenAt: old, lastSeenAt: old, orphanExpiresAt: null },
  ]);
  await db.insert(whatsappUsage).values([
    { tenantId: TENANT_A, phoneNumberId, monthStart: new Date("2031-02-01T03:00:00Z"), monthEnd: new Date("2031-03-01T03:00:00Z"), accountTimezone: "America/Sao_Paulo", configurationRevision: 2, expiresAt: NOW },
    { tenantId: TENANT_A, phoneNumberId, monthStart: new Date("2031-03-01T03:00:00Z"), monthEnd: new Date("2031-04-01T03:00:00Z"), accountTimezone: "America/Sao_Paulo", configurationRevision: 2, expiresAt: NOW },
  ]);
  return { lead, anchor, output, episode, orphanId, phoneNumberId };
}

async function reserveHuman(leadId: string, createdAt: Date, messageId: string | null = null) {
  return (await db.insert(humanMessageSends).values({ tenantId: TENANT_A, leadId, requestId: randomUUID(), state: messageId ? "enviada" : "enviando", messageId, createdAt, updatedAt: createdAt }).returning())[0];
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
  // DOCLIM-01 AC8: a expiração libera espaço no corpus. Com teto para um
  // documento só, o vencido sai e o `fora_do_agente` que agora cabe volta ao
  // agente — antes a rotina diária não reconciliava e ele ficava de fora.
  it("expiração reconcilia a admissão: o fora_do_agente que passa a caber volta a pronto (DOCLIM-01 AC8)", async () => {
    for (const queryModality of ["novo", "usado", "ambos"] as const) {
      await upsertDocumentContextLimit(TENANT_A, {
        queryModality, maxResponseBytes: 400, modelId: "m", workflowVersion: "v", systemMessageHash: "s",
        toolsHash: "t", memoryWindow: 50, benchmarkedAt: NOW, metrics: {},
      });
    }
    const texto = "x".repeat(150);
    const vencido = await createDocument({ modality: "ambos", extractedText: texto, extractedBytes: 150, expiresAt: NOW });
    const deFora = await createDocument({ modality: "ambos", status: "fora_do_agente", extractedText: texto, extractedBytes: 150 });

    await runDailyMaintenance(NOW, { storage: storage() });

    expect(await documentRow(vencido.id)).toBeUndefined();
    expect(await documentRow(deFora.id)).toMatchObject({ status: "pronto" });
  });

  describe("T64 — L14b usa o cron e os grupos de manutenção existentes", () => {
    const cronSecret = `fixture-cron-${randomUUID()}`;
    let transport: ReturnType<typeof vi.fn<typeof fetch>>;
    const handler = createExpireDocumentsHandler({ storage: storage(), now: () => NOW });
    function request(method: "GET" | "POST", secret?: string) {
      return new Request("http://local/api/cron/expire-documents", { method, headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
    }
    beforeEach(() => {
      vi.stubEnv("CRON_SECRET", cronSecret);
      vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "fixture-t64-server-token");
      transport = vi.fn<typeof fetch>(async () => { throw new Error("Transporte proibido na manutenção"); });
      vi.stubGlobal("fetch", transport);
    });
    afterEach(async () => {
      try { expect(transport).not.toHaveBeenCalled(); }
      finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await clearOperationalFixtures(); }
    });

    it("cron recusa secret ausente/errado sem alcançar retenção ou metadados", async () => {
      const row = await createOperationalMetadata();
      expect((await handler(request("GET"))).status).toBe(401);
      expect((await handler(request("POST", "fixture-secret-incorreto"))).status).toBe(401);
      vi.stubEnv("CRON_SECRET", ""); expect((await handler(request("GET", cronSecret))).status).toBe(401);
      expect(mockedReengagementRetention).not.toHaveBeenCalled();
      expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0]).toEqual(row.episode);
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.orphanId))).toHaveLength(1);
    });

    it("cron autenticado executa a purga real e devolve suas três contagens", async () => {
      const row = await createOperationalMetadata();
      const response = await handler(request("GET", cronSecret)); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ reengagementReceiptsDeleted: 1, reengagementSnapshotsDeleted: 1, reengagementEpisodesCompacted: 1, reengagementPurgeFailed: false,
        expiryFailed: false, tombstoneRetryFailed: false, intentCleanupFailed: false, refusalsPurgeFailed: false, reservationsPurgeFailed: false });
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.orphanId))).toEqual([]);
      expect((await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, row.phoneNumberId))).map((item) => item.monthStart.toISOString())).toEqual(["2031-03-01T03:00:00.000Z"]);
      expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0]).toMatchObject({ submittedText: null, state: "accepted", dispatchAuthorizedAt: row.episode.dispatchAuthorizedAt, dispatchCompletionDeadline: row.episode.dispatchCompletionDeadline });
    });

    it("replay manual pelo mesmo cron retorna zero sem reabrir consumo nem classificação", async () => {
      const row = await createOperationalMetadata();
      await handler(request("GET", cronSecret));
      const before = (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0];
      const replay = await handler(request("POST", cronSecret)); expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ reengagementReceiptsDeleted: 0, reengagementSnapshotsDeleted: 0, reengagementEpisodesCompacted: 0, reengagementPurgeFailed: false });
      expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0]).toEqual(before);
      expect((await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.messageId, row.output.id)))[0]).toMatchObject({ messageId: row.output.id, classification: "free_service" });
    });

    it("falha L14b responde fallback observável e preserva execução dos grupos anteriores", async () => {
      const row = await createOperationalMetadata(), expired = await createDocument({ expiresAt: NOW }), reservation = await reserveHuman(row.lead.id, row.episode.createdAt);
      mockedReengagementRetention.mockRejectedValueOnce(new Error("fixture-provider-detail"));
      const response = await handler(request("GET", cronSecret)); expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ reengagementReceiptsDeleted: 0, reengagementSnapshotsDeleted: 0, reengagementEpisodesCompacted: 0, reengagementPurgeFailed: true,
        expiryFailed: false, tombstoneRetryFailed: false, intentCleanupFailed: false, refusalsPurgeFailed: false, reservationsPurgeFailed: false, reservationsDeleted: 1 });
      expect(result.deletedByTenant[TENANT_A]).toBe(1); expect(await documentRow(expired.id)).toBeUndefined();
      expect(await db.select().from(humanMessageSends).where(eq(humanMessageSends.id, reservation.id))).toEqual([]);
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.orphanId))).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("fixture-provider-detail");
    });

    it("retenção humana mantém mensagem gravada e reserva recente enquanto L14b também roda", async () => {
      const row = await createOperationalMetadata();
      const [humanMessage] = await db.insert(messages).values({ tenantId: TENANT_A, conversationId: row.output.conversationId, sender: "humano", content: "Envio humano já gravado", authorUserId: USER_A, authorName: "Manutenção A", sentAt: row.episode.createdAt, externalId: randomUUID(), whatsappPhoneNumberId: row.phoneNumberId }).returning();
      const oldReservation = await reserveHuman(row.lead.id, row.episode.createdAt, humanMessage.id), recent = await reserveHuman(row.lead.id, new Date(NOW.getTime() - 1));
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result).toMatchObject({ reservationsDeleted: 1, reservationsPurgeFailed: false, reengagementReceiptsDeleted: 1, reengagementPurgeFailed: false });
      expect(await db.select().from(humanMessageSends).where(eq(humanMessageSends.id, oldReservation.id))).toEqual([]);
      expect((await db.select().from(humanMessageSends).where(eq(humanMessageSends.id, recent.id)))[0]).toEqual(recent);
      expect((await db.select().from(messages).where(eq(messages.id, humanMessage.id)))[0]).toEqual(humanMessage);
    });

    it("documentos/intents continuam sua manutenção mesmo com grupos anteriores falhando", async () => {
      const row = await createOperationalMetadata(), expired = await createDocument({ expiresAt: NOW }), retained = await createDocument({ expiresAt: new Date(NOW.getTime() + 1) }, TENANT_B), intent = await createIntent();
      mockedPurge.mockRejectedValueOnce(new Error("fixture-refusals-failure"));
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result).toMatchObject({ reengagementReceiptsDeleted: 1, reengagementPurgeFailed: false, refusalsDeleted: 0, refusalsPurgeFailed: true, intentsExpired: 1, intentObjectsRemoved: 1 });
      expect(result.deletedByTenant[TENANT_A]).toBe(1); expect(result.deletedByTenant[TENANT_B]).toBeUndefined();
      expect(await documentRow(expired.id)).toBeUndefined(); expect(await documentRow(retained.id)).toEqual(retained);
      expect(await intentRow(intent.id)).toMatchObject({ state: "failed" });
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.orphanId))).toEqual([]);
    });

    it("manutenção não despacha episódio nem consulta Graph mesmo com canal habilitado", async () => {
      const row = await createOperationalMetadata();
      await db.update(whatsappChannels).set({ usageEnabled: true, accountKind: "production", analyticsVerifiedAt: NOW, accountTimezone: "America/Sao_Paulo", analyticsPhoneNumber: "5534900000000", wabaId: "9900000064" }).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId));
      await db.update(reengagementEpisodes).set({ state: "authorized", acceptedAt: null, wamid: null, messageId: null, dispatchAuthorizedAt: NOW, dispatchCompletionDeadline: new Date(NOW.getTime() + 120000), createdAt: NOW, updatedAt: NOW }).where(eq(reengagementEpisodes.id, row.episode.id));
      const before = (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0];
      const result = await runDailyMaintenance(NOW, { storage: storage() });
      expect(result).toMatchObject({ reengagementReceiptsDeleted: 1, reengagementSnapshotsDeleted: 1, reengagementEpisodesCompacted: 0, reengagementPurgeFailed: false });
      expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0]).toEqual(before);
      expect((await db.select().from(messages).where(eq(messages.id, row.output.id)))[0]).toEqual(row.output);
      expect(transport).not.toHaveBeenCalled();
    });
  });
});
