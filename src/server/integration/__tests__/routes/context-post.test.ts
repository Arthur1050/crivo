import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../db";
import { documents, integrationRefusals, tenantApiKeys, tenants } from "../../../../db/schema";
import { MAX_CONTEXT_QUESTION_LENGTH } from "../../parsers";
import { POST } from "../../../../../app/api/v1/context/route";

const ROUTE = "/api/v1/context";
const QUESTION = "qual é a política de comissão?";

function hash(seed: string) { return seed.replaceAll("-", "").padEnd(64, "0").slice(0, 64); }

describe("routes: POST /api/v1/context", () => {
  let tenantAId: string;
  let tenantBId: string;
  let apiKeyA: string;
  let apiKeyB: string;
  let docNovoAId: string;
  let docAmbosAId: string;
  let docUsadoAId: string;
  let docBId: string;

  function makeRequest(body: unknown, key?: string, slug?: string): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key !== undefined) headers.Authorization = `Bearer ${key}`;
    if (slug !== undefined) headers["X-Crivo-Tenant"] = slug;
    return new Request(`https://local${ROUTE}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      { id: tenantAId, name: `Tenant A context-post ${tenantAId}`, agentName: "Agente A", supportedModality: "ambos", slug: `ctxpost-a-${tenantAId}` },
      { id: tenantBId, name: `Tenant B context-post ${tenantBId}`, agentName: "Agente B", supportedModality: "ambos", slug: `ctxpost-b-${tenantBId}` },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    apiKeyB = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values([
      { tenantId: tenantAId, label: "context-post.test.ts A", keyHash: createHash("sha256").update(apiKeyA).digest("hex") },
      { tenantId: tenantBId, label: "context-post.test.ts B", keyHash: createHash("sha256").update(apiKeyB).digest("hex") },
    ]);

    docNovoAId = randomUUID();
    docAmbosAId = randomUUID();
    docUsadoAId = randomUUID();
    docBId = randomUUID();
    await db.insert(documents).values([
      { id: docNovoAId, tenantId: tenantAId, name: "Novo A.pdf", modality: "novo", mimeType: "application/pdf", sizeBytes: BigInt(100), storageProvider: "test", storageKey: `test/${tenantAId}/${docNovoAId}`, storageEtag: "e1", contentSha256: hash(docNovoAId), status: "pronto", extractedText: "texto do novo", uploadedAt: new Date("2032-01-01T00:00:00.000Z") },
      { id: docAmbosAId, tenantId: tenantAId, name: "Ambos A.pdf", modality: "ambos", mimeType: "application/pdf", sizeBytes: BigInt(100), storageProvider: "test", storageKey: `test/${tenantAId}/${docAmbosAId}`, storageEtag: "e2", contentSha256: hash(docAmbosAId), status: "pronto", extractedText: "texto do ambos", uploadedAt: new Date("2032-02-01T00:00:00.000Z") },
      { id: docUsadoAId, tenantId: tenantAId, name: "Usado A.pdf", modality: "usado", mimeType: "application/pdf", sizeBytes: BigInt(100), storageProvider: "test", storageKey: `test/${tenantAId}/${docUsadoAId}`, storageEtag: "e3", contentSha256: hash(docUsadoAId), status: "pronto", extractedText: "texto do usado", uploadedAt: new Date("2032-03-01T00:00:00.000Z") },
      { id: docBId, tenantId: tenantBId, name: "Doc B.pdf", modality: "ambos", mimeType: "application/pdf", sizeBytes: BigInt(100), storageProvider: "test", storageKey: `test/${tenantBId}/${docBId}`, storageEtag: "e4", contentSha256: hash(docBId), status: "pronto", extractedText: "segredo exclusivo do tenant B", uploadedAt: new Date("2032-01-01T00:00:00.000Z") },
    ]);
  });

  afterAll(async () => {
    await db.delete(documents).where(eq(documents.tenantId, tenantAId));
    await db.delete(documents).where(eq(documents.tenantId, tenantBId));
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  describe("autenticação e tenant (AC12)", () => {
    it("sem header Authorization responde 401 sem revelar contagem nem metadado", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: QUESTION }));
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("nao-autenticado");
      expect(JSON.stringify(body)).not.toContain("documents");
    });

    it("credencial inválida responde 401 sem indício de documentos", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: QUESTION }, "chave-errada"));
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain("texto do novo");
    });

    it("o tenant vem da credencial, nunca de campo do corpo", async () => {
      const response = await POST(
        makeRequest({ modality: "ambos", question: QUESTION, tenantId: tenantBId }, apiKeyA)
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.documents.map((d: { id: string }) => d.id)).not.toContain(docBId);
      expect(JSON.stringify(body)).not.toContain("segredo exclusivo do tenant B");
    });

    it("cada credencial recebe apenas o corpus do próprio tenant", async () => {
      const respostaB = await POST(makeRequest({ modality: "ambos", question: QUESTION }, apiKeyB));
      const body = await respostaB.json();
      expect(body.documents.map((d: { id: string }) => d.id)).toEqual([docBId]);
    });
  });

  describe("validação do corpo (AC9)", () => {
    it("campo 'question' ausente é recusado com detalhe de obrigatoriedade", async () => {
      const response = await POST(makeRequest({ modality: "novo" }, apiKeyA));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("payload-invalido");
      expect(body.detail).toBe("Campo 'question' é obrigatório.");
    });

    it("campo 'question' vazio depois de trim é recusado com detalhe próprio", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: "   " }, apiKeyA));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.detail).toBe("Campo 'question' não pode ser vazio.");
    });

    it("'question' ausente e 'question' vazia produzem detalhes distintos", async () => {
      const ausente = await (await POST(makeRequest({ modality: "novo" }, apiKeyA))).json();
      const vazia = await (await POST(makeRequest({ modality: "novo", question: "" }, apiKeyA))).json();
      expect(ausente.detail).not.toBe(vazia.detail);
    });

    it("'question' não string é recusada", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: 42 }, apiKeyA));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe("Campo 'question' deve ser uma string.");
    });

    it("'question' com exatamente 4.096 caracteres é aceita", async () => {
      const response = await POST(
        makeRequest({ modality: "novo", question: "a".repeat(MAX_CONTEXT_QUESTION_LENGTH) }, apiKeyA)
      );
      expect(response.status).toBe(200);
    });

    it("'question' com 4.097 caracteres é recusada", async () => {
      const response = await POST(
        makeRequest({ modality: "novo", question: "a".repeat(MAX_CONTEXT_QUESTION_LENGTH + 1) }, apiKeyA)
      );
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain(String(MAX_CONTEXT_QUESTION_LENGTH));
    });

    it("campo 'modality' ausente é recusado", async () => {
      const response = await POST(makeRequest({ question: QUESTION }, apiKeyA));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe("Campo 'modality' é obrigatório.");
    });

    it("modalidade fora do enum é recusada e lista os valores aceitos", async () => {
      const response = await POST(makeRequest({ modality: "alugado", question: QUESTION }, apiKeyA));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("novo, usado, ambos");
    });

    it("corpo que não é JSON válido é recusado como payload inválido", async () => {
      const response = await POST(makeRequest("{isso não é json", apiKeyA));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe("Corpo da requisição não é JSON válido.");
    });

    it("corpo que não é objeto JSON é recusado", async () => {
      const response = await POST(makeRequest("[1,2,3]", apiKeyA));
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe("Corpo da requisição deve ser um objeto JSON.");
    });

    it("corpo acima do limite responde 413 antes de qualquer leitura de documento", async () => {
      const response = await POST(
        makeRequest({ modality: "novo", question: "a".repeat(200 * 1024) }, apiKeyA)
      );
      expect(response.status).toBe(413);
      expect((await response.json()).code).toBe("corpo-grande-demais");
    });
  });

  describe("resposta (AC1, AC2, AC3, AC4, AC11)", () => {
    it("devolve o envelope direct com o corpus da modalidade pedida", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: QUESTION }, apiKeyA));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.retrievalMode).toBe("direct");
      expect(body.documents.map((d: { id: string }) => d.id)).toEqual([docNovoAId, docAmbosAId]);
    });

    it("modalidade usado devolve usado e ambos, na ordem de upload", async () => {
      const response = await POST(makeRequest({ modality: "usado", question: QUESTION }, apiKeyA));
      const body = await response.json();
      expect(body.documents.map((d: { id: string }) => d.id)).toEqual([docAmbosAId, docUsadoAId]);
    });

    it("modalidade ambos devolve as três, sem duplicar", async () => {
      const response = await POST(makeRequest({ modality: "ambos", question: QUESTION }, apiKeyA));
      const body = await response.json();
      expect(body.documents.map((d: { id: string }) => d.id)).toEqual([docNovoAId, docAmbosAId, docUsadoAId]);
    });

    it("a resposta declara Cache-Control no-store", async () => {
      const response = await POST(makeRequest({ modality: "novo", question: QUESTION }, apiKeyA));
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("a pergunta não é ecoada na resposta", async () => {
      const marcador = `pergunta-sensivel-${randomUUID()}`;
      const response = await POST(makeRequest({ modality: "novo", question: marcador }, apiKeyA));
      expect(JSON.stringify(await response.json())).not.toContain(marcador);
    });

    it("perguntas diferentes devolvem o mesmo corpus na mesma ordem", async () => {
      const uma = await (await POST(makeRequest({ modality: "ambos", question: "posso financiar?" }, apiKeyA))).json();
      const outra = await (await POST(makeRequest({ modality: "ambos", question: "qual o prazo?" }, apiKeyA))).json();
      expect(JSON.stringify(outra)).toBe(JSON.stringify(uma));
    });
  });

  describe("instrumentação de recusa (AD-023)", () => {
    it("recusa de payload é registrada sem a pergunta e sem query string", async () => {
      const marcador = `pergunta-registrada-${randomUUID()}`;
      await POST(makeRequest({ modality: "alugado", question: marcador }, apiKeyA));

      const rows = await db
        .select()
        .from(integrationRefusals)
        .where(and(eq(integrationRefusals.tenantId, tenantAId), eq(integrationRefusals.status, 400)));

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const registrada = rows.at(-1)!;
      expect(registrada.route).toBe(ROUTE);
      expect(registrada.method).toBe("POST");
      expect(registrada.code).toBe("payload-invalido");
      expect(JSON.stringify(registrada)).not.toContain(marcador);
    });

    it("o caminho de sucesso não gera registro de recusa", async () => {
      const antes = await db.select().from(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
      await POST(makeRequest({ modality: "novo", question: QUESTION }, apiKeyA));
      const depois = await db.select().from(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
      expect(depois).toHaveLength(antes.length);
    });
  });
});
