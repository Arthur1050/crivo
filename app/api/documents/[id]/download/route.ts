import { PermissionDeniedError, requirePermission, type AuthContext } from "../../../../../src/server/auth/session";
import { findDocumentForDownload, type DocumentDownload } from "../../../../../src/server/documents/repository";
import { DocumentStorageError, sanitizeDownloadFilename, type DocumentStorage } from "../../../../../src/server/documents/storage";
import { VercelBlobDocumentStorage } from "../../../../../src/server/documents/vercel-blob-storage";

export const runtime = "nodejs";
const secureHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const missing = () => Response.json({ error: "Documento não encontrado." }, { status: 404, headers: secureHeaders });

export function createDocumentDownloadGetHandler(deps: { authorize?: () => Promise<AuthContext>; find?: (tenantId: string, documentId: string, now: Date) => Promise<DocumentDownload | null>; storage?: Pick<DocumentStorage, "open">; now?: () => Date } = {}) {
  const authorize = deps.authorize ?? (() => requirePermission("documentos", "ler"));
  const find = deps.find ?? findDocumentForDownload;
  const storage = deps.storage ?? new VercelBlobDocumentStorage();
  const now = deps.now ?? (() => new Date());
  return async (_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    let auth: AuthContext;
    try { auth = await authorize(); } catch (error) {
      if (error instanceof PermissionDeniedError) return Response.json({ error: "Acesso negado." }, { status: 403, headers: secureHeaders });
      throw error;
    }
    const { id } = await context.params;
    const document = await find(auth.tenantId, id, now());
    if (!document) return missing();
    try {
      const opened = await storage.open(document.storageKey);
      if (!opened) return missing();
      const filename = sanitizeDownloadFilename(document.name);
      return new Response(opened.stream, { headers: { ...secureHeaders, "content-type": document.mimeType, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } });
    } catch (error) {
      if (error instanceof DocumentStorageError) return Response.json({ error: "Download indisponível." }, { status: 503, headers: secureHeaders });
      throw error;
    }
  };
}
export const GET = createDocumentDownloadGetHandler();
