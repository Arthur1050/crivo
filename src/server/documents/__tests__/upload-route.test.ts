import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/server/auth/session", () => {
  class MockPermissionDeniedError extends Error {
    constructor() {
      super("forbidden");
      this.name = "PermissionDeniedError";
    }
  }
  return { PermissionDeniedError: MockPermissionDeniedError };
});

vi.mock("@/src/server/documents/uploads", () => ({
  createDocumentUploadIntake: () => ({
    reserve: async () => ({ kind: "duplicate_upload" as const }),
    finalize: async () => ({ kind: "not_found" as const }),
  }),
}));

import { PermissionDeniedError } from "@/src/server/auth/session";
import {
  createDocumentUploadPostHandler,
  type DocumentUploadRouteDependencies,
} from "../../../../app/api/documents/upload/route";

const INTENT_ID = "4b66cae9-055f-484e-b87d-33e3e32a0b0a";
const KEY = `documents/v1/${randomUUID()}/${INTENT_ID}/${randomUUID()}`;
const EXPIRES_AT = new Date("2030-01-10T13:00:00.000Z");

const input = {
  clientSha256: "a".repeat(64),
  name: "politica.txt",
  mimeType: "text/plain",
  sizeBytes: 28,
  modality: "novo" as const,
};

function request(body: unknown, headers?: HeadersInit) {
  return new Request("https://crivo.test/api/documents/upload", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function generateEvent(clientPayload: string | null = JSON.stringify(input), pathname = "browser-controlled-name") {
  return {
    type: "blob.generate-client-token",
    payload: { pathname, clientPayload, multipart: false },
  };
}

function completedEvent(tokenPayload = JSON.stringify({ intentId: INTENT_ID })) {
  return {
    type: "blob.upload-completed",
    payload: { blob: { url: "https://blob.example/private" }, tokenPayload },
  };
}

function fixture(overrides: Partial<DocumentUploadRouteDependencies> = {}) {
  const reserve = vi.fn(async () => ({
    kind: "reserved" as const,
    intentId: INTENT_ID,
    storageKey: KEY,
    contentType: "text/plain",
    contentLength: 28,
    expiresAt: EXPIRES_AT,
  }));
  const finalize = vi.fn(async () => ({ kind: "committed" as const, documentId: randomUUID() }));
  const handle = vi.fn(async (options: Parameters<NonNullable<DocumentUploadRouteDependencies["handle"]>>[0]) => {
    if (options.body.type === "blob.generate-client-token") {
      const configuration = await options.onBeforeGenerateToken(
        options.body.payload.pathname,
        options.body.payload.clientPayload,
        options.body.payload.multipart
      );
      return { type: "blob.generate-client-token" as const, clientToken: JSON.stringify(configuration) };
    }
    await options.onUploadCompleted?.(options.body.payload);
    return { type: "blob.upload-completed" as const, response: "ok" as const };
  });
  const handler = createDocumentUploadPostHandler({
    intake: { reserve, finalize },
    handle,
    ...overrides,
  });
  return { handler, reserve, finalize, handle };
}

describe("document upload route (lote-12 T9)", () => {
  it("emite token somente depois de reservar a intenção validada", async () => {
    const { handler, reserve, handle } = fixture();
    const response = await handler(request(generateEvent()));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: "blob.generate-client-token" });
    expect(reserve).toHaveBeenCalledWith(input);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  // lote-12 — T23: o cliente precisa da chave reservada para subir, porque o
  // token só autoriza esse caminho e ele é escolhido pelo servidor. Sem isso o
  // navegador apontaria para o próprio pathname e o provedor recusaria.
  it("devolve a chave reservada junto do token, para o cliente subir no caminho autorizado", async () => {
    const { handler } = fixture();
    const response = await handler(request(generateEvent(JSON.stringify(input), "nome-do-usuario.txt")));

    const body = (await response.json()) as { pathname: string; clientToken: string };
    expect(body.pathname).toBe(KEY);
    expect(body.clientToken).toBeDefined();
  });

  it("a chave devolvida nunca é o pathname que o navegador mandou", async () => {
    const { handler } = fixture();
    const response = await handler(request(generateEvent(JSON.stringify(input), "../../tentativa-de-injecao")));

    const body = (await response.json()) as { pathname: string };
    expect(body.pathname).toBe(KEY);
    expect(body.pathname).not.toContain("tentativa-de-injecao");
  });

  it("substitui o pathname fornecido pelo navegador pela chave opaca reservada", async () => {
    const { handler, handle } = fixture();
    await handler(request(generateEvent(JSON.stringify(input), "../../tentativa-de-injecao")));

    expect(handle.mock.calls[0][0].body).toMatchObject({ payload: { pathname: KEY, clientPayload: null } });
  });

  it("fixa MIME, tamanho, validade, sem sobrescrita e intent assinado no token", async () => {
    const { handler } = fixture();
    const response = await handler(request(generateEvent()));
    const body = (await response.json()) as { clientToken: string };
    expect(JSON.parse(body.clientToken)).toMatchObject({
      allowedContentTypes: ["text/plain"],
      maximumSizeInBytes: 28,
      validUntil: EXPIRES_AT.getTime(),
      addRandomSuffix: false,
      allowOverwrite: false,
      tokenPayload: JSON.stringify({ intentId: INTENT_ID }),
    });
  });

  it("recusa corpo que não é evento do Blob", async () => {
    const { handler, reserve, handle } = fixture();
    const response = await handler(request({ type: "other", payload: {} }));

    expect(response.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("recusa geração sem clientPayload", async () => {
    const { handler, reserve } = fixture();
    const response = await handler(request(generateEvent(null)));

    expect(response.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("recusa JSON de clientPayload malformado", async () => {
    const { handler, reserve } = fixture();
    const response = await handler(request(generateEvent("{")));

    expect(response.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("recusa campos de upload com tipos inseguros antes da reserva", async () => {
    const { handler, reserve } = fixture();
    const response = await handler(request(generateEvent(JSON.stringify({ ...input, sizeBytes: "28" }))));

    expect(response.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("não emite token para usuário sem documentos:escrever", async () => {
    const { handler, handle } = fixture({
      intake: {
        reserve: async () => {
          throw new PermissionDeniedError("documentos", "escrever");
        },
        finalize: async () => ({ kind: "not_found" }),
      },
    });
    const response = await handler(request(generateEvent()));

    expect(response.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it("não chama o Blob quando a intake invalida metadados", async () => {
    const { handler, handle } = fixture({
      intake: { reserve: async () => ({ kind: "invalid", code: "upload_input_invalid" }), finalize: async () => ({ kind: "not_found" }) },
    });
    const response = await handler(request(generateEvent()));

    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it("não emite segundo token para hash com intenção ativa", async () => {
    const { handler, handle } = fixture({
      intake: { reserve: async () => ({ kind: "duplicate_upload" }), finalize: async () => ({ kind: "not_found" }) },
    });
    const response = await handler(request(generateEvent()));

    expect(response.status).toBe(409);
    expect(handle).not.toHaveBeenCalled();
  });

  it("finaliza somente o intentId contido no callback assinado", async () => {
    const { handler, finalize } = fixture();
    const response = await handler(request(completedEvent()));

    expect(response.status).toBe(200);
    expect(finalize).toHaveBeenCalledWith(INTENT_ID);
  });

  it("aceita callback repetido e entrega ambas as chamadas à finalização idempotente", async () => {
    const { handler, finalize } = fixture();
    await handler(request(completedEvent()));
    await handler(request(completedEvent()));

    expect(finalize).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenNthCalledWith(1, INTENT_ID);
    expect(finalize).toHaveBeenNthCalledWith(2, INTENT_ID);
  });

  it("confirma callback mesmo quando a compensação será reconciliada pelo serviço", async () => {
    const pendingFinalize = vi.fn(async () => ({ kind: "compensation_pending" as const }));
    const { handler } = fixture({
      intake: { reserve: async () => ({ kind: "duplicate_upload" }), finalize: pendingFinalize },
    });
    const response = await handler(request(completedEvent()));

    expect(response.status).toBe(200);
    expect(pendingFinalize).toHaveBeenCalledWith(INTENT_ID);
  });

  it("recusa callback sem intentId assinado sem tocar no repositório", async () => {
    const { handler, finalize } = fixture();
    const response = await handler(request(completedEvent("{}")));

    expect(response.status).toBe(400);
    expect(finalize).not.toHaveBeenCalled();
  });
});
