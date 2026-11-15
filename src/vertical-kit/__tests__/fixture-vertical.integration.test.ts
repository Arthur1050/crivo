import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { classifyFile, type BoundaryRule } from "../../../scripts/boundary/check";
import map from "../../../scripts/boundary/map.json";
import { db } from "../../db";
import {
  conversations, documentUploadIntents, leads, messages, tenant_members, tenants, users,
} from "../../db/schema";
import { createAccess } from "../../lib/access";
import { PROBLEM_CODE, ROLE, SENDER } from "../../lib/vocabulary";
import { authorizeOrThrow } from "../../server/auth/session";
import { createMembership, getMembership, serviceScope } from "../../server/data";
import { DEFAULT_DOCUMENT_SEGMENT } from "../../server/documents/segments";
import { createDocumentUploadIntake, type CreateDocumentUploadInput } from "../../server/documents/uploads";
import { deliverLead, serializeLead } from "../../server/integration/leads";
import { optOutLead } from "../../server/integration/lgpd";
import { ingestMessage } from "../../server/integration/messages";
import { createProblemResponses } from "../../server/integration/problem";
import { testVertical } from "./fixture-vertical";
import { sourceGraph } from "./source-graph";

const tenantId = randomUUID();
const user = { id: randomUUID(), name: "Pessoa Acme", email: `${tenantId}@fixture.test` };
const leadScope = serviceScope(tenantId);
const access = createAccess(testVertical);

beforeAll(async () => {
  await db.insert(tenants).values({
    id: tenantId, slug: `fixture-${tenantId}`, name: "Acme", agentName: "Agente de teste",
    supportedSegment: DEFAULT_DOCUMENT_SEGMENT,
  });
  await db.insert(users).values(user);
});

afterAll(async () => {
  try {
    await db.delete(documentUploadIntents).where(eq(documentUploadIntents.tenantId, tenantId));
    await db.delete(messages).where(eq(messages.tenantId, tenantId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  } finally {
    await db.$client.end();
  }
});

it("grava lead, conversa e mensagem e registra o opt-out no mesmo lead", async () => {
  const firstContactAt = new Date("2026-08-03T14:00:00Z");
  const input = {
    name: "Pessoa interessada", phone: "+5534990001234", externalId: randomUUID(), firstContactAt,
  };
  const { created, lead } = await deliverLead(tenantId, input);
  expect(created).toBe(true);
  const [storedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
  expect(storedLead).toMatchObject({ ...input, tenantId, appointmentAt: null, optedOutAt: null });
  expect(serializeLead(storedLead, testVertical.qualification)).not.toHaveProperty("qualification");

  const message = {
    externalId: randomUUID(),
    sender: SENDER.lead,
    content: "Quero saber mais.",
    sentAt: new Date("2026-08-03T14:02:00Z"),
  };
  const ingested = await ingestMessage(tenantId, lead.id, message);
  expect(ingested).toMatchObject({ ok: true, created: true });
  if (!ingested.ok) throw new Error(ingested.code);

  const [storedMessage] = await db.select().from(messages).where(eq(messages.id, ingested.message.id));
  expect(storedMessage).toMatchObject({ ...message, tenantId });
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, storedMessage.conversationId));
  expect(conversation).toMatchObject({ tenantId, leadId: lead.id });

  const optedOutAt = new Date("2026-08-03T14:10:00Z");
  expect(await optOutLead(tenantId, lead.id, { now: () => optedOutAt })).toEqual({ optedOutAt });
  const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
  expect(updatedLead.optedOutAt).toEqual(optedOutAt);
});

it("autoriza o papel gravado pela matriz de Acme", async () => {
  const membershipId = await createMembership({ tenantId, userId: user.id, roles: [ROLE.attendant] });
  const [row] = await db.select().from(tenant_members).where(eq(tenant_members.id, membershipId));
  expect(row).toMatchObject({ organizationId: tenantId, userId: user.id, role: ROLE.attendant });
  const membership = await getMembership(tenantId, user.id);
  expect(membership?.roles).toEqual([ROLE.attendant]);
  const actor = { tenantId, user, leadScope, roles: membership!.roles };
  expect(authorizeOrThrow(actor, "documents", "read", access)).toBe(actor);
  expect(access.can(actor.roles, "documents", "write")).toBe(false);
});

it.each([
  { name: "Sem segmento.txt", segmentFields: {} },
  { name: "Segmento nulo.txt", segmentFields: { segment: null } },
  { name: "Segmento inválido.txt", segmentFields: { segment: "inválido" } },
])("grava a reserva de upload sem faceta para $name", async ({ name, segmentFields }) => {
  const actor = { tenantId, user, leadScope, roles: [ROLE.admin] };
  const intake = createDocumentUploadIntake({ facet: testVertical.documentSegments }, vi.fn());
  const clientSha256 = createHash("sha256").update(name).digest("hex");
  const result = await intake.reserve({
    name, mimeType: "text/plain", sizeBytes: 32, clientSha256, ...segmentFields,
  } as CreateDocumentUploadInput, authorizeOrThrow(actor, "documents", "write", access));
  expect(result.kind).toBe("reserved");
  if (result.kind !== "reserved") throw new Error(result.kind);
  const [intent] = await db.select().from(documentUploadIntents).where(eq(documentUploadIntents.id, result.intentId));
  expect(intent).toMatchObject({
    tenantId, requestedByUserId: user.id, name, clientSha256, segment: DEFAULT_DOCUMENT_SEGMENT,
  });
});

it("gera o tipo de problema com a marca de Acme", async () => {
  const response = createProblemResponses(testVertical.brand).problem(404, PROBLEM_CODE.not_found);
  expect(await response.json()).toMatchObject({ type: "urn:acme:problem:recurso-nao-encontrado" });
});

it("mantém as peças no grafo de imports sem alcançar nenhum arquivo de camada vertical", () => {
  const { sources } = sourceGraph("src/vertical-kit/__tests__/fixture-vertical.integration.test.ts");
  expect(Object.keys(sources)).toEqual(expect.arrayContaining([
    "src/db/schema.ts", "src/lib/access.ts", "src/server/documents/uploads.ts",
    "src/server/integration/leads.ts", "src/server/integration/lgpd.ts", "src/server/integration/messages.ts",
  ]));
  // A camada vem do mapa da fronteira, não da pasta: inclui `n8n/verticals/` e os arquivos avulsos do vertical.
  expect(Object.keys(sources).filter(file => classifyFile(file, map as BoundaryRule[])?.layer === "vertical")).toEqual([]);
});
