import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  generateClientTokenFromReadWriteToken: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: sdk.del,
  get: sdk.get,
  head: sdk.head,
}));

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: sdk.generateClientTokenFromReadWriteToken,
}));

import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_UPLOAD_BYTES,
  VercelBlobDocumentStorage,
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
