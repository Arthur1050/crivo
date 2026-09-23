import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  generateClientTokenFromReadWriteToken: vi.fn(),
}));

// Só as três funções de I/O são dubladas. As classes de erro reais do pacote
// seguem valendo, senão `instanceof` no adapter compararia contra undefined e
// o teste passaria por um motivo que não existe em produção (lote-12 T29).
vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return { ...actual, del: sdk.del, get: sdk.get, head: sdk.head };
});

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: sdk.generateClientTokenFromReadWriteToken,
}));

import {
  BlobAccessError,
  BlobNotFoundError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  del,
  head,
} from "@vercel/blob";
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_UPLOAD_BYTES,
  VercelBlobDocumentStorage,
  translateVercelBlobError,
} from "../vercel-blob-storage";

const KEY = "documents/v1/tenant/intent/object";
const STREAM = new ReadableStream<Uint8Array>();

function uploadInput(overrides: Partial<{ contentLength: number; contentType: string; expiresAt: Date }> = {}) {
  return {
    key: KEY,
    contentLength: 16,
    contentType: "application/pdf",
    expiresAt: new Date("2026-09-16T12:10:00.000Z"),
    ...overrides,
  };
}

function blob(overrides: Partial<{ pathname: string; etag: string; contentType: string; size: number }> = {}) {
  return {
    pathname: KEY,
    etag: "etag-123",
    contentType: "application/pdf",
    size: 16,
    url: "https://private.blob.vercel-storage.com/secret",
    downloadUrl: "https://private.blob.vercel-storage.com/secret?download=1",
    ...overrides,
  };
}

describe("VercelBlobDocumentStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it("emite grant privado, limitado ao objeto, MIME, tamanho e cinco minutos", async () => {
    sdk.generateClientTokenFromReadWriteToken.mockResolvedValue("client-token-secret");

    const grant = await new VercelBlobDocumentStorage().authorizeClientUpload(
      uploadInput()
    );

    expect(grant).toEqual({
      key: KEY,
      clientToken: "client-token-secret",
      expiresAt: new Date("2026-09-16T12:05:00.000Z"),
      access: "private",
    });
    expect(sdk.generateClientTokenFromReadWriteToken).toHaveBeenCalledWith({
      pathname: KEY,
      maximumSizeInBytes: 16,
      allowedContentTypes: ["application/pdf"],
      validUntil: new Date("2026-09-16T12:05:00.000Z").getTime(),
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });

  it("nunca amplia a expiração curta da intenção", async () => {
    sdk.generateClientTokenFromReadWriteToken.mockResolvedValue("token");

    const grant = await new VercelBlobDocumentStorage().authorizeClientUpload(
      uploadInput({ expiresAt: new Date("2026-09-16T12:02:00.000Z") })
    );

    expect(grant.expiresAt).toEqual(new Date("2026-09-16T12:02:00.000Z"));
  });

  it.each([
    ["zero bytes", { contentLength: 0 }],
    ["acima de 10 MiB", { contentLength: MAX_DOCUMENT_UPLOAD_BYTES + 1 }],
    ["MIME não permitido", { contentType: "application/octet-stream" }],
  ])("recusa %s antes de gerar token", async (_case, overrides) => {
    await expect(
      new VercelBlobDocumentStorage().authorizeClientUpload(uploadInput(overrides))
    ).rejects.toMatchObject({ kind: "permanent", code: "STORAGE_PERMANENT_FAILURE" });
    expect(sdk.generateClientTokenFromReadWriteToken).not.toHaveBeenCalled();
  });

  it("mantém a lista de formatos do contrato explícita", () => {
    expect(DOCUMENT_CONTENT_TYPES).toEqual([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
    ]);
  });

  it("retorna metadata de head sem URL do provedor", async () => {
    sdk.head.mockResolvedValue(blob());

    await expect(new VercelBlobDocumentStorage().head(KEY)).resolves.toEqual({
      key: KEY,
      etag: "etag-123",
      contentType: "application/pdf",
      size: 16,
    });
  });

  it("normaliza objeto ausente em head para null", async () => {
    sdk.head.mockRejectedValue({ status: 404, message: "secret URL" });

    await expect(new VercelBlobDocumentStorage().head(KEY)).resolves.toBeNull();
  });

  it("classifica falha temporária de head sem mensagem do provedor", async () => {
    sdk.head.mockRejectedValue({ status: 503, message: "secret URL" });

    await expect(new VercelBlobDocumentStorage().head(KEY)).rejects.toMatchObject({
      kind: "transient",
      code: "STORAGE_TRANSIENT_FAILURE",
      message: "Document storage is temporarily unavailable.",
    });
  });

  it("abre stream privado com metadata e sem URL", async () => {
    sdk.get.mockResolvedValue({
      statusCode: 200,
      blob: blob(),
      stream: STREAM,
    });

    await expect(new VercelBlobDocumentStorage().open(KEY)).resolves.toEqual({
      key: KEY,
      etag: "etag-123",
      contentType: "application/pdf",
      size: 16,
      stream: STREAM,
    });
    expect(sdk.get).toHaveBeenCalledWith(KEY, { access: "private" });
  });

  // Reproduzido contra o Blob real: para texto acima de ~1 KB o `get` volta
  // comprimido, com ETag fraco e tamanho 0, e o `head` com o ETag forte.
  it("open devolve o ETag forte quando a CDN responde comprimido", async () => {
    sdk.head.mockResolvedValue(blob({ etag: '"abc123"', contentType: "text/plain", size: 140_000 }));
    sdk.get.mockResolvedValue({
      statusCode: 200,
      blob: blob({ etag: 'W/"abc123"', contentType: "text/plain", size: 0 }),
      stream: STREAM,
    });

    const storage = new VercelBlobDocumentStorage();
    const [metadata, opened] = await Promise.all([storage.head(KEY), storage.open(KEY)]);
    expect(opened?.etag).toBe('"abc123"');
    expect(opened?.etag).toBe(metadata?.etag);
  });

  it("ETag forte continua igual e ETag diferente continua diferente", async () => {
    sdk.get.mockResolvedValue({ statusCode: 200, blob: blob({ etag: 'W/"outro"' }), stream: STREAM });
    await expect(new VercelBlobDocumentStorage().open(KEY)).resolves.toMatchObject({ etag: '"outro"' });
    sdk.head.mockResolvedValue(blob({ etag: '"forte"' }));
    await expect(new VercelBlobDocumentStorage().head(KEY)).resolves.toMatchObject({ etag: '"forte"' });
  });

  it("retorna null quando open não encontra objeto", async () => {
    sdk.get.mockResolvedValue(null);

    await expect(new VercelBlobDocumentStorage().open(KEY)).resolves.toBeNull();
  });

  it("remove objeto existente pela chave opaca", async () => {
    sdk.del.mockResolvedValue(undefined);

    await expect(new VercelBlobDocumentStorage().delete(KEY)).resolves.toBeUndefined();
    expect(sdk.del).toHaveBeenCalledWith(KEY);
  });

  it("trata objeto ausente no delete como sucesso idempotente", async () => {
    sdk.del.mockRejectedValue({ code: "BLOB_NOT_FOUND" });

    await expect(new VercelBlobDocumentStorage().delete(KEY)).resolves.toBeUndefined();
  });

  it("propaga somente classificação sanitizada de falha permanente no delete", async () => {
    sdk.del.mockRejectedValue(new Error("private-token=never-log"));

    await expect(new VercelBlobDocumentStorage().delete(KEY)).rejects.toMatchObject({
      kind: "permanent",
      code: "STORAGE_PERMANENT_FAILURE",
      message: "Document storage rejected the operation.",
    });
  });
});

