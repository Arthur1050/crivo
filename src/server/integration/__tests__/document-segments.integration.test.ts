import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { documents, tenantDocumentContextLimits, tenants } from "../../../db/schema";
import { DOCUMENT_STATUS, ROLE } from "../../../lib/vocabulary";
import type { AuthContext } from "../../auth/session";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";
import { realEstate } from "../../../verticals/real-estate";
import { buildCanonicalContext, measureCanonicalContext } from "../../documents/context-budget";
import * as repository from "../../documents/repository";
import { DEFAULT_DOCUMENT_SEGMENT } from "../../documents/segments";
import { createDocumentUploadIntake, type CreateDocumentUploadInput } from "../../documents/uploads";
import { getDirectDocumentContext } from "../context";
import { parseContextQuery } from "../parsers";

const tenantId = randomUUID();
const foreignTenant = randomUUID();
const tenantIds = [tenantId, foreignTenant];
const uploadedAt = new Date("2026-08-01T12:00:00Z");
const facet = testVertical.documentSegments;
const rows = [
  { id: randomUUID(), tenantId, name: "Política nova", segment: "novo", content: "Texto curto." },
  { id: randomUUID(), tenantId, name: "Política usada", segment: "usado", content: "Outro texto." },
  { id: randomUUID(), tenantId, name: "Política extensa", segment: "usado", content: "L".repeat(600) },
  { id: randomUUID(), tenantId: foreignTenant, name: "Política externa", segment: "ambos", content: "Segredo de outro tenant." },
] as const;

beforeAll(async () => {
  await db.insert(tenants).values(tenantIds.map((id) => ({
    id, slug: `segment-${id}`, name: "Fixture", agentName: "Agente", supportedSegment: "ambos" as const,
  })));
  await db.insert(documents).values(rows.map(({ id, tenantId, name, segment, content }) => ({
    id, tenantId, name, segment, mimeType: "text/plain", sizeBytes: BigInt(content.length),
    storageProvider: "test", storageKey: `test/${tenantId}/${id}`, storageEtag: id,
    contentSha256: id.replaceAll("-", "").padEnd(64, "0"), uploadedAt,
    extractedText: content, status: DOCUMENT_STATUS.ready,
  })));
});

afterAll(async () => {
  await db.delete(tenantDocumentContextLimits).where(inArray(tenantDocumentContextLimits.tenantId, tenantIds));
  await db.delete(documents).where(inArray(documents.tenantId, tenantIds));
  await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  await db.$client.end();
});

it("valida modality no fio da imobiliária e usa um único segmento quando a faceta está ausente", () => {
  const question = "Qual política se aplica?";
  for (const input of [{ question }, { question, modality: null }, { question, modality: "inválido" }]) {
    expect(parseContextQuery(input, realEstate.documentSegments)).toMatchObject({ ok: false });
    expect(parseContextQuery(input, facet)).toEqual({ ok: true, dto: { question, segment: DEFAULT_DOCUMENT_SEGMENT } });
  }
  expect(parseContextQuery({ question, modality: "usado" }, realEstate.documentSegments))
    .toEqual({ ok: true, dto: { question, segment: "usado" } });
});

it("aplica a faceta à leitura e usa o mesmo teto único na admissão e na entrega sem faceta", async () => {
  const matches = vi.fn((documentSegment, querySegment) => documentSegment === querySegment);
  const segmented = await getDirectDocumentContext(tenantId, { segment: "novo", question: "Política?" }, uploadedAt, {
    values: ["novo", "usado"], matches,
  });
  expect(matches).toHaveBeenCalledWith("usado", "novo");
  expect(segmented.documents.map(({ id }) => id)).toEqual([rows[0].id]);

  const admitted = rows.slice(0, 2).map((row) => ({ ...row, uploadedAt, status: DOCUMENT_STATUS.ready }));
  const expected = buildCanonicalContext(admitted, DEFAULT_DOCUMENT_SEGMENT, facet);
  const maxResponseBytes = measureCanonicalContext(expected);
  await repository.upsertDocumentContextLimit(tenantId, {
    querySegment: DEFAULT_DOCUMENT_SEGMENT, maxResponseBytes, modelId: "modelo-teste",
    workflowVersion: "workflow-teste", systemMessageHash: "mensagem", toolsHash: "tools",
    memoryWindow: 1, benchmarkedAt: uploadedAt, metrics: {},
  });
  await repository.reconcileTenantDocumentAdmission(tenantId, uploadedAt, facet);
  const actual = await getDirectDocumentContext(tenantId, {
    segment: "usado", question: "Política?", reservedContextBytes: 0,
  }, uploadedAt, facet);
  expect(actual).toEqual(expected);
  expect(actual.documents.map(({ content }) => content).sort()).toEqual(["Outro texto.", "Texto curto."]);
  const [excluded] = await db.select({ status: documents.status }).from(documents).where(eq(documents.id, rows[2].id));
  expect(excluded.status).toBe(DOCUMENT_STATUS.outside_agent);
});

it("encaminha o segmento validado ou o valor fixo à reserva de upload", async () => {
  const actor: AuthContext = {
    tenantId, leadScope: { tenantId, assignedUserId: null }, roles: [ROLE.admin],
    user: { id: randomUUID(), name: "Pessoa de teste", email: "segment@example.test" },
  };
  const createUploadIntent = vi.fn<typeof repository.createUploadIntent>()
    .mockResolvedValue({ kind: "active_duplicate", existingName: "Anterior.txt" });
  const dependencies = { repository: { ...repository, createUploadIntent } };
  const unsegmented = createDocumentUploadIntake({ ...dependencies, facet }, vi.fn());
  const segmented = createDocumentUploadIntake({ ...dependencies, facet: realEstate.documentSegments }, vi.fn());
  const input = { clientSha256: "a".repeat(64), name: "Política.txt", mimeType: "text/plain", sizeBytes: 12 };
  for (const candidate of [input, { ...input, segment: null }, { ...input, segment: "inválido" }]) {
    expect(await segmented.reserve(candidate as CreateDocumentUploadInput, actor)).toEqual({
      kind: "invalid", code: "upload_input_invalid",
    });
    expect(await unsegmented.reserve(candidate as CreateDocumentUploadInput, actor)).toMatchObject({ kind: "duplicate_upload" });
    expect(createUploadIntent).toHaveBeenLastCalledWith(tenantId, expect.objectContaining({
      segment: DEFAULT_DOCUMENT_SEGMENT,
    }), expect.any(Date));
  }
  expect(createUploadIntent).toHaveBeenCalledTimes(3);
  await segmented.reserve({ ...input, segment: "usado" }, actor);
  expect(createUploadIntent).toHaveBeenLastCalledWith(tenantId, expect.objectContaining({ segment: "usado" }), expect.any(Date));
});
