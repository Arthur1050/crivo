import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import {
  createDocument,
  createDocumentCategory,
  deleteDocument,
  deleteDocumentCategory,
  getDocumentCategories,
  getDocuments,
  getLead,
  getLeads,
  getTenant,
  getTenants,
  updateDocument,
  updateDocumentCategory,
  updateLeadStatus,
  updateTenantSettings,
} from "../index";

const NON_EXISTENT_ID = "00000000-0000-4000-8000-000000000099";

// Assume o banco já está seedado (mesmo padrão de isolation.test.ts /
// documents.test.ts). Cada teste cria e limpa os próprios registros, sem
// depender de ordem de execução nem de estado deixado por outros testes.
describe("server/data mutations", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    // lote-7 — REAL-01: só o tenant `crivo-demo` recebe lead fictício no
    // seed a partir daqui; os dois pilotos nascem sem nenhum. `updateLeadStatus`
    // precisa de um lead existente no tenant A, então A é resolvido pelo slug
    // em vez de "os dois primeiros tenants" (ordem antes arbitrária, agora
    // garantidamente errada para 2 dos 3 tenants).
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(2);
    const demo = allTenants.find((t) => t.slug === "crivo-demo");
    const other = allTenants.find((t) => t.id !== demo?.id);
    expect(demo, "tenant Crivo Demo deveria existir (seed lote-7)").toBeDefined();
    expect(other).toBeDefined();
    tenantAId = demo!.id;
    tenantBId = other!.id;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("updateTenantSettings", () => {
    it("atualiza name/agentName/supportedModality (happy path) e reverte ao original", async () => {
      const original = await getTenant(tenantAId);
      expect(original).not.toBeNull();

      const updated = await updateTenantSettings(tenantAId, {
        name: "Nome Temporário de Teste",
        agentName: "Agente Temporário",
        supportedModality: "novo",
      });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Nome Temporário de Teste");
      expect(updated!.agentName).toBe("Agente Temporário");
      expect(updated!.supportedModality).toBe("novo");

      // Reverte para não afetar o seed usado por outros testes/batches.
      const reverted = await updateTenantSettings(tenantAId, {
        name: original!.name,
        agentName: original!.agentName,
        supportedModality: original!.supportedModality,
      });
      expect(reverted!.name).toBe(original!.name);
      expect(reverted!.agentName).toBe(original!.agentName);
      expect(reverted!.supportedModality).toBe(original!.supportedModality);
    });

    it("retorna null para um tenant inexistente (not-found), sem lançar erro", async () => {
      const result = await updateTenantSettings(NON_EXISTENT_ID, {
        name: "X",
        agentName: "Y",
        supportedModality: "ambos",
      });
      expect(result).toBeNull();
    });
  });

  describe("updateLeadStatus", () => {
    it("persiste o novo status e avança updatedAt (happy path) — reverte ao final", async () => {
      const [lead] = await getLeads(tenantAId);
      expect(lead).toBeDefined();

      const originalStatus = lead.status;
      const originalUpdatedAt = lead.updatedAt;
      const nextStatus =
        originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano";

      // Garante uma diferença de relógio mensurável entre o updatedAt
      // original (do seed) e o novo, mesmo em execuções muito rápidas.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await updateLeadStatus(tenantAId, lead.id, nextStatus);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(nextStatus);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );

      const reread = await getLead(tenantAId, lead.id);
      expect(reread!.status).toBe(nextStatus);

      // Reverte para não afetar o seed usado por outros testes/batches.
      const reverted = await updateLeadStatus(tenantAId, lead.id, originalStatus);
      expect(reverted!.status).toBe(originalStatus);
    });

    it("retorna null (no-op) para um leadId inexistente", async () => {
      const result = await updateLeadStatus(
        tenantAId,
        NON_EXISTENT_ID,
        "qualificado_agendado"
      );
      expect(result).toBeNull();
    });

    it("retorna null (no-op) e não altera o lead quando o tenantId não corresponde (isolamento cross-tenant)", async () => {
      const [leadA] = await getLeads(tenantAId);
      expect(leadA).toBeDefined();
      const originalStatus = leadA.status;

      const result = await updateLeadStatus(
        tenantBId,
        leadA.id,
        originalStatus === "escalado_humano" ? "em_qualificacao" : "escalado_humano"
      );
      expect(result).toBeNull();

      const unchanged = await getLead(tenantAId, leadA.id);
      expect(unchanged!.status).toBe(originalStatus);
    });
  });

  describe("createDocument / updateDocument / deleteDocument", () => {
    it("cria um documento para o tenant informado (happy path)", async () => {
      const name = `Doc Teste ${randomUUID()}.pdf`;
      const doc = await createDocument(tenantAId, {
        name,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
      });
      expect(doc.tenantId).toBe(tenantAId);
      expect(doc.name).toBe(name);
      expect(doc.categoryId).toBeNull();

      await deleteDocument(tenantAId, doc.id);
    });

    it("atualiza nome/modalidade/categoria de um documento existente (happy path)", async () => {
      const categoryResult = await createDocumentCategory(
        tenantAId,
        `Categoria Teste ${randomUUID()}`
      );
      expect(categoryResult.ok).toBe(true);
      if (!categoryResult.ok) return;

      const doc = await createDocument(tenantAId, {
        name: `Doc Original ${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        modality: "usado",
      });

      const updated = await updateDocument(tenantAId, doc.id, {
        name: "Doc Atualizado.pdf",
        modality: "ambos",
        categoryId: categoryResult.category.id,
      });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Doc Atualizado.pdf");
      expect(updated!.modality).toBe("ambos");
      expect(updated!.categoryId).toBe(categoryResult.category.id);

      await deleteDocument(tenantAId, doc.id);
      await deleteDocumentCategory(tenantAId, categoryResult.category.id);
    });

    it("updateDocument retorna null (not-found) para um documento inexistente", async () => {
      const result = await updateDocument(tenantAId, NON_EXISTENT_ID, {
        name: "X",
        modality: "novo",
      });
      expect(result).toBeNull();
    });

    it("updateDocument com tenantId incompatível é no-op — não altera o documento e retorna null", async () => {
      const originalName = `Doc Isolamento ${randomUUID()}.pdf`;
      const doc = await createDocument(tenantAId, {
        name: originalName,
        mimeType: "application/pdf",
        sizeBytes: 512,
        modality: "novo",
      });

      const result = await updateDocument(tenantBId, doc.id, {
        name: "Nome Malicioso.pdf",
        modality: "usado",
      });
      expect(result).toBeNull();

      const [unchanged] = await getDocuments(tenantAId, {
        search: originalName,
      });
      expect(unchanged).toBeDefined();
      expect(unchanged.name).toBe(originalName);
      expect(unchanged.modality).toBe("novo");

      await deleteDocument(tenantAId, doc.id);
    });

    it("deleteDocument com tenantId incompatível é no-op — retorna false e o documento continua existindo", async () => {
      const name = `Doc Delete Isolamento ${randomUUID()}.pdf`;
      const doc = await createDocument(tenantAId, {
        name,
        mimeType: "application/pdf",
        sizeBytes: 512,
        modality: "novo",
      });

      const result = await deleteDocument(tenantBId, doc.id);
      expect(result).toBe(false);

      const stillThere = await getDocuments(tenantAId, { search: name });
      expect(stillThere).toHaveLength(1);

      await deleteDocument(tenantAId, doc.id);
    });

    it("deleteDocument retorna true no happy path e o documento deixa de existir", async () => {
      const name = `Doc Delete ${randomUUID()}.pdf`;
      const doc = await createDocument(tenantAId, {
        name,
        mimeType: "application/pdf",
        sizeBytes: 512,
        modality: "novo",
      });

      const result = await deleteDocument(tenantAId, doc.id);
      expect(result).toBe(true);

      const gone = await getDocuments(tenantAId, { search: name });
      expect(gone).toHaveLength(0);
    });
  });

  describe("createDocumentCategory / deleteDocumentCategory", () => {
    it("cria uma categoria (happy path)", async () => {
      const name = `Categoria ${randomUUID()}`;
      const result = await createDocumentCategory(tenantAId, name);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.category.tenantId).toBe(tenantAId);
        expect(result.category.name).toBe(name);
        await deleteDocumentCategory(tenantAId, result.category.id);
      }
    });

    it("nome duplicado no mesmo tenant retorna erro de domínio (não lança exceção)", async () => {
      const name = `Categoria Duplicada ${randomUUID()}`;
      const first = await createDocumentCategory(tenantAId, name);
      expect(first.ok).toBe(true);

      const second = await createDocumentCategory(tenantAId, name);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error).toBeTruthy();
      }

      if (first.ok) await deleteDocumentCategory(tenantAId, first.category.id);
    });

    it("nome duplicado no mesmo tenant é rejeitado mesmo com capitalização diferente (case-insensitive)", async () => {
      const name = `Categoria Case ${randomUUID()}`;
      const first = await createDocumentCategory(tenantAId, name);
      expect(first.ok).toBe(true);

      const second = await createDocumentCategory(tenantAId, name.toUpperCase());
      expect(second.ok).toBe(false);

      if (first.ok) await deleteDocumentCategory(tenantAId, first.category.id);
    });

    it("mesmo nome em tenants diferentes é permitido (unicidade escopada por tenant)", async () => {
      const name = `Categoria Cross-Tenant ${randomUUID()}`;
      const first = await createDocumentCategory(tenantAId, name);
      const second = await createDocumentCategory(tenantBId, name);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      if (first.ok) await deleteDocumentCategory(tenantAId, first.category.id);
      if (second.ok)
        await deleteDocumentCategory(tenantBId, second.category.id);
    });

    it("deletar uma categoria com tenantId incompatível é no-op — retorna false e a categoria continua existindo", async () => {
      const name = `Categoria Isolamento ${randomUUID()}`;
      const created = await createDocumentCategory(tenantAId, name);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await deleteDocumentCategory(
        tenantBId,
        created.category.id
      );
      expect(result).toBe(false);

      const stillThere = await getDocumentCategories(tenantAId);
      expect(stillThere.some((c) => c.id === created.category.id)).toBe(true);

      await deleteDocumentCategory(tenantAId, created.category.id);
    });

    it("categoria criada sem cor persiste com o default 'gray' (lote-3 — CAT-01)", async () => {
      const name = `Categoria Sem Cor ${randomUUID()}`;
      const result = await createDocumentCategory(tenantAId, name);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.category.color).toBe("gray");
      await deleteDocumentCategory(tenantAId, result.category.id);
    });

    it("categoria criada com cor explícita persiste essa cor (lote-3 — CAT-01)", async () => {
      const name = `Categoria Com Cor ${randomUUID()}`;
      const result = await createDocumentCategory(tenantAId, name, "blue");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.category.color).toBe("blue");
      await deleteDocumentCategory(tenantAId, result.category.id);
    });

    it("deletar uma categoria seta category_id para null nos documentos dependentes", async () => {
      const name = `Categoria Com Documentos ${randomUUID()}`;
      const category = await createDocumentCategory(tenantAId, name);
      expect(category.ok).toBe(true);
      if (!category.ok) return;

      const docName = `Doc Dependente ${randomUUID()}.pdf`;
      const doc = await createDocument(tenantAId, {
        name: docName,
        mimeType: "application/pdf",
        sizeBytes: 512,
        modality: "novo",
        categoryId: category.category.id,
      });
      expect(doc.categoryId).toBe(category.category.id);

      const deleted = await deleteDocumentCategory(
        tenantAId,
        category.category.id
      );
      expect(deleted).toBe(true);

      const [reread] = await getDocuments(tenantAId, { search: docName });
      expect(reread).toBeDefined();
      expect(reread.categoryId).toBeNull();

      await deleteDocument(tenantAId, doc.id);
    });
  });

  describe("updateDocumentCategory", () => {
    it("atualiza a cor de uma categoria existente (happy path)", async () => {
      const created = await createDocumentCategory(
        tenantAId,
        `Categoria Cor Update ${randomUUID()}`
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.category.color).toBe("gray");

      const updated = await updateDocumentCategory(tenantAId, created.category.id, {
        color: "purple",
      });
      expect(updated).not.toBeNull();
      expect(updated!.color).toBe("purple");

      const [reread] = await getDocumentCategories(tenantAId).then((rows) =>
        rows.filter((c) => c.id === created.category.id)
      );
      expect(reread.color).toBe("purple");

      await deleteDocumentCategory(tenantAId, created.category.id);
    });

    it("retorna null (no-op) para uma categoria inexistente", async () => {
      const result = await updateDocumentCategory(tenantAId, NON_EXISTENT_ID, {
        color: "red",
      });
      expect(result).toBeNull();
    });

    it("retorna null (no-op) e não altera a cor quando o tenantId não corresponde (isolamento cross-tenant)", async () => {
      const created = await createDocumentCategory(
        tenantAId,
        `Categoria Cor Isolamento ${randomUUID()}`
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await updateDocumentCategory(tenantBId, created.category.id, {
        color: "pink",
      });
      expect(result).toBeNull();

      const stillGray = await getDocumentCategories(tenantAId).then((rows) =>
        rows.find((c) => c.id === created.category.id)
      );
      expect(stillGray!.color).toBe("gray");

      await deleteDocumentCategory(tenantAId, created.category.id);
    });
  });
});