/**
 * lote-12 — T29: tradução de erro contra as classes REAIS do SDK.
 *
 * Os testes de T7 usavam objetos `{ status: 404 }` inventados; o provedor
 * nunca produz essa forma. `BlobNotFoundError` não carrega `status` nem
 * `code`, então caía em `permanent` — e como `head() === null` é o que
 * autoriza o hard delete, toda remoção física ficava presa em pendência
 * eterna. Estes testes instanciam as classes do próprio pacote, de modo que
 * uma mudança de vocabulário do provedor quebre aqui em vez de em produção.
 */
describe("tradução de erro do provedor (T29)", () => {
  it("BlobNotFoundError é a única ausência reconhecida", () => {
    expect(translateVercelBlobError(new BlobNotFoundError()).kind).toBe("absent");
  });

  it.each([
    ["BlobServiceNotAvailable", () => new BlobServiceNotAvailable()],
    ["BlobServiceRateLimited", () => new BlobServiceRateLimited(30)],
    ["BlobRequestAbortedError", () => new BlobRequestAbortedError()],
  ])("%s é transitório e retentável", (_nome, build) => {
    expect(translateVercelBlobError(build()).kind).toBe("transient");
  });

  it.each([
    ["BlobStoreNotFoundError", () => new BlobStoreNotFoundError()],
    ["BlobStoreSuspendedError", () => new BlobStoreSuspendedError()],
    ["BlobAccessError", () => new BlobAccessError()],
    ["BlobUnknownError", () => new BlobUnknownError()],
  ])("%s é permanente, nunca ausência", (_nome, build) => {
    // Classificar erro de configuração como ausência apagaria a linha
    // enquanto o original segue existindo num store inalcançável.
    expect(translateVercelBlobError(build()).kind).toBe("permanent");
  });

  it("erro de rede sem classe do SDK continua caindo na classificação por code", () => {
    expect(translateVercelBlobError({ code: "ECONNRESET" }).kind).toBe("transient");
  });

  it("nenhuma tradução vaza a mensagem do provedor", () => {
    const traduzido = translateVercelBlobError(new BlobNotFoundError());
    expect(traduzido.message).not.toContain("Vercel");
    expect(traduzido.code).toBe("STORAGE_OBJECT_ABSENT");
  });

  it("head devolve null quando o provedor responde com o erro real de ausência", async () => {
    vi.mocked(head).mockRejectedValueOnce(new BlobNotFoundError());
    await expect(new VercelBlobDocumentStorage().head("k")).resolves.toBeNull();
  });

  it("delete trata a ausência real do provedor como remoção idempotente", async () => {
    vi.mocked(del).mockRejectedValueOnce(new BlobNotFoundError());
    await expect(new VercelBlobDocumentStorage().delete("k")).resolves.toBeUndefined();
  });
})
