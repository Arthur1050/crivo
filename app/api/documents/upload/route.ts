import { handleUpload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import { PermissionDeniedError } from "@/src/server/auth/session";
import {
  createDocumentUploadIntake,
  type CreateDocumentUploadInput,
} from "@/src/server/documents/uploads";

export const runtime = "nodejs";

type Intake = Pick<ReturnType<typeof createDocumentUploadIntake>, "reserve" | "finalize">;
type HandleUpload = typeof handleUpload;

type GenerateTokenEvent = {
  type: "blob.generate-client-token";
  payload: { pathname: string; clientPayload: string | null; multipart: boolean };
};

type UploadCompletedEvent = {
  type: "blob.upload-completed";
  payload: { blob: PutBlobResult; tokenPayload?: string | null };
};

type UploadEvent = GenerateTokenEvent | UploadCompletedEvent;

export interface DocumentUploadRouteDependencies {
  intake?: Intake;
  handle?: HandleUpload;
}

function safeError(status: number, code: string) {
  return Response.json({ error: code }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvent(value: unknown): UploadEvent | null {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const { payload } = value;
  if (
    value.type === "blob.generate-client-token" &&
    typeof payload.pathname === "string" &&
    (typeof payload.clientPayload === "string" || payload.clientPayload === null) &&
    typeof payload.multipart === "boolean"
  ) {
    return { type: value.type, payload: payload as GenerateTokenEvent["payload"] };
  }
  if (value.type === "blob.upload-completed" && "blob" in payload) {
    const tokenPayload = payload.tokenPayload;
    if (tokenPayload === undefined || tokenPayload === null || typeof tokenPayload === "string") {
      return { type: value.type, payload: payload as UploadCompletedEvent["payload"] };
    }
  }
  return null;
}

function parseInput(clientPayload: string | null): CreateDocumentUploadInput | null {
  if (!clientPayload) return null;
  try {
    const value: unknown = JSON.parse(clientPayload);
    if (!isRecord(value)) return null;
    const expiresAt =
      value.expiresAt === undefined || value.expiresAt === null
        ? value.expiresAt
        : typeof value.expiresAt === "string"
          ? new Date(value.expiresAt)
          : undefined;
    if (
      typeof value.clientSha256 !== "string" ||
      typeof value.name !== "string" ||
      typeof value.mimeType !== "string" ||
      typeof value.sizeBytes !== "number" ||
      (value.modality !== "novo" && value.modality !== "usado" && value.modality !== "ambos") ||
      (value.categoryId !== undefined && value.categoryId !== null && typeof value.categoryId !== "string") ||
      (expiresAt instanceof Date && Number.isNaN(expiresAt.getTime()))
    ) {
      return null;
    }
    return {
      clientSha256: value.clientSha256,
      name: value.name,
      mimeType: value.mimeType,
      sizeBytes: value.sizeBytes,
      modality: value.modality,
      categoryId: value.categoryId as string | null | undefined,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function parseIntentId(tokenPayload: string | null | undefined) {
  if (!tokenPayload) return null;
  try {
    const value: unknown = JSON.parse(tokenPayload);
    return isRecord(value) && typeof value.intentId === "string" ? value.intentId : null;
  } catch {
    return null;
  }
}

/**
 * Keeps client metadata untrusted: only `reserve` authorizes and validates it,
 * then the server replaces the browser pathname with the reserved opaque key.
 */
export function createDocumentUploadPostHandler(
  dependencies: DocumentUploadRouteDependencies = {}
) {
  const intake = dependencies.intake ?? createDocumentUploadIntake();
  const handle = dependencies.handle ?? handleUpload;

  return async function POST(request: Request) {
    let event: UploadEvent | null;
    try {
      event = parseEvent(await request.json());
    } catch {
      return safeError(400, "upload_payload_invalid");
    }
    if (!event) return safeError(400, "upload_payload_invalid");

    if (event.type === "blob.generate-client-token") {
      const input = parseInput(event.payload.clientPayload);
      if (!input) return safeError(400, "upload_payload_invalid");
      try {
        const reserved = await intake.reserve(input);
        if (reserved.kind === "invalid") return safeError(400, reserved.code);
        if (reserved.kind === "duplicate_upload") return safeError(409, "duplicate_upload");

        const generated = await handle({
          request,
          body: {
            type: "blob.generate-client-token",
            payload: { pathname: reserved.storageKey, clientPayload: null, multipart: event.payload.multipart },
          },
          onBeforeGenerateToken: async (pathname) => {
            if (pathname !== reserved.storageKey) throw new Error("untrusted pathname");
            return {
              allowedContentTypes: [reserved.contentType],
              maximumSizeInBytes: reserved.contentLength,
              validUntil: reserved.expiresAt.getTime(),
              addRandomSuffix: false,
              allowOverwrite: false,
              tokenPayload: JSON.stringify({ intentId: reserved.intentId }),
            };
          },
          onUploadCompleted: async ({ tokenPayload }) => {
            const intentId = parseIntentId(tokenPayload);
            if (!intentId) throw new Error("missing signed intent");
            await intake.finalize(intentId);
          },
        });
        // A chave reservada volta junto do token porque o cliente não tem como
        // adivinhá-la, e o token só autoriza esse caminho. Sem isso o upload
        // apontaria para o pathname escolhido pelo navegador e o provedor o
        // recusaria por divergência. Não é vazamento: o objeto é privado e o
        // cliente precisa da chave para subir.
        return Response.json({ ...generated, pathname: reserved.storageKey });
      } catch (error) {
        if (error instanceof PermissionDeniedError) return safeError(403, "upload_forbidden");
        return safeError(500, "upload_unavailable");
      }
    }

    try {
      const completed = await handle({
        request,
        body: event,
        onBeforeGenerateToken: async () => {
          throw new Error("unexpected token generation");
        },
        onUploadCompleted: async ({ tokenPayload }) => {
          const intentId = parseIntentId(tokenPayload);
          if (!intentId) throw new Error("missing signed intent");
          await intake.finalize(intentId);
        },
      });
      return Response.json(completed);
    } catch {
      return safeError(400, "upload_callback_invalid");
    }
  };
}

export const POST = createDocumentUploadPostHandler();
