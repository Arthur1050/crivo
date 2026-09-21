/**
 * Estado observável e ações disponíveis por linha da tabela de documentos
 * (lote-12 — T25). Puro e sem DOM, para que estado e papel sejam verificáveis
 * sem navegador.
 *
 * A autoridade continua sendo o servidor: esconder um botão é conveniência de
 * interface, nunca controle de acesso. Cada rota e action revalida permissão e
 * tenant por conta própria.
 */

export type DocumentStatus = "processando" | "pronto" | "falha" | "fora_do_agente";

/**
 * `expirado` não existe no banco: ele é derivado do instante da leitura. Um
 * documento vence no mesmo instante lógico em que `expiresAt` é alcançado,
 * mesmo que a rotina diária ainda não tenha rodado.
 */
export type DocumentRowState =
  | "processando"
  | "pronto"
  | "falha"
  | "fora_do_agente"
  | "expirado";

export interface DocumentRowInput {
  status: DocumentStatus;
  expiresAt: Date | string | null;
  failureCode?: string | null;
}

export interface DocumentStatePresentation {
  state: DocumentRowState;
  label: string;
  variant: "success" | "warning" | "error" | "accent" | "neutral";
  description: string;
}

const PRESENTATION: Record<DocumentRowState, Omit<DocumentStatePresentation, "state">> = {
  processando: {
    label: "Processando",
    variant: "accent",
    description: "O texto está sendo extraído. O original já pode ser baixado.",
  },
  pronto: {
    label: "Pronto",
    variant: "success",
    description: "O conteúdo está disponível para o agente.",
  },
  falha: {
    label: "Falha",
    variant: "error",
    description: "A extração não produziu texto. O original continua disponível.",
  },
  fora_do_agente: {
    label: "Fora do agente",
    variant: "warning",
    description: "O conteúdo excede o limite do contexto e não é enviado ao agente.",
  },
  expirado: {
    label: "Expirado",
    variant: "neutral",
    description: "A validade foi alcançada; o documento não é mais usado nem acessível.",
  },
};

function hasExpired(expiresAt: Date | string | null, now: Date): boolean {
  if (expiresAt === null) return false;
  const instant = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(instant.getTime())) return false;
  // Alcançar o instante já expira: o mesmo boundary da rotina diária.
  return instant.getTime() <= now.getTime();
}

export function deriveDocumentState(
  document: DocumentRowInput,
  now: Date = new Date()
): DocumentStatePresentation {
  const state: DocumentRowState = hasExpired(document.expiresAt, now)
    ? "expirado"
    : document.status;
  return { state, ...PRESENTATION[state] };
}

export interface DocumentRowActions {
  canPreview: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canRetry: boolean;
  canDelete: boolean;
}

/**
 * `canWrite` reflete `documentos:escrever`. Corretor só lê: preview e download
 * quando o estado permite, nunca editar, reprocessar ou excluir.
 *
 * Preview existe apenas onde há texto extraído — `processando` e `falha` não
 * têm o que mostrar. Download vale enquanto o original existir, inclusive em
 * `falha`, que é justamente quando recuperar o arquivo importa.
 */
export function deriveRowActions(
  state: DocumentRowState,
  canWrite: boolean
): DocumentRowActions {
  if (state === "expirado") {
    return {
      canPreview: false,
      canDownload: false,
      canEdit: false,
      canRetry: false,
      canDelete: canWrite,
    };
  }

  const hasExtractedText = state === "pronto" || state === "fora_do_agente";
  return {
    canPreview: hasExtractedText,
    canDownload: true,
    canEdit: canWrite,
    canRetry: canWrite && state === "falha",
    canDelete: canWrite,
  };
}

/** Caminho do download autenticado; o original nunca é exposto por URL do provedor. */
export function documentDownloadPath(documentId: string) {
  return `/api/documents/${encodeURIComponent(documentId)}/download`;
}

const SAFE_FAILURE_MESSAGES: Record<string, string> = {
  EXTRACTION_NO_TEXT: "O arquivo não tem texto nativo que possa ser extraído.",
  EXTRACTION_UNSUPPORTED: "O formato do arquivo não permite extração de texto.",
  EXTRACTION_TOO_LARGE: "O arquivo tem estrutura grande demais para ser extraída com segurança.",
  STORAGE_OBJECT_ABSENT: "O original não foi encontrado no armazenamento.",
  STORAGE_TRANSIENT_FAILURE: "O armazenamento esteve indisponível. Tente reprocessar.",
  STORAGE_PERMANENT_FAILURE: "O armazenamento recusou a leitura do original.",
};

/**
 * Traduz o código de falha para uma frase de produto. Um código desconhecido
 * nunca é exibido cru: ele poderia carregar detalhe de provedor ou caminho.
 */
export function describeFailure(failureCode: string | null | undefined): string {
  if (!failureCode) return "A extração falhou por um motivo não registrado.";
  return (
    SAFE_FAILURE_MESSAGES[failureCode] ??
    "A extração falhou. Tente reprocessar; se persistir, envie o arquivo novamente."
  );
}
