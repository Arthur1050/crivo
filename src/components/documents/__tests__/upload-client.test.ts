import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  UPLOAD_ENDPOINT,
  UPLOAD_FAILURE_MESSAGES,
  UPLOAD_PHASE_LABELS,
  hashFile,
  requestUploadTicket,
  type UploadTicketInput,
} from "../upload-client";

const input: UploadTicketInput = {
  clientSha256: "a".repeat(64),
  name: "politica.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  modality: "novo",
  categoryId: null,
  expiresAt: null,
};

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("upload-client (lote-12 T23)", () => {
  describe("requestUploadTicket", () => {
    it("devolve token e a chave reservada pelo servidor", async () => {
      const result = await requestUploadTicket(
        input,
        respond(200, { clientToken: "vercel_blob_client_x", pathname: "documents/v1/t/opaca" })
      );
      expect(result).toEqual({
        ok: true,
        clientToken: "vercel_blob_client_x",
        pathname: "documents/v1/t/opaca",
      });
    });

    it("envia o payload do cliente serializado para a rota de upload", async () => {
      const fetchImpl = respond(200, { clientToken: "t", pathname: "p" });
      await requestUploadTicket(input, fetchImpl);

      const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(UPLOAD_ENDPOINT);
      const sent = JSON.parse(init.body as string);
      expect(sent.type).toBe("blob.generate-client-token");
      expect(JSON.parse(sent.payload.clientPayload)).toMatchObject({
        clientSha256: input.clientSha256,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        modality: "novo",
      });
    });

    it("o binário nunca é enviado nessa requisição", async () => {
      const fetchImpl = respond(200, { clientToken: "t", pathname: "p" });
      await requestUploadTicket(input, fetchImpl);
      const [, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
      expect(typeof init.body).toBe("string");
      expect(init.body as string).not.toContain("Blob");
      expect((init.body as string).length).toBeLessThan(2000);
    });

    it("409 vira duplicata com orientação para editar o documento existente", async () => {
      const result = await requestUploadTicket(input, respond(409, { error: "duplicate_upload" }));
      expect(result).toMatchObject({ ok: false, code: "duplicate_upload" });
      expect((result as { message: string }).message).toContain("Abra o documento existente");
    });

    it("403 vira permissão negada, não duplicata", async () => {
      const result = await requestUploadTicket(input, respond(403, { error: "upload_forbidden" }));
      expect(result).toMatchObject({ ok: false, code: "upload_forbidden" });
    });

    it("400 com upload_input_invalid preserva o código da validação do servidor", async () => {
      const result = await requestUploadTicket(input, respond(400, { error: "upload_input_invalid" }));
      expect(result).toMatchObject({ ok: false, code: "upload_input_invalid" });
    });

    it("500 vira indisponibilidade retentável", async () => {
      const result = await requestUploadTicket(input, respond(500, { error: "upload_unavailable" }));
      expect(result).toMatchObject({ ok: false, code: "upload_unavailable" });
    });

    it("erro sem corpo reconhecível cai no status como fonte da classificação", async () => {
      const result = await requestUploadTicket(input, respond(409, { error: "algo-desconhecido" }));
      expect(result).toMatchObject({ ok: false, code: "duplicate_upload" });
    });

    it("corpo que não é JSON não derruba a classificação", async () => {
      const fetchImpl = vi.fn(async () =>
        new Response("<html>502</html>", { status: 500 })
      ) as unknown as typeof fetch;
      const result = await requestUploadTicket(input, fetchImpl);
      expect(result).toMatchObject({ ok: false, code: "upload_unavailable" });
    });

    it("falha de rede é distinguida de recusa do servidor", async () => {
      const fetchImpl = vi.fn(async () => { throw new TypeError("network"); }) as unknown as typeof fetch;
      const result = await requestUploadTicket(input, fetchImpl);
      expect(result).toMatchObject({ ok: false, code: "upload_network_error" });
    });

    it("resposta 200 sem pathname é tratada como indisponibilidade, nunca como sucesso", async () => {
      const result = await requestUploadTicket(input, respond(200, { clientToken: "t" }));
      expect(result).toMatchObject({ ok: false, code: "upload_unavailable" });
    });

    it("resposta 200 sem token é tratada como indisponibilidade", async () => {
      const result = await requestUploadTicket(input, respond(200, { pathname: "p" }));
      expect(result).toMatchObject({ ok: false, code: "upload_unavailable" });
    });

    it("nenhuma mensagem de recusa vaza caminho, token ou detalhe do provedor", () => {
      for (const message of Object.values(UPLOAD_FAILURE_MESSAGES)) {
        expect(message).not.toMatch(/vercel|blob|token|http|documents\/v1/i);
      }
    });
  });

  describe("hashFile", () => {
    it("produz o mesmo SHA-256 que o servidor reconfere", async () => {
      const bytes = new TextEncoder().encode("conteúdo da política");
      const esperado = createHash("sha256").update(bytes).digest("hex");
      await expect(hashFile(new Blob([bytes]))).resolves.toBe(esperado);
    });

    it("devolve 64 caracteres hexadecimais minúsculos", async () => {
      const digest = await hashFile(new Blob([new Uint8Array([0, 255, 16])]));
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("arquivo vazio ainda produz digest estável", async () => {
      const esperado = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
      await expect(hashFile(new Blob([]))).resolves.toBe(esperado);
    });

    it("conteúdos diferentes produzem digests diferentes", async () => {
      const a = await hashFile(new Blob([new TextEncoder().encode("a")]));
      const b = await hashFile(new Blob([new TextEncoder().encode("b")]));
      expect(a).not.toBe(b);
    });
  });

  it("as três fases observáveis têm rótulo próprio", () => {
    expect(UPLOAD_PHASE_LABELS).toEqual({
      hashing: "Validando arquivo",
      uploading: "Enviando",
      finalizing: "Preparando processamento",
    });
  });
});
