"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon, UploadIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  createDocumentAction,
  createDocumentCategoryAction,
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setPendingCategoryName(null);
    setErrors({});
    setBanner(null);
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

    const nextErrors: FieldErrors = {
      name: nameCheck.ok ? undefined : nameCheck.error,
      file: !mimeCheck.ok ? mimeCheck.error : !sizeCheck.ok ? sizeCheck.error : undefined,
      modality: modalityCheck.ok ? undefined : modalityCheck.error,
    };

    if (nextErrors.name || nextErrors.file || nextErrors.modality) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    const result = await createDocumentAction({
      name,
      mimeType,
      sizeBytes: file.size,
      modality: modality as Modality,
      categoryId: resolvedCategoryId,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.error.startsWith("Nome do documento")) {
        setErrors({ name: result.error });
      } else if (
        result.error.startsWith("Tipo de arquivo") ||
        result.error.startsWith("Arquivo excede")
      ) {
        setErrors({ file: result.error });
      } else if (result.error.startsWith("Modalidade")) {
        setErrors({ modality: result.error });
      } else {
        setBanner(result.error);
      }
      return;
    }

    router.refresh();
    handleOpenChange(false);
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
      <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} purpose="form" width={480}>
        <Layout
          header={
            <DialogHeader
              title="Novo documento"
              subtitle="Apenas os metadados são armazenados; o arquivo não é enviado."
              onOpenChange={() => handleOpenChange(false)}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4}>
                {banner && <Banner status="error" title={banner} />}

                <FileInput
                  label="Arquivo"
                  value={file}
                  onChange={handleFileChange}
                  accept={ACCEPTED_EXTENSIONS}
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
                  onClick={() => handleOpenChange(false)}
                />
                <Button
                  label="Enviar"
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
      </Dialog>
    </>
  );
}
