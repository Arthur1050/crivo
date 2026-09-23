import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  documentUploadIntents,
  documents,
  tenants,
  users,
} from "../../../db/schema";
import type { AuthContext } from "../../auth/session";
import * as repository from "../repository";
import type { DocumentStorage } from "../storage";
import {
  createDocumentUploadIntake,
  type CreateDocumentUploadInput,
} from "../uploads";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const NOW = new Date("2030-01-10T12:00:00.000Z");
const encoder = new TextEncoder();

const actorA: AuthContext = {
  user: { id: USER_A, name: "Upload A", email: `upload-a-${USER_A}@example.test` },
  tenantId: TENANT_A,
  roles: ["gestor"],
  leadScope: { tenantId: TENANT_A, assignedUserId: null },
};

const actorB: AuthContext = {
  user: { id: USER_B, name: "Upload B", email: `upload-b-${USER_B}@example.test` },
  tenantId: TENANT_B,
  roles: ["gestor"],
  leadScope: { tenantId: TENANT_B, assignedUserId: null },
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function storageFixture(
  bytes: Uint8Array,
  options: Partial<{ contentType: string; size: number; etag: string; missing: boolean }> = {}
) {
  const contentType = options.contentType ?? "text/plain";
  const size = options.size ?? bytes.byteLength;
  const etag = options.etag ?? `etag-${randomUUID()}`;
  const storage: DocumentStorage = {
    authorizeClientUpload: vi.fn(async (input) => ({
      key: input.key,
      clientToken: "short-lived-test-token",
      expiresAt: input.expiresAt,
      access: "private" as const,
    })),
    head: vi.fn(async (key) =>
      options.missing
        ? null
        : { key, etag, contentType, size }
    ),
    open: vi.fn(async (key) =>
      options.missing
        ? null
        : { key, etag, contentType, size, stream: stream(bytes) }
    ),
    delete: vi.fn(async () => undefined),
  };
  return storage;
}

function inputFor(
  bytes: Uint8Array,
  overrides: Partial<CreateDocumentUploadInput> = {}
): CreateDocumentUploadInput {
  return {
    clientSha256: sha256(bytes),
    name: `arquivo-${randomUUID()}.txt`,
    mimeType: "text/plain",
    sizeBytes: bytes.byteLength,
    modality: "novo",
    ...overrides,
  };
}

function intake(storage: DocumentStorage, overrides: Parameters<typeof createDocumentUploadIntake>[0] = {}) {
  // O padrão real dispara o Workflow; aqui um dublê isola o intake do runtime.
  return createDocumentUploadIntake({
    storage,
    now: () => NOW,
    dispatch: vi.fn(async () => undefined),
    ...overrides,
  });
}

async function documentCount(tenantId: string) {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.tenantId, tenantId));
  return rows.length;
}

