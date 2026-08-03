import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { documentCategories, documents, tenants } from "../../../db/schema";
import { getContext } from "../context";

// Tenant + documentos PRÓPRIOS deste arquivo (nunca o snapshot do seed) —
// mesmo padrão de isolamento dos demais testes de integração do lote-5.
describe("server/integration context — getContext", () => {
  let tenantId: string;
  let categoryId: string;
  let docNovoId: string;
  let docUsadoId: string;
  let docAmbosId: string;
  let docExpiradoId: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste context ${tenantId}`,
      agentName: "Agente Teste",
      supportedModality: "ambos",
    });

    categoryId = randomUUID();
    await db.insert(documentCategories).values({
      id: categoryId,
      tenantId,
      name: "Categoria Teste",
      color: "blue",
    });

    docNovoId = randomUUID();
    docUsadoId = randomUUID();
    docAmbosId = randomUUID();
    docExpiradoId = randomUUID();
    await db.insert(documents).values([
      {
        id: docNovoId,
        tenantId,
        name: "Doc Novo.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        categoryId,
        expiresAt: null,
      },
      {
        id: docUsadoId,
        tenantId,
        name: "Doc Usado.pdf",
        modality: "usado",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        categoryId: null,
        expiresAt: null,
      },
      {
        id: docAmbosId,
        tenantId,
        name: "Doc Ambos.pdf",
        modality: "ambos",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        categoryId: null,
        expiresAt: new Date(Date.UTC(2099, 0, 1)), // futuro — não expirado
      },
      {
        id: docExpiradoId,
        tenantId,
        name: "Doc Expirado.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        categoryId: null,
        expiresAt: new Date(Date.UTC(2020, 0, 1)), // passado — expirado
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(documents).where(eq(documents.tenantId, tenantId));
    await db.delete(documentCategories).where(eq(documentCategories.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  it("modality=novo retorna novo+ambos, exclui usado e expirado (Independent Test da spec)", async () => {
    const result = await getContext(tenantId, "novo");
    const ids = result.map((d) => d.id).sort();
    expect(ids).toEqual([docAmbosId, docNovoId].sort());
  });

  it("modality=usado retorna usado+ambos, exclui novo e expirado", async () => {
    const result = await getContext(tenantId, "usado");
    const ids = result.map((d) => d.id).sort();
    expect(ids).toEqual([docAmbosId, docUsadoId].sort());
  });

  it("shape completo: content sempre null, categoria {name,color} quando existe, null quando não (INT-06 AC1)", async () => {
    const result = await getContext(tenantId, "novo");
    const docNovo = result.find((d) => d.id === docNovoId)!;
    expect(docNovo.content).toBeNull();
    expect(docNovo.category).toEqual({ name: "Categoria Teste", color: "blue" });
    expect(docNovo.modality).toBe("novo");

    const docAmbos = result.find((d) => d.id === docAmbosId)!;
    expect(docAmbos.category).toBeNull();
    expect(docAmbos.content).toBeNull();
  });

  it("documento expirado nunca aparece, mesmo pedindo a modalidade dele (LGPD-02 AC2)", async () => {
    const result = await getContext(tenantId, "novo");
    expect(result.some((d) => d.id === docExpiradoId)).toBe(false);
  });
});
