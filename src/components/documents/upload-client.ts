/**
 * Lógica de upload do navegador, isolada do componente para ser testável sem
 * DOM (lote-12 — T23). O binário nunca passa por server action: o hash é
 * calculado aqui, o token é pedido à rota e o arquivo sobe direto ao storage
 * privado.
 */

export type UploadModality = "novo" | "usado" | "ambos";

export interface UploadTicketInput {
  clientSha256: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modality: UploadModality;
  categoryId?: string | null;
  expiresAt?: string | null;
}

export type UploadFailureCode =
  | "duplicate_upload"
  | "upload_forbidden"
  | "upload_input_invalid"
  | "upload_payload_invalid"
  | "upload_unavailable"
  | "upload_network_error";

/**
 * Mensagens de produto para cada recusa. A duplicata é a única que orienta uma
 * ação concreta, porque é a única em que já existe um documento a editar.
 */
export const UPLOAD_FAILURE_MESSAGES: Record<UploadFailureCode, string> = {
  duplicate_upload:
    "Este arquivo já foi enviado nesta imobiliária. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.",
  upload_forbidden: "Você não tem permissão para enviar documentos.",
  upload_input_invalid:
    "O arquivo não passou na validação do servidor. Confira tipo, tamanho e validade.",
  upload_payload_invalid:
    "O arquivo não passou na validação do servidor. Confira tipo, tamanho e validade.",
  upload_unavailable:
    "O armazenamento está indisponível no momento. Tente enviar novamente.",
  upload_network_error:
    "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.",
};

export type UploadTicket =
  | { ok: true; clientToken: string; pathname: string }
  | { ok: false; code: UploadFailureCode; message: string };

function failure(code: UploadFailureCode): UploadTicket {
  return { ok: false, code, message: UPLOAD_FAILURE_MESSAGES[code] };
}

const KNOWN_CODES = new Set<string>(Object.keys(UPLOAD_FAILURE_MESSAGES));

function codeFromBody(body: unknown, status: number): UploadFailureCode {
  if (typeof body === "object" && body !== null) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === "string" && KNOWN_CODES.has(value)) {
      return value as UploadFailureCode;
    }
  }
  if (status === 409) return "duplicate_upload";
  if (status === 403) return "upload_forbidden";
  if (status === 400) return "upload_payload_invalid";
  return "upload_unavailable";
}

export const UPLOAD_ENDPOINT = "/api/documents/upload";

/**
 * Pede o token de upload lendo status e corpo da própria resposta.
 *
 * O helper `upload()` do SDK não serve aqui por dois motivos: ele descarta o
 * status e o corpo da rota, tornando impossível distinguir duplicata de
 * permissão negada; e ele sobe para o `pathname` que o chamador passou,
 * enquanto a rota — corretamente — emite o token para a chave opaca que ela
 * mesma reservou. Por isso o pathname reservado volta na resposta e é ele que
 * o `put` usa.
 */
export async function requestUploadTicket(
  input: UploadTicketInput,
  fetchImpl: typeof fetch = fetch
): Promise<UploadTicket> {
  let response: Response;
  try {
    response = await fetchImpl(UPLOAD_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          // A rota ignora este caminho e usa a chave que reservou; ele existe
          // só para satisfazer o formato do evento.
          pathname: input.name,
          clientPayload: JSON.stringify(input),
          multipart: false,
        },
      }),
    });
  } catch {
    return failure("upload_network_error");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) return failure(codeFromBody(body, response.status));

  const record = body as { clientToken?: unknown; pathname?: unknown } | null;
  if (typeof record?.clientToken !== "string" || typeof record?.pathname !== "string") {
    return failure("upload_unavailable");
  }
  return { ok: true, clientToken: record.clientToken, pathname: record.pathname };
}

/** SHA-256 do arquivo, em hex — a mesma identidade que o servidor reconfere. */
export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Fases observáveis do envio; cada uma tem texto próprio na interface. */
export type UploadPhase = "idle" | "hashing" | "uploading" | "finalizing";

export const UPLOAD_PHASE_LABELS: Record<Exclude<UploadPhase, "idle">, string> = {
  hashing: "Validando arquivo",
  uploading: "Enviando",
  finalizing: "Preparando processamento",
};