describe("document upload intake (lote-12 T8)", () => {
  beforeAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Uploads A", agentName: "A", supportedModality: "ambos", slug: `uploads-a-${TENANT_A}` },
      { id: TENANT_B, name: "Uploads B", agentName: "B", supportedModality: "ambos", slug: `uploads-b-${TENANT_B}` },
    ]);
    await db.insert(users).values([
      actorA.user,
      actorB.user,
    ]);
  });

  afterAll(async () => {
    await db.delete(documentUploadIntents).where(inArray(documentUploadIntents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  it("reserva tenant/hash, cria key opaca e emite token com TTL de uma hora", async () => {
    const bytes = encoder.encode("regra comercial");
    const storage = storageFixture(bytes);
    const result = await intake(storage).begin(inputFor(bytes), actorA);

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("intent was not ready");
    expect(result.grant.access).toBe("private");
    expect(result.grant.expiresAt).toEqual(new Date(NOW.getTime() + 60 * 60 * 1000));
    const [saved] = await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, result.intentId));
    expect(saved).toMatchObject({ tenantId: TENANT_A, requestedByUserId: USER_A, state: "pending" });
    expect(saved.storageKey).not.toContain(inputFor(bytes).name);
  });

  it("recusa corretor antes de criar intent ou pedir token", async () => {
    const bytes = encoder.encode("sem escrita");
    const storage = storageFixture(bytes);
    const before = await documentCount(TENANT_A);

    await expect(
      intake(storage).begin(inputFor(bytes), { ...actorA, roles: ["corretor"] })
    ).rejects.toMatchObject({ name: "PermissionDeniedError" });
    expect(storage.authorizeClientUpload).not.toHaveBeenCalled();
    expect(await documentCount(TENANT_A)).toBe(before);
  });

  it.each([
    ["zero bytes", encoder.encode("x"), { sizeBytes: 0 }],
    ["mais de 10 MiB", encoder.encode("x"), { sizeBytes: 10 * 1024 * 1024 + 1 }],
    ["MIME inválido", encoder.encode("x"), { mimeType: "application/octet-stream" }],
    ["hash malformado", encoder.encode("x"), { clientSha256: "sem-hash" }],
    ["validade já expirada", encoder.encode("x"), { expiresAt: new Date(NOW.getTime() - 1) }],
  ])("recusa %s sem reservar ou gerar token", async (_case, bytes, overrides) => {
    const storage = storageFixture(bytes);
    const result = await intake(storage).begin(inputFor(bytes, overrides), actorA);

    expect(result).toEqual({ kind: "invalid", code: "upload_input_invalid" });
    expect(storage.authorizeClientUpload).not.toHaveBeenCalled();
  });

  it("não emite segundo token para hash ativo no mesmo tenant", async () => {
    const bytes = encoder.encode(`duplicado-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage);

    expect((await service.begin(inputFor(bytes), actorA)).kind).toBe("ready");
    expect(await service.begin(inputFor(bytes), actorA)).toEqual({ kind: "duplicate_upload" });
    expect(storage.authorizeClientUpload).toHaveBeenCalledTimes(1);
  });

  it("permite o mesmo hash em tenant diferente sem expor a reserva original", async () => {
    const bytes = encoder.encode(`isolado-${randomUUID()}`);
    const a = await intake(storageFixture(bytes)).begin(inputFor(bytes), actorA);
    const b = await intake(storageFixture(bytes)).begin(inputFor(bytes), actorB);

    expect(a.kind).toBe("ready");
    expect(b.kind).toBe("ready");
    if (a.kind !== "ready" || b.kind !== "ready") throw new Error("expected both intents");
    expect(a.intentId).not.toBe(b.intentId);
  });

  it.each([
    ["PDF", new Uint8Array([...encoder.encode("%PDF-1.7\ntexto")]), "application/pdf"],
    ["DOCX", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["TXT", encoder.encode("texto puro"), "text/plain"],
    ["Markdown", encoder.encode("# titulo"), "text/markdown"],
    ["CSV", encoder.encode("nome,valor\na,1"), "text/csv"],
  ])("finaliza %s válido em um documento processando", async (_format, bytes, mimeType) => {
    const storage = storageFixture(bytes, { contentType: mimeType });
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes, { mimeType }), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const finished = await service.finalize(started.intentId);

    expect(finished.kind).toBe("committed");
    if (finished.kind !== "committed") throw new Error("document was not committed");
    const [document] = await db.select().from(documents).where(eq(documents.id, finished.documentId));
    expect(document).toMatchObject({ tenantId: TENANT_A, status: "processando", contentSha256: sha256(bytes), mimeType });
  });

  it("callback repetido devolve o mesmo documentId", async () => {
    const bytes = encoder.encode(`idempotente-${randomUUID()}`);
    const service = intake(storageFixture(bytes));
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const first = await service.finalize(started.intentId);
    const second = await service.finalize(started.intentId);

    expect(first).toMatchObject({ kind: "committed" });
    expect(second).toEqual(first);
  });

  it("finalizações concorrentes deixam no máximo um documento", async () => {
    const bytes = encoder.encode(`corrida-${randomUUID()}`);
    const service = intake(storageFixture(bytes));
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const results = await Promise.all([
      service.finalize(started.intentId),
      service.finalize(started.intentId),
    ]);

    const committedIds = results
      .filter(
        (result): result is Extract<typeof result, { kind: "committed" }> =>
          result.kind === "committed"
      )
      .map((result) => result.documentId);
    expect(new Set(committedIds).size).toBe(1);
    const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.contentSha256, sha256(bytes)));
    expect(rows).toHaveLength(1);
  });

  it("commit novo despacha o processamento uma vez com o attempt reservado", async () => {
    const bytes = encoder.encode(`despacho-${randomUUID()}`);
    const dispatch = vi.fn(async () => undefined);
    const service = intake(storageFixture(bytes), { dispatch });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const finished = await service.finalize(started.intentId);

    if (finished.kind !== "committed") throw new Error("document was not committed");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ tenantId: TENANT_A, documentId: finished.documentId, attempt: 1 });
  });

  it("callback repetido e finalização concorrente não criam segundo despacho", async () => {
    const bytes = encoder.encode(`despacho-unico-${randomUUID()}`);
    const dispatch = vi.fn(async () => undefined);
    const service = intake(storageFixture(bytes), { dispatch });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await Promise.all([service.finalize(started.intentId), service.finalize(started.intentId)]);
    await service.finalize(started.intentId);

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("despacho que lança mantém o documento e o objeto confirmados", async () => {
    const bytes = encoder.encode(`despacho-quebrado-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage, { dispatch: vi.fn(async () => { throw new Error("banco fora"); }) });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const finished = await service.finalize(started.intentId);

    expect(finished.kind).toBe("committed");
    if (finished.kind !== "committed") throw new Error("document was not committed");
    expect(storage.delete).not.toHaveBeenCalled();
    const [document] = await db.select().from(documents).where(eq(documents.id, finished.documentId));
    expect(document).toMatchObject({ status: "processando", deletedAt: null });
  });

  it("finalização pelo navegador grava o documento no tenant de quem pediu", async () => {
    const bytes = encoder.encode(`cliente-${randomUUID()}`);
    const dispatch = vi.fn(async () => undefined);
    const service = intake(storageFixture(bytes), { dispatch });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    const finished = await service.finalizeForActor(started.intentId, actorA);

    expect(finished.kind).toBe("committed");
    expect(dispatch).toHaveBeenCalledTimes(1);
    // O callback do provedor chegando depois não cria segundo documento nem run.
    await expect(service.finalize(started.intentId)).resolves.toEqual(finished);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("navegador que chega depois de uma recusa do callback recebe a recusa", async () => {
    const bytes = encoder.encode(`recusado-antes-${randomUUID()}`);
    const storage = storageFixture(bytes, { contentType: "text/csv" });
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    await expect(service.finalizeForActor(started.intentId, actorA)).resolves.toEqual({
      kind: "rejected",
      code: "upload_validation_failed",
    });
  });

  it("finalização pelo navegador de outro tenant responde como inexistente", async () => {
    const bytes = encoder.encode(`cruzado-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalizeForActor(started.intentId, actorB)).resolves.toEqual({ kind: "not_found" });
    expect(storage.head).not.toHaveBeenCalled();
    const [intent] = await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, started.intentId));
    expect(intent.state).toBe("pending");
  });

  it("finalização pelo navegador recusa papel sem escrita", async () => {
    const bytes = encoder.encode(`corretor-final-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(
      service.finalizeForActor(started.intentId, { ...actorA, roles: ["corretor"] })
    ).rejects.toMatchObject({ name: "PermissionDeniedError" });
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("recusa metadata divergente e remove o objeto sem criar documento", async () => {
    const bytes = encoder.encode(`mime-divergente-${randomUUID()}`);
    const storage = storageFixture(bytes, { contentType: "text/csv" });
    const service = intake(storage);
    const before = await documentCount(TENANT_A);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(await documentCount(TENANT_A)).toBe(before);
  });

  it("recusa assinatura PDF inválida e limpa o objeto", async () => {
    const bytes = encoder.encode(`não é pdf-${randomUUID()}`);
    const storage = storageFixture(bytes, { contentType: "application/pdf" });
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes, { mimeType: "application/pdf" }), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it("recusa hash recalculado diferente do hash do cliente", async () => {
    const bytes = encoder.encode(`integridade-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes, { clientSha256: sha256(encoder.encode("outro")) }), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it("recusa tamanho server-side divergente", async () => {
    const bytes = encoder.encode(`tamanho-${randomUUID()}`);
    const storage = storageFixture(bytes, { size: bytes.byteLength + 1 });
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it("recusa objeto ausente e não cria linha visível", async () => {
    const bytes = encoder.encode(`ausente-${randomUUID()}`);
    const storage = storageFixture(bytes, { missing: true });
    const service = intake(storage);
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(await db.select().from(documents).where(eq(documents.storageKey, started.grant.key))).toHaveLength(0);
  });

  it("retorna o documento existente e compensa o objeto de hash duplicado", async () => {
    const bytes = encoder.encode(`conteúdo-existente-${randomUUID()}`);
    const first = intake(storageFixture(bytes));
    const firstIntent = await first.begin(inputFor(bytes), actorA);
    if (firstIntent.kind !== "ready") throw new Error("first intent was not ready");
    const firstResult = await first.finalize(firstIntent.intentId);
    if (firstResult.kind !== "committed") throw new Error("first document was not committed");

    const duplicateStorage = storageFixture(bytes);
    const duplicateDispatch = vi.fn(async () => undefined);
    const duplicate = intake(duplicateStorage, { dispatch: duplicateDispatch });
    const duplicateIntent = await duplicate.begin(inputFor(bytes), actorA);
    if (duplicateIntent.kind !== "ready") throw new Error("duplicate intent was not ready");
    await expect(duplicate.finalize(duplicateIntent.intentId)).resolves.toEqual({
      kind: "duplicate_content",
      documentId: firstResult.documentId,
    });
    expect(duplicateStorage.delete).toHaveBeenCalledTimes(1);
    expect(duplicateDispatch).not.toHaveBeenCalled();
  });

  it("compensa objeto quando o insert no banco falha", async () => {
    const bytes = encoder.encode(`insert-failure-${randomUUID()}`);
    const storage = storageFixture(bytes);
    const service = intake(storage, {
      repository: {
        ...repository,
        commitUploadIntent: async () => {
          throw new Error("insert failed");
        },
      },
    });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toMatchObject({ kind: "rejected" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
    const [intent] = await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, started.intentId));
    expect(intent.state).toBe("failed");
  });

  it("marca compensação pendente quando insert e delete falham", async () => {
    const bytes = encoder.encode(`compensation-${randomUUID()}`);
    const storage = storageFixture(bytes);
    (storage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("storage down"));
    const service = intake(storage, {
      repository: {
        ...repository,
        commitUploadIntent: async () => {
          throw new Error("insert failed");
        },
      },
    });
    const started = await service.begin(inputFor(bytes), actorA);
    if (started.kind !== "ready") throw new Error("intent was not ready");

    await expect(service.finalize(started.intentId)).resolves.toEqual({ kind: "compensation_pending" });
    const [intent] = await db.select().from(documentUploadIntents).where(and(eq(documentUploadIntents.id, started.intentId), eq(documentUploadIntents.state, "failed")));
    expect(intent.storageKey).toBe(started.grant.key);
  });
});
