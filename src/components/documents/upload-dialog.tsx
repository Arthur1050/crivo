"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon, UploadIcon } from "lucide-react";
import { put } from "@vercel/blob/client";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  createDocumentCategoryAction,
  finalizeDocumentUploadAction,
} from "@/src/server/actions/documents";
import type { CategoryColor, DocumentCategory, Modality } from "@/src/server/data";
import {
  CATEGORY_COLOR_PALETTE,
  MAX_FILE_SIZE_BYTES,
  validateFileSize,
  validateMimeType,
  validateModality,
  validateName,
} from "@/src/server/validation";
import {
  UPLOAD_PHASE_LABELS,
  hashFile,
  requestUploadTicket,
  type UploadPhase,
} from "./upload-client";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md,.csv";

// Alguns navegadores não preenchem `File.type` para certas extensões (ex.:
// .md costuma chegar com type=""). Mantemos uma extensão-para-MIME de
// fallback só para as extensões aceitas, sem inventar tipos fora da lista.
const EXTENSION_MIME_FALLBACK: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (extension && EXTENSION_MIME_FALLBACK[extension]) || "";
}

interface FieldErrors {
  file?: string;
  name?: string;
  modality?: string;
  expiresAt?: string;
}

/** O envio é progressivo; 0–100 só tem significado na fase de upload. */
interface UploadProgress {
  phase: UploadPhase;
  percentage: number;
}

interface UploadDialogProps {
  categories: DocumentCategory[];
}

/**
 * Dialog de upload metadata-only (lote-2 — DOC-02/03/06): extrai apenas
 * `name`/`type`/`size` do `File` selecionado — o binário nunca é lido nem
 * enviado para a action, apenas os metadados. Também permite criar uma
 * categoria nova sem sair do fluxo de upload.
 */
