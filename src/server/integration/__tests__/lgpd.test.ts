import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { documents, leads, tenants } from "../../../db/schema";
import { getLead, serviceScope } from "../../data";
import type { DocumentStorage } from "../../documents/storage";
import { expireDocuments, optOutLead } from "../lgpd";

const NON_EXISTENT_LEAD_ID = "00000000-0000-4000-8000-000000000789";

// Desde o lote-12 a expiração remove o original antes de apagar a linha. As
// fixtures usam chaves `test/...` que nenhum provedor conhece, então o stub
// confirma ausência e a remoção física conclui como antes.
const absentStorage: DocumentStorage = {
  authorizeClientUpload: async () => { throw new Error("upload não faz parte da expiração"); },
  delete: async () => undefined,
  head: async () => null,
  open: async () => null,
};

// Tenants + dados PRÓPRIOS deste arquivo (nunca o snapshot do seed) — mesmo
// padrão de isolamento dos demais testes de integração do lote-5.
describe("server/integration lgpd — optOutLead + expireDocuments", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A lgpd ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
        slug: `fixture-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B lgpd ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: `fixture-${tenantBId}`,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(documents).where(eq(documents.tenantId, tenantAId));
    await db.delete(documents).where(eq(documents.tenantId, tenantBId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  async function createLead(tenantId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Teste lgpd",
      phone: "+55 34 90000-0000",
      status: "em_qualificacao",
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    return id;
  }

  describe("optOutLead", () => {
    it("primeira chamada registra o timestamp de opt-out (LGPD-01 AC2)", async () => {
      const leadId = await createLead(tenantAId);
      const result = await optOutLead(tenantAId, leadId);
      expect(result).not.toBeNull();
      expect(result!.optedOutAt).toBeInstanceOf(Date);

      const persisted = await getLead(serviceScope(tenantAId), leadId);
      expect(persisted!.optedOutAt).toEqual(result!.optedOutAt);
    });

    it("chamar duas vezes preserva o timestamp original — idempotente (LGPD-01 AC2)", async () => {
      const leadId = await createLead(tenantAId);
      const first = await optOutLead(tenantAId, leadId);
      // Espera 1s de relógio real garantiria diferença detectável se não
      // fosse idempotente; em vez disso, comparamos o valor persistido.
      const second = await optOutLead(tenantAId, leadId);

      expect(second!.optedOutAt.getTime()).toBe(first!.optedOutAt.getTime());
    });

    it("lead inexistente no tenant retorna null (404 na rota)", async () => {
      const result = await optOutLead(tenantAId, NON_EXISTENT_LEAD_ID);
      expect(result).toBeNull();
    });

    it("lead de outro tenant retorna null, nunca opera cross-tenant (INT-01 AC3)", async () => {
      const leadOfB = await createLead(tenantBId);
      const result = await optOutLead(tenantAId, leadOfB);
      expect(result).toBeNull();

      const untouched = await getLead(serviceScope(tenantBId), leadOfB);
      expect(untouched!.optedOutAt).toBeNull();
    });
  });

  describe("expireDocuments", () => {
    it("deleta só documentos com expiresAt <= now e reporta a contagem por tenant (LGPD-02 AC1)", async () => {
      const now = new Date("2026-08-03T12:00:00.000Z");
      const expiredAId = randomUUID();
      const expiredA2Id = randomUUID();
      const futureAId = randomUUID();
      const expiredBId = randomUUID();
      const noExpiryId = randomUUID();

      await db.insert(documents).values([
        {
          id: expiredAId,
          tenantId: tenantAId,
          name: "Expirado A1.pdf",
          modality: "novo",
          mimeType: "application/pdf",
          sizeBytes: BigInt(100),
          storageProvider: "test",
          storageKey: `test/${tenantAId}/${expiredAId}`,
          storageEtag: `test-etag-${expiredAId}`,
          contentSha256: `${expiredAId.replaceAll("-", "")}${expiredAId.replaceAll("-", "")}`,
          status: "pronto",
          expiresAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        {
          id: expiredA2Id,
          tenantId: tenantAId,
          name: "Expirado A2.pdf",
          modality: "novo",
          mimeType: "application/pdf",
          sizeBytes: BigInt(100),
          storageProvider: "test",
          storageKey: `test/${tenantAId}/${expiredA2Id}`,
          storageEtag: `test-etag-${expiredA2Id}`,
          contentSha256: `${expiredA2Id.replaceAll("-", "")}${expiredA2Id.replaceAll("-", "")}`,
          status: "pronto",
          // Exatamente no limite — expiresAt <= now inclui igualdade.
          expiresAt: now,
        },
        {
          id: futureAId,
          tenantId: tenantAId,
          name: "Futuro A.pdf",
          modality: "novo",
          mimeType: "application/pdf",
          sizeBytes: BigInt(100),
          storageProvider: "test",
          storageKey: `test/${tenantAId}/${futureAId}`,
          storageEtag: `test-etag-${futureAId}`,
          contentSha256: `${futureAId.replaceAll("-", "")}${futureAId.replaceAll("-", "")}`,
          status: "pronto",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        },
        {
          id: expiredBId,
          tenantId: tenantBId,
          name: "Expirado B.pdf",
          modality: "novo",
          mimeType: "application/pdf",
          sizeBytes: BigInt(100),
          storageProvider: "test",
          storageKey: `test/${tenantBId}/${expiredBId}`,
          storageEtag: `test-etag-${expiredBId}`,
          contentSha256: `${expiredBId.replaceAll("-", "")}${expiredBId.replaceAll("-", "")}`,
          status: "pronto",
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        },
        {
          id: noExpiryId,
          tenantId: tenantAId,
          name: "Sem validade.pdf",
          modality: "novo",
          mimeType: "application/pdf",
          sizeBytes: BigInt(100),
          storageProvider: "test",
          storageKey: `test/${tenantAId}/${noExpiryId}`,
          storageEtag: `test-etag-${noExpiryId}`,
          contentSha256: `${noExpiryId.replaceAll("-", "")}${noExpiryId.replaceAll("-", "")}`,
          status: "pronto",
          expiresAt: null,
        },
      ]);

      const result = await expireDocuments(now, { storage: absentStorage });

      expect(result.deletedByTenant[tenantAId]).toBe(2);
      expect(result.deletedByTenant[tenantBId]).toBe(1);
      expect(result.total).toBeGreaterThanOrEqual(3);

      const remaining = await db
        .select()
        .from(documents)
        .where(eq(documents.tenantId, tenantAId));
      const remainingIds = remaining.map((d) => d.id);
      expect(remainingIds).toContain(futureAId);
      expect(remainingIds).toContain(noExpiryId);
      expect(remainingIds).not.toContain(expiredAId);
      expect(remainingIds).not.toContain(expiredA2Id);

      const remainingB = await db
        .select()
        .from(documents)
        .where(eq(documents.tenantId, tenantBId));
      expect(remainingB.map((d) => d.id)).not.toContain(expiredBId);
    });
  });
});
