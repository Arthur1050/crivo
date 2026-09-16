import { PermissionDeniedError, requirePermission, type AuthContext } from "../../../../../src/server/auth/session";
import { findDocumentTextPreview, type DocumentTextPreview } from "../../../../../src/server/documents/repository";

export const runtime = "nodejs";

const headers = { "cache-control": "no-store" };
const notFound = () => Response.json({ error: "Documento não encontrado." }, { status: 404, headers });

export interface DocumentPreviewRouteDependencies {
  authorize?: () => Promise<AuthContext>;
  find?: (tenantId: string, documentId: string, now: Date) => Promise<DocumentTextPreview | null>;
  now?: () => Date;
}

/** Returns extracted text only after tenant-scoped read authorization. */
export function createDocumentPreviewGetHandler(
  dependencies: DocumentPreviewRouteDependencies = {}
) {
  const authorize = dependencies.authorize ?? (() => requirePermission("documentos", "ler"));
  const find = dependencies.find ?? findDocumentTextPreview;
  const now = dependencies.now ?? (() => new Date());

  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    let auth: AuthContext;
    try {
      auth = await authorize();
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return Response.json({ error: "Acesso negado." }, { status: 403, headers });
      }
      throw error;
    }

    const { id } = await context.params;
    const document = await find(auth.tenantId, id, now());
    if (!document) return notFound();

    if (document.status === "fora_do_agente") {
      return Response.json({
        status: document.status,
        text: document.extractedText,
        warning: "Este documento está fora do contexto do agente por limite de conteúdo.",
      }, { headers });
    }
    return Response.json({ status: document.status, text: document.extractedText }, { headers });
  };
}

export const GET = createDocumentPreviewGetHandler();