export function UploadDialog({ categories }: UploadDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [isNameTouched, setIsNameTouched] = useState(false);
  const [modality, setModality] = useState<Modality | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<ISODateTimeString | undefined>(undefined);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle", percentage: 0 });
  const isSubmitting = progress.phase !== "idle";

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<CategoryColor>("gray");
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [pendingCategoryName, setPendingCategoryName] = useState<string | null>(
    null
  );
  const [isCreatingCategoryPending, setIsCreatingCategoryPending] =
    useState(false);

  // Depois de criar uma categoria a action só confirma {ok:true} (não
  // devolve o registro criado). Em vez de sincronizar isso via efeito,
  // derivamos a categoria selecionada a cada render: assim que o refresh
  // trouxer `categories` atualizado com o nome recém-criado, o valor
  // resolvido já reflete a nova categoria sem setState em cascata.
  const resolvedCategoryId =
    categoryId ??
    (pendingCategoryName
      ? categories.find(
          (category) =>
            category.name.toLowerCase() === pendingCategoryName.toLowerCase()
        )?.id ?? null
      : null);

  // Enquanto `pendingCategoryName` aponta para uma categoria recém-criada que
  // ainda não apareceu em `categories` (o `router.refresh()` acima roda em
  // paralelo, sem await), `resolvedCategoryId` fica `null` mesmo que o
  // usuário tenha acabado de escolher aquela categoria. Sem essa guarda,
  // "Enviar" ficaria clicável nessa janela e o documento seria criado com
  // `categoryId: null` ("Sem categoria") silenciosamente.
  const isPendingCategoryUnresolved =
    pendingCategoryName !== null &&
    !categories.some(
      (category) => category.name.toLowerCase() === pendingCategoryName.toLowerCase()
    );

  function resetForm() {
    setFile(null);
    setName("");
    setIsNameTouched(false);
    setModality(null);
    setCategoryId(null);
    setExpiresAt(undefined);
    setPendingCategoryName(null);
    setErrors({});
    setBanner(null);
    setProgress({ phase: "idle", percentage: 0 });
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setNewCategoryColor("gray");
    setCategoryError(undefined);
  }

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) resetForm();
  }

  function handleFileChange(nextFile: File | File[] | null) {
    const singleFile = Array.isArray(nextFile) ? nextFile[0] ?? null : nextFile;
    setFile(singleFile);
    setErrors((prev) => ({ ...prev, file: undefined }));
    if (singleFile && !isNameTouched) {
      setName(singleFile.name);
    }
  }

  async function handleSubmit() {
    setBanner(null);

    if (!file) {
      setErrors((prev) => ({ ...prev, file: "Selecione um arquivo." }));
      return;
    }

    const mimeType = resolveMimeType(file);
    const nameCheck = validateName(name, "Nome do documento");
    const mimeCheck = validateMimeType(mimeType);
    const sizeCheck = validateFileSize(file.size);
    const modalityCheck = validateModality(modality);
    const isExpiryInPast =
      expiresAt !== undefined && new Date(expiresAt).getTime() <= Date.now();

    const nextErrors: FieldErrors = {
      name: nameCheck.ok ? undefined : nameCheck.error,
      file: !mimeCheck.ok ? mimeCheck.error : !sizeCheck.ok ? sizeCheck.error : undefined,
      modality: modalityCheck.ok ? undefined : modalityCheck.error,
      expiresAt: isExpiryInPast ? "A validade precisa ser uma data futura." : undefined,
    };

    if (nextErrors.name || nextErrors.file || nextErrors.modality || nextErrors.expiresAt) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    // Falha em qualquer ponto abaixo preserva arquivo e campos: o usuário
    // corrige e reenvia sem remontar o formulário.
    try {
      setProgress({ phase: "hashing", percentage: 0 });
      const clientSha256 = await hashFile(file);

      const ticket = await requestUploadTicket({
        clientSha256,
        name,
        mimeType,
        sizeBytes: file.size,
        modality: modality as Modality,
        categoryId: resolvedCategoryId,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (!ticket.ok) {
        setProgress({ phase: "idle", percentage: 0 });
        setBanner(ticket.message);
        return;
      }

      setProgress({ phase: "uploading", percentage: 0 });
      await put(ticket.pathname, file, {
        access: "private",
        token: ticket.clientToken,
        contentType: mimeType,
        onUploadProgress: ({ percentage }) =>
          setProgress({ phase: "uploading", percentage }),
      });

      // O provedor também confirma por callback assinado, mas ele é
      // assíncrono: sem pedir a finalização aqui, a lista poderia recarregar
      // antes do documento existir e ele só apareceria num reload manual.
      setProgress({ phase: "finalizing", percentage: 100 });
      const finalized = await finalizeDocumentUploadAction({ intentId: ticket.intentId });
      router.refresh();
      if (!finalized.ok) {
        setProgress({ phase: "idle", percentage: 0 });
        setBanner(finalized.error);
        return;
      }
      handleOpenChange(false);
    } catch {
      setProgress({ phase: "idle", percentage: 0 });
      setBanner(
        "O envio foi interrompido antes de concluir. O arquivo continua selecionado; tente novamente."
      );
    }
  }

  async function handleCreateCategory() {
    setCategoryError(undefined);
    const nameCheck = validateName(newCategoryName, "Nome da categoria");
    if (!nameCheck.ok) {
      setCategoryError(nameCheck.error);
      return;
    }

    setIsCreatingCategoryPending(true);
    const result = await createDocumentCategoryAction({
      name: newCategoryName,
      color: newCategoryColor,
    });
    setIsCreatingCategoryPending(false);

    if (!result.ok) {
      setCategoryError(result.error);
      return;
    }

    setPendingCategoryName(newCategoryName.trim());
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setNewCategoryColor("gray");
    router.refresh();
  }

  return (
    <>
      <Button
        label="Novo documento"
        variant="primary"
        icon={<UploadIcon size={16} />}
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} purpose="form" width={560}>
        {/*
          O conteúdo só monta com o dialog aberto, mesmo padrão do
          `EditDocumentDialog`. Além de evitar montar um formulário que
          ninguém pediu, isso tira o calendário do `DateTimeInput` do render
          de servidor: ele formata o nome do mês por locale e divergia entre
          servidor e cliente, quebrando a hidratação da página inteira.
        */}
        {isOpen && (
        <Layout
          header={
            <DialogHeader
              title="Novo documento"
              subtitle="O arquivo é enviado direto para o armazenamento privado da sua imobiliária."
              onOpenChange={() => handleOpenChange(false)}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4}>
                {banner && <Banner status="error" title={banner} />}

                {progress.phase !== "idle" && (
                  <ProgressBar
                    label={UPLOAD_PHASE_LABELS[progress.phase]}
                    value={progress.percentage}
                    hasValueLabel={progress.phase === "uploading"}
                    isIndeterminate={progress.phase !== "uploading"}
                    variant={progress.phase === "finalizing" ? "success" : "accent"}
                  />
                )}

                <FileInput
                  label="Arquivo"
                  value={file}
                  onChange={handleFileChange}
                  accept={ACCEPTED_EXTENSIONS}
                  // O default da lib é "Choose file", em inglês.
                  placeholder="Escolher arquivo"
                  description="PDF, DOCX, TXT, MD ou CSV, até 10MB"
                  maxSize={MAX_FILE_SIZE_BYTES}
                  status={errors.file ? { type: "error", message: errors.file } : undefined}
                  isRequired
                />

                <TextInput
                  label="Nome do documento"
                  value={name}
                  onChange={(value) => {
                    setName(value);
                    setIsNameTouched(true);
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  status={errors.name ? { type: "error", message: errors.name } : undefined}
                  isRequired
                />

                <Selector
                  label="Modalidade"
                  placeholder="Selecione a modalidade"
                  value={modality ?? ""}
                  onChange={(value) => {
                    setModality(value as Modality);
                    setErrors((prev) => ({ ...prev, modality: undefined }));
                  }}
                  options={MODALITY_OPTIONS}
                  status={
                    errors.modality ? { type: "error", message: errors.modality } : undefined
                  }
                  isRequired
                />

                <DateTimeInput
                  label="Validade"
                  description="Depois desse instante o documento deixa de ser usado pelo agente."
                  placeholder="Sem validade"
                  // O default da lib é "Select a time", em inglês.
                  timePlaceholder="Selecione a hora"
                  hourFormat="24h"
                  hasClear
                  isOptional
                  value={expiresAt}
                  onChange={(value) => {
                    setExpiresAt(value);
                    setErrors((prev) => ({ ...prev, expiresAt: undefined }));
                  }}
                  status={
                    errors.expiresAt ? { type: "error", message: errors.expiresAt } : undefined
                  }
                />

                <VStack gap={2}>
                  <Selector
                    label="Categoria"
                    placeholder="Sem categoria"
                    hasClear
                    value={resolvedCategoryId}
                    onChange={(value) => {
                      setCategoryId(value);
                      setPendingCategoryName(null);
                    }}
                    options={categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    }))}
                    renderOption={(option) => {
                      const category = categories.find((c) => c.id === option.value);
                      return (
                        <SelectorOption
                          label={
                            category ? (
                              <Token label={category.name} color={category.color} size="sm" />
                            ) : (
                              option.label
                            )
                          }
                        />
                      );
                    }}
                    isOptional
                  />

                  {isCreatingCategory ? (
                    <VStack gap={2}>
                      <HStack gap={2} vAlign="end">
                        <TextInput
                          label="Nova categoria"
                          value={newCategoryName}
                          onChange={setNewCategoryName}
                          status={
                            categoryError
                              ? { type: "error", message: categoryError }
                              : undefined
                          }
                        />
                        <Button
                          label="Criar"
                          variant="secondary"
                          isLoading={isCreatingCategoryPending}
                          clickAction={handleCreateCategory}
                        />
                        <Button
                          label="Cancelar"
                          variant="ghost"
                          onClick={() => {
                            setIsCreatingCategory(false);
                            setNewCategoryName("");
                            setNewCategoryColor("gray");
                            setCategoryError(undefined);
                          }}
                        />
                      </HStack>
                      <HStack gap={1} wrap="wrap">
                        {CATEGORY_COLOR_PALETTE.map((color) => (
                          <Token
                            key={color}
                            label={color}
                            color={color}
                            size="sm"
                            onClick={() => setNewCategoryColor(color)}
                            endContent={
                              newCategoryColor === color ? (
                                <Icon icon="check" size="xsm" />
                              ) : undefined
                            }
                          />
                        ))}
                      </HStack>
                    </VStack>
                  ) : (
                    <HStack>
                      <Button
                        label="Nova categoria"
                        variant="ghost"
                        size="sm"
                        icon={<PlusIcon size={16} />}
                        onClick={() => setIsCreatingCategory(true)}
                      />
                    </HStack>
                  )}
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancelar"
                  variant="secondary"
                  isDisabled={isSubmitting}
                  onClick={() => handleOpenChange(false)}
                />
                <Button
                  label={isSubmitting ? UPLOAD_PHASE_LABELS[progress.phase as Exclude<UploadPhase, "idle">] : "Enviar"}
                  variant="primary"
                  isLoading={isSubmitting}
                  isDisabled={isPendingCategoryUnresolved}
                  tooltip={
                    isPendingCategoryUnresolved
                      ? "Aguardando a categoria recém-criada ser confirmada."
                      : undefined
                  }
                  clickAction={handleSubmit}
                />
              </HStack>
            </LayoutFooter>
          }
        />
        )}
      </Dialog>
    </>
  );
}
