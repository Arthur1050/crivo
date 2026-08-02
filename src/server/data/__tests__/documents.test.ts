import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import {
  getDocumentCategories,
  getDocumentSample,
  getDocuments,
  getTenants,
} from "../index";

const NON_EXISTENT_TENANT_ID = "00000000-0000-4000-8000-000000000000";

// Assume o banco já está seedado (ver AGENTS do batch: `npm run db:seed`).
// Segue o mesmo padrão de isolation.test.ts — não roda o seed aqui.
describe("server/data documents", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const tenants = await getTenants();
    expect(tenants.length).toBeGreaterThanOrEqual(2);
    [tenantAId, tenantBId] = tenants.map((t) => t.id);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("getDocumentCategories", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada categoria pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const categoriesA = await getDocumentCategories(tenantAId);
      const categoriesB = await getDocumentCategories(tenantBId);

      expect(categoriesA.length).toBeGreaterThan(0);
      expect(categoriesB.length).toBeGreaterThan(0);

      const idsA = new Set(categoriesA.map((c) => c.id));
      const idsB = new Set(categoriesB.map((c) => c.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);

      for (const category of categoriesA)
        expect(category.tenantId).toBe(tenantAId);
      for (const category of categoriesB)
        expect(category.tenantId).toBe(tenantBId);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getDocumentCategories(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });

    it("o mesmo nome de categoria existe em tenants diferentes — unicidade é escopada por tenant (CONF-01/02)", async () => {
      const categoriesA = await getDocumentCategories(tenantAId);
      const categoriesB = await getDocumentCategories(tenantBId);
      const namesA = categoriesA.map((c) => c.name);
      const namesB = categoriesB.map((c) => c.name);
      const repeated = namesA.filter((name) => namesB.includes(name));
      expect(repeated.length).toBeGreaterThan(0);
    });
  });

  describe("getDocuments — filtros", () => {
    it("sem filtros retorna todos os documentos do tenant, ordenados por uploadedAt desc", async () => {
      const result = await getDocuments(tenantAId);
      expect(result.length).toBeGreaterThan(0);
      for (const doc of result) expect(doc.tenantId).toBe(tenantAId);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].uploadedAt.getTime()).toBeGreaterThanOrEqual(
          result[i].uploadedAt.getTime()
        );
      }
    });

    it("filtra por modality (DOC-06)", async () => {
      const result = await getDocuments(tenantAId, { modality: "novo" });
      expect(result.length).toBeGreaterThan(0);
      for (const doc of result) expect(doc.modality).toBe("novo");
    });

    it("filtra por categoryId (DOC-06)", async () => {
      const categories = await getDocumentCategories(tenantAId);
      const withDocs = await getDocuments(tenantAId);
      const categoryId = withDocs.find((d) => d.categoryId !== null)
        ?.categoryId as string;
      expect(categoryId).toBeDefined();
      expect(categories.some((c) => c.id === categoryId)).toBe(true);

      const result = await getDocuments(tenantAId, { categoryId });
      expect(result.length).toBeGreaterThan(0);
      for (const doc of result) expect(doc.categoryId).toBe(categoryId);
    });

    it("filtra por search de forma case-insensitive, substring (DOC-06)", async () => {
      const all = await getDocuments(tenantAId);
      const target = all[0];
      const term = target.name.slice(0, 5).toUpperCase();
      const result = await getDocuments(tenantAId, { search: term });
      expect(result.some((d) => d.id === target.id)).toBe(true);
      for (const doc of result) {
        expect(doc.name.toLowerCase()).toContain(term.toLowerCase());
      }
    });

    it("combina modality + search (DOC-06)", async () => {
      const modalityMatches = await getDocuments(tenantAId, {
        modality: "ambos",
      });
      expect(modalityMatches.length).toBeGreaterThan(0);
      const target = modalityMatches[0];
      const term = target.name.slice(0, 5);

      const result = await getDocuments(tenantAId, {
        modality: "ambos",
        search: term,
      });
      expect(result.some((d) => d.id === target.id)).toBe(true);
      for (const doc of result) expect(doc.modality).toBe("ambos");
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getDocuments(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });

    it("resultados do tenant A e B são totalmente disjuntos (isolamento, AC 2.1, 2.2)", async () => {
      const documentsA = await getDocuments(tenantAId);
      const documentsB = await getDocuments(tenantBId);
      const idsA = new Set(documentsA.map((d) => d.id));
      const idsB = new Set(documentsB.map((d) => d.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);
    });
  });

  describe("getDocumentSample", () => {
    it("retorna até 5 documentos mais recentes e contagem por modalidade do tenant", async () => {
      const sample = await getDocumentSample(tenantAId);
      const allDocs = await getDocuments(tenantAId);

      expect(sample.recent.length).toBe(Math.min(5, allDocs.length));
      for (const doc of sample.recent) expect(doc.tenantId).toBe(tenantAId);

      for (let i = 1; i < sample.recent.length; i++) {
        expect(
          sample.recent[i - 1].uploadedAt.getTime()
        ).toBeGreaterThanOrEqual(sample.recent[i].uploadedAt.getTime());
      }

      const expectedCounts: Record<string, number> = {
        novo: 0,
        usado: 0,
        ambos: 0,
      };
      for (const doc of allDocs) expectedCounts[doc.modality] += 1;
      expect(sample.countsByModality).toEqual(expectedCounts);
    });

    it("contagens do tenant A e B não se misturam (isolamento, AC 2.1, 2.2)", async () => {
      const sampleA = await getDocumentSample(tenantAId);
      const sampleB = await getDocumentSample(tenantBId);
      const totalA = Object.values(sampleA.countsByModality).reduce(
        (a, b) => a + b,
        0
      );
      const totalB = Object.values(sampleB.countsByModality).reduce(
        (a, b) => a + b,
        0
      );
      const allA = await getDocuments(tenantAId);
      const allB = await getDocuments(tenantBId);
      expect(totalA).toBe(allA.length);
      expect(totalB).toBe(allB.length);
    });

    it("retorna [] e zeros para um tenant inexistente, nunca um erro (edge case)", async () => {
      const sample = await getDocumentSample(NON_EXISTENT_TENANT_ID);
      expect(sample.recent).toEqual([]);
      expect(sample.countsByModality).toEqual({
        novo: 0,
        usado: 0,
        ambos: 0,
      });
    });
  });
});
