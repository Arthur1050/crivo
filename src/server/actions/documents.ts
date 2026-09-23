"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import {
  createDocument,
  createDocumentCategory,
  deleteDocumentCategory,
  updateDocument,
  updateDocumentCategory,
  type CategoryColor,
  type Modality,
} from "../data";
import {
  validateCategoryColor,
  validateFileSize,
  validateMimeType,
  validateModality,
  validateName,
} from "../validation";
import { createDocumentProcessingService } from "../documents/processing";
import { reconcileTenantDocumentAdmission, tombstoneDocument } from "../documents/repository";
import { VercelBlobDocumentStorage } from "../documents/vercel-blob-storage";
import { startDocumentProcessingRun } from "../documents/workflow-start";
import { createDocumentUploadIntake } from "../documents/uploads";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Todas as actions abaixo resolvem o tenant ativo no servidor via
// `getActiveTenantId()` (nunca a partir de `input`) e usam as regras de
// `../validation` como única autoridade de validação antes de chamar a
// camada de dados (lote-2 — DOC-01/02/04/05/06/07).

export interface CreateDocumentInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
  modality: Modality;
  categoryId?: string | null;
}

export async function createDocumentAction(
  input: CreateDocumentInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const nameCheck = validateName(input.name, "Nome do documento");
  if (!nameCheck.ok) return nameCheck;

  const mimeCheck = validateMimeType(input.mimeType);
  if (!mimeCheck.ok) return mimeCheck;

  const sizeCheck = validateFileSize(input.sizeBytes);
  if (!sizeCheck.ok) return sizeCheck;

  const modalityCheck = validateModality(input.modality);
  if (!modalityCheck.ok) return modalityCheck;

  const tenantId = await getActiveTenantId();
  await createDocument(tenantId, {
    name: input.name.trim(),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    modality: input.modality,
    categoryId: input.categoryId ?? null,
  });

  revalidatePath("/documentos");
  return { ok: true };
}

export interface UpdateDocumentInput {
  documentId: string;
  name: string;
  modality: Modality;
  categoryId?: string | null;
  /** Omit preserves the existing date; an empty form field explicitly clears it. */
  expiresAt?: string;
}

function resolveExpiresAt(value: string | undefined, now = new Date()):
  | { ok: true; value: Date | null | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value.trim() === "") return { ok: true, value: null };
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "A validade informada é inválida." };
  }
  if (expiresAt <= now) {
    return { ok: false, error: "A validade deve estar no futuro." };
  }
  return { ok: true, value: expiresAt };
}

export async function updateDocumentAction(
  input: UpdateDocumentInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const nameCheck = validateName(input.name, "Nome do documento");
  if (!nameCheck.ok) return nameCheck;

  const modalityCheck = validateModality(input.modality);
  if (!modalityCheck.ok) return modalityCheck;

  const expiry = resolveExpiresAt(input.expiresAt);
  if (!expiry.ok) return expiry;

  const tenantId = await getActiveTenantId();
  const updated = await updateDocument(tenantId, input.documentId, {
    name: input.name.trim(),
    modality: input.modality,
    categoryId: input.categoryId,
    ...(expiry.value === undefined ? {} : { expiresAt: expiry.value }),
  });

  if (!updated) {
    return { ok: false, error: "Documento não encontrado." };
  }

  await reconcileTenantDocumentAdmission(tenantId);
  revalidatePath("/documentos");
  return { ok: true };
}

export interface DeleteDocumentInput {
  documentId: string;
}

export async function deleteDocumentAction(
  input: DeleteDocumentInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const tenantId = await getActiveTenantId();
  const deleted = await tombstoneDocument(tenantId, input.documentId);

  if (deleted === "not_found") {
    return { ok: false, error: "Documento não encontrado." };
  }

  await reconcileTenantDocumentAdmission(tenantId);
  revalidatePath("/documentos");
  return { ok: true };
}

const FINALIZE_WAIT_TRIES = 8;
const FINALIZE_WAIT_MS = 500;

export interface FinalizeDocumentUploadInput {
  intentId: string;
}

/**
 * Finaliza pelo navegador o upload que o provedor também confirma por
 * callback. Os dois caminhos chamam o mesmo serviço idempotente; o que chegar
 * primeiro grava o documento e o outro devolve o mesmo resultado.
 */
