import "dotenv/config";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { documentCategories, documents, tenants } from "../../../db/schema";
import { buildCanonicalContext, measureCanonicalContext } from "../../documents/context-budget";
import { getDirectDocumentContext } from "../context";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const CATEGORY_A = randomUUID();
const NOW = new Date("2032-05-01T12:00:00.000Z");

function hash(seed: string) { return seed.replaceAll("-", "").padEnd(64, "0").slice(0, 64); }

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
    extractedText: "texto padrão",
    extractedBytes: 12,
    uploadedAt: new Date("2032-01-01T00:00:00.000Z"),
    ...overrides,
  }).returning();
  return row;
}

const query = (modality: "novo" | "usado" | "ambos", question = "qual a política?") => ({ modality, question });

describe("fonte direta de contexto documental (lote-12 T20)", () => {
  beforeAll(async () => {
    await db.insert(tenants).values([
      { id: TENANT_A, name: "Contexto A", agentName: "A", supportedModality: "ambos", slug: `ctx-a-${TENANT_A}` },
      { id: TENANT_B, name: "Contexto B", agentName: "B", supportedModality: "ambos", slug: `ctx-b-${TENANT_B}` },
    ]);
    await db.insert(documentCategories).values({
      id: CATEGORY_A, tenantId: TENANT_A, name: "Políticas", color: "blue",
    });
  });

  afterAll(async () => {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
    await db.delete(documentCategories).where(eq(documentCategories.tenantId, TENANT_A));
    await db.delete(tenants).where(inArray(tenants.id, [TENANT_A, TENANT_B]));
    await db.$client.end();
  });

  async function clear() {
    await db.delete(documents).where(inArray(documents.tenantId, [TENANT_A, TENANT_B]));
  }

  describe("compatibilidade de modalidade (AC2, AC3, AC4)", () => {
    it("modalidade novo inclui novo e ambos e exclui exclusivamente usado", async () => {
      await clear();
      const novo = await createDocument({ modality: "novo" });
      const ambos = await createDocument({ modality: "ambos" });
      await createDocument({ modality: "usado" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents.map((d) => d.id).sort()).toEqual([novo.id, ambos.id].sort());
    });

    it("modalidade usado inclui usado e ambos e exclui exclusivamente novo", async () => {
      await clear();
      const usado = await createDocument({ modality: "usado" });
      const ambos = await createDocument({ modality: "ambos" });
      await createDocument({ modality: "novo" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("usado"), NOW);

      expect(envelope.documents.map((d) => d.id).sort()).toEqual([usado.id, ambos.id].sort());
    });

    it("modalidade ambos inclui as três modalidades", async () => {
      await clear();
      const novo = await createDocument({ modality: "novo" });
      const usado = await createDocument({ modality: "usado" });
      const ambos = await createDocument({ modality: "ambos" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents.map((d) => d.id).sort()).toEqual([novo.id, usado.id, ambos.id].sort());
    });

    it("modalidade ambos não duplica o documento cadastrado como ambos", async () => {
      await clear();
      const ambos = await createDocument({ modality: "ambos" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents.filter((d) => d.id === ambos.id)).toHaveLength(1);
      expect(envelope.documents).toHaveLength(1);
    });
  });

  describe("elegibilidade por estado (AC1, AC5)", () => {
    it("documento pronto entrega o texto extraído integral, sem truncar", async () => {
      await clear();
      const conteudo = "Política de comissão: ".concat("x".repeat(5_000));
      await createDocument({ extractedText: conteudo });

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents[0].content).toBe(conteudo);
      expect(envelope.documents[0].contentMode).toBe("full");
    });

    it.each(["processando", "falha", "fora_do_agente"] as const)(
      "documento em %s fica fora do corpus entregue",
      async (status) => {
        await clear();
        await createDocument({ status });

        const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

        expect(envelope.documents).toHaveLength(0);
      }
    );

    it("documento pronto sem texto extraído não entra no corpus", async () => {
      await clear();
      await createDocument({ extractedText: null, extractedBytes: null });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents).toHaveLength(0);
    });

    it("documento com tombstone não entra no corpus mesmo antes da remoção física", async () => {
      await clear();
      await createDocument({ deletedAt: NOW });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents).toHaveLength(0);
    });
  });

  describe("validade (AC6)", () => {
    it("documento vencido some do contexto mesmo com registro e original ainda vivos", async () => {
      await clear();
      const vencido = await createDocument({ expiresAt: new Date(NOW.getTime() - 1) });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents).toHaveLength(0);
      const [row] = await db.select().from(documents).where(eq(documents.id, vencido.id));
      expect(row).toMatchObject({ deletedAt: null, status: "pronto" });
    });

    it("documento com expiresAt exatamente igual a now já está fora do contexto", async () => {
      await clear();
      await createDocument({ expiresAt: NOW });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents).toHaveLength(0);
    });

    it("documento com validade futura continua no contexto", async () => {
      await clear();
      const vigente = await createDocument({ expiresAt: new Date(NOW.getTime() + 1) });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents.map((d) => d.id)).toEqual([vigente.id]);
    });
  });

  describe("corpus vazio e isolamento (AC7)", () => {
    it("tenant sem documento elegível devolve coleção vazia, sem erro", async () => {
      await clear();

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope).toEqual({ retrievalMode: "direct", documents: [] });
    });

    it("corpus vazio de um tenant nunca reusa conteúdo de outro", async () => {
      await clear();
      await createDocument({ extractedText: "segredo do tenant B" }, TENANT_B);

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);

      expect(envelope.documents).toHaveLength(0);
      expect(JSON.stringify(envelope)).not.toContain("segredo do tenant B");
    });

    it("cada tenant recebe apenas o próprio corpus", async () => {
      await clear();
      const docA = await createDocument({ extractedText: "conteúdo A" });
      const docB = await createDocument({ extractedText: "conteúdo B" }, TENANT_B);

      const envelopeA = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);
      const envelopeB = await getDirectDocumentContext(TENANT_B, query("ambos"), NOW);

      expect(envelopeA.documents.map((d) => d.id)).toEqual([docA.id]);
      expect(envelopeB.documents.map((d) => d.id)).toEqual([docB.id]);
    });
  });

  describe("estabilidade e ordem (AC8, AC10, AC11)", () => {
    it("perguntas diferentes devolvem o mesmo envelope byte a byte", async () => {
      await clear();
      await createDocument({ modality: "ambos" });
      await createDocument({ modality: "novo" });

      const primeira = await getDirectDocumentContext(TENANT_A, query("ambos", "qual a comissão?"), NOW);
      const segunda = await getDirectDocumentContext(TENANT_A, query("ambos", "posso financiar?"), NOW);

      expect(JSON.stringify(segunda)).toBe(JSON.stringify(primeira));
    });

    it("cada documento carrega id e nome suficientes para atribuir a origem", async () => {
      await clear();
      const documento = await createDocument({ name: "Política de comissão.pdf" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents[0]).toMatchObject({ id: documento.id, name: "Política de comissão.pdf" });
    });

    it("o corpus vai do upload mais antigo para o mais recente", async () => {
      await clear();
      const recente = await createDocument({ uploadedAt: new Date("2032-03-01T00:00:00.000Z") });
      const antigo = await createDocument({ uploadedAt: new Date("2032-01-01T00:00:00.000Z") });
      const meio = await createDocument({ uploadedAt: new Date("2032-02-01T00:00:00.000Z") });

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents.map((d) => d.id)).toEqual([antigo.id, meio.id, recente.id]);
    });

    it("uploads no mesmo instante desempatam pelo identificador", async () => {
      await clear();
      const mesmoInstante = new Date("2032-04-01T00:00:00.000Z");
      const um = await createDocument({ uploadedAt: mesmoInstante });
      const outro = await createDocument({ uploadedAt: mesmoInstante });
      const esperado = [um.id, outro.id].sort((a, b) => a.localeCompare(b));

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents.map((d) => d.id)).toEqual(esperado);
    });
  });

  describe("paridade com a medição de teto de T12", () => {
    it("a serialização entregue é a mesma que a admissão mediu", async () => {
      await clear();
      const documento = await createDocument({ modality: "ambos", extractedText: "corpo medido" });

      const envelope = await getDirectDocumentContext(TENANT_A, query("ambos"), NOW);
      const esperado = buildCanonicalContext(
        [{
          id: documento.id,
          name: documento.name,
          modality: "ambos",
          content: "corpo medido",
          uploadedAt: documento.uploadedAt,
          status: "pronto",
          category: null,
        }],
        "ambos"
      );

      expect(JSON.stringify(envelope)).toBe(JSON.stringify(esperado));
      expect(measureCanonicalContext(envelope)).toBe(Buffer.byteLength(JSON.stringify(envelope), "utf8"));
    });

    it("categoria aparece quando existe e é null quando não existe", async () => {
      await clear();
      const comCategoria = await createDocument({ categoryId: CATEGORY_A, uploadedAt: new Date("2032-01-01T00:00:00.000Z") });
      const semCategoria = await createDocument({ uploadedAt: new Date("2032-02-01T00:00:00.000Z") });

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.documents.find((d) => d.id === comCategoria.id)!.category).toEqual({ name: "Políticas", color: "blue" });
      expect(envelope.documents.find((d) => d.id === semCategoria.id)!.category).toBeNull();
    });

    it("o envelope anuncia o modo de recuperação direct", async () => {
      await clear();
      await createDocument();

      const envelope = await getDirectDocumentContext(TENANT_A, query("novo"), NOW);

      expect(envelope.retrievalMode).toBe("direct");
    });
  });
});
