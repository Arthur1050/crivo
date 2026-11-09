"use client";

import { MODALITY } from "../../verticals/real-estate/vocabulary";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { NO_FOLDER_LABEL, type DocumentFolderOption } from "@/src/lib/document-folders";
import { updateDocumentAction } from "@/src/server/actions/documents";
import type { Document, DocumentCategory, DocumentSegment } from "@/src/server/data";
import { validateSegment, validateName } from "@/src/server/validation";

const MODALITY_OPTIONS: { value: DocumentSegment; label: string }[] = [
  { value: MODALITY.new, label: "Novo" },
  { value: MODALITY.used, label: "Usado" },
  { value: MODALITY.both, label: "Ambos" },
];

interface FieldErrors {
  name?: string;
  segment?: string;
}

interface EditDocumentDialogProps {
  document: Omit<Document, "extractedText"> | null;
  categories: DocumentCategory[];
  folders?: DocumentFolderOption[];
  onClose: () => void;
}

/**
 * Dialog de edição de um documento existente (lote-2 — DOC-05). Renderiza
 * `EditDocumentForm` com `key={document.id}` para que, ao trocar de
 * documento (usuário clica "Editar" em outra linha), o formulário remonte
 * do zero com os valores do novo documento — sem precisar sincronizar state
 * via efeito.
 */
export function EditDocumentDialog({
  document,
  categories,
  folders,
  onClose,
}: EditDocumentDialogProps) {
  return (
    <Dialog
      isOpen={document !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      purpose="form"
      width={480}
    >
      {document && (
        <EditDocumentForm
          key={document.id}
          document={document}
          categories={categories}
          folders={folders}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

interface EditDocumentFormProps {
  // Metadados apenas: o texto extraído nunca chega ao cliente pela listagem.
  document: Omit<Document, "extractedText">;
  categories: DocumentCategory[];
  folders?: DocumentFolderOption[];
  onClose: () => void;
}

function EditDocumentForm({ document, categories, folders, onClose }: EditDocumentFormProps) {
  const router = useRouter();
  const [name, setName] = useState(document.name);
  const [segment, setModality] = useState<DocumentSegment>(document.segment);
  const [categoryId, setCategoryId] = useState<string | null>(
    document.categoryId ?? null
  );
  const [folderId, setFolderId] = useState<string | null>(document.folderId ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setBanner(null);

    const nameCheck = validateName(name, "Nome do documento");
    const modalityCheck = validateSegment(segment);

    const nextErrors: FieldErrors = {
      name: nameCheck.ok ? undefined : nameCheck.error,
      segment: modalityCheck.ok ? undefined : modalityCheck.error,
    };

    if (nextErrors.name || nextErrors.segment) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    const result = await updateDocumentAction({
      documentId: document.id,
      name,
      segment,
      categoryId,
      ...(folders === undefined ? {} : { folderId }),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.error.startsWith("Nome do documento")) {
        setErrors({ name: result.error });
      } else if (result.error.startsWith("Modalidade")) {
        setErrors({ segment: result.error });
      } else {
        // Ex.: "Documento não encontrado." (apagado em outra aba) — mostra o
        // erro e não fecha silenciosamente nem cria um novo registro.
        setBanner(result.error);
      }
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Layout
      header={
        <DialogHeader
          title="Editar documento"
          onOpenChange={() => onClose()}
        />
      }
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status="error" title={banner} />}

            <TextInput
              label="Nome do documento"
              value={name}
              onChange={(value) => {
                setName(value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              status={errors.name ? { type: "error", message: errors.name } : undefined}
              isRequired
            />

            <Selector
              label="Modalidade"
              value={segment}
              onChange={(value) => {
                setModality(value as DocumentSegment);
                setErrors((prev) => ({ ...prev, segment: undefined }));
              }}
              options={MODALITY_OPTIONS}
              status={
                errors.segment ? { type: "error", message: errors.segment } : undefined
              }
              isRequired
            />

            <Selector
              label="Categoria"
              placeholder="Sem categoria"
              hasClear
              value={categoryId}
              onChange={setCategoryId}
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
            {folders !== undefined && (
              <Selector
                label="Pasta"
                placeholder={NO_FOLDER_LABEL}
                hasClear
                isOptional
                value={folderId}
                onChange={setFolderId}
                options={folders.map((folder) => ({ value: folder.id, label: folder.name }))}
              />
            )}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} />
            <Button
              label="Salvar"
              variant="primary"
              isLoading={isSubmitting}
              clickAction={handleSubmit}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
