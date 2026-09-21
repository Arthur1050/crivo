/**
 * Busca do texto extraído para o preview (lote-12 — T24). Isolada do
 * componente para ser testável sem DOM.
 *
 * O texto nunca viaja na listagem: ele só é pedido quando o usuário abre o
 * preview daquele documento.
 */

export type DocumentPreviewStatus = "pronto" | "fora_do_agente";

export type DocumentPreview =
  | { ok: true; status: DocumentPreviewStatus; text: string; warning?: string }
  | { ok: false; message: string };

const MESSAGES = {
  notFound: "Documento não encontrado ou já removido.",
  forbidden: "Você não tem permissão para visualizar este documento.",
  unavailable: "Não foi possível carregar o texto agora. Tente novamente.",
  network: "Não foi possível falar com o servidor. Verifique a conexão.",
} as const;

export function documentPreviewPath(documentId: string) {
  return `/api/documents/${encodeURIComponent(documentId)}/preview`;
}

export async function fetchDocumentPreview(
  documentId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DocumentPreview> {
  let response: Response;
  try {
    response = await fetchImpl(documentPreviewPath(documentId), {
      headers: { accept: "application/json" },
    });
  } catch {
    return { ok: false, message: MESSAGES.network };
  }

  if (response.status === 404) return { ok: false, message: MESSAGES.notFound };
  if (response.status === 403) return { ok: false, message: MESSAGES.forbidden };
  if (!response.ok) return { ok: false, message: MESSAGES.unavailable };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: MESSAGES.unavailable };
  }

  const record = body as { status?: unknown; text?: unknown; warning?: unknown } | null;
  if (
    typeof record?.text !== "string" ||
    (record.status !== "pronto" && record.status !== "fora_do_agente")
  ) {
    return { ok: false, message: MESSAGES.unavailable };
  }

  return {
    ok: true,
    status: record.status,
    text: record.text,
    warning: typeof record.warning === "string" ? record.warning : undefined,
  };
}