export async function finalizeDocumentUploadAction(
  input: FinalizeDocumentUploadInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const intake = createDocumentUploadIntake();
  let result = await intake.finalizeForActor(input.intentId);
  // `not_finalizable` é o callback do provedor verificando o mesmo upload em
  // paralelo. A verificação leva poucos segundos; esperar aqui é o que permite
  // contar ao usuário se o arquivo entrou ou foi recusado.
  for (let tentativa = 0; result.kind === "not_finalizable" && tentativa < FINALIZE_WAIT_TRIES; tentativa += 1) {
    await new Promise((resolve) => setTimeout(resolve, FINALIZE_WAIT_MS));
    result = await intake.finalizeForActor(input.intentId);
  }
  revalidatePath("/documentos");

  if (result.kind === "committed" || result.kind === "not_finalizable") {
    // Se o callback ainda não concluiu depois da espera, o documento aparece
    // quando ele terminar; não há recusa conhecida para mostrar.
    return { ok: true };
  }
  if (result.kind === "duplicate_content") {
    return {
      ok: false,
      error:
        "Este arquivo já foi enviado nesta imobiliária. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.",
    };
  }
  if (result.kind === "rejected") {
    return {
      ok: false,
      error:
        "O arquivo não passou na verificação do servidor: o conteúdo não corresponde ao tipo informado. Confira o arquivo e envie novamente.",
    };
  }
  return { ok: false, error: "Não foi possível concluir o envio. Tente novamente." };
}

export interface RetryDocumentInput {
  documentId: string;
}

/** Claims a single retry attempt before scheduling it, so concurrent clicks share state. */
export async function retryDocumentAction(
  input: RetryDocumentInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const tenantId = await getActiveTenantId();
  const service = createDocumentProcessingService({
    storage: new VercelBlobDocumentStorage(),
    start: startDocumentProcessingRun,
  });
  const result = await service.retry({ tenantId, documentId: input.documentId });
  if (result.kind === "stale") return { ok: false, error: "Documento não encontrado." };
  if (result.kind === "dispatch_failed" || result.kind === "failed") {
    return { ok: false, error: "Não foi possível processar agora. Tente novamente." };
  }

  revalidatePath("/documentos");
  return { ok: true };
}

export interface CreateDocumentCategoryInput {
  name: string;
  color?: string;
}

export async function createDocumentCategoryAction(
  input: CreateDocumentCategoryInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const nameCheck = validateName(input.name, "Nome da categoria");
  if (!nameCheck.ok) return nameCheck;

  if (input.color !== undefined) {
    const colorCheck = validateCategoryColor(input.color);
    if (!colorCheck.ok) return colorCheck;
  }

  const tenantId = await getActiveTenantId();
  const result = await createDocumentCategory(
    tenantId,
    input.name.trim(),
    input.color as CategoryColor | undefined
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/documentos");
  return { ok: true };
}

export interface UpdateDocumentCategoryInput {
  categoryId: string;
  color: string;
}

/**
 * Atualiza a cor de uma categoria existente pelo gerenciador (lote-3 —
 * CAT-01.4). `validateCategoryColor` é a autoridade de validação (o enum do
 * banco é a segunda barreira, design.md — Error Handling Strategy).
 */
export async function updateDocumentCategoryAction(
  input: UpdateDocumentCategoryInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const colorCheck = validateCategoryColor(input.color);
  if (!colorCheck.ok) return colorCheck;

  const tenantId = await getActiveTenantId();
  const updated = await updateDocumentCategory(tenantId, input.categoryId, {
    color: input.color as CategoryColor,
  });

  if (!updated) {
    return { ok: false, error: "Categoria não encontrada." };
  }

  revalidatePath("/documentos");
  return { ok: true };
}

export interface DeleteDocumentCategoryInput {
  categoryId: string;
}

export async function deleteDocumentCategoryAction(
  input: DeleteDocumentCategoryInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return denied;

  const tenantId = await getActiveTenantId();
  const deleted = await deleteDocumentCategory(tenantId, input.categoryId);

  if (!deleted) {
    return { ok: false, error: "Categoria não encontrada." };
  }

  revalidatePath("/documentos");
  return { ok: true };
}
