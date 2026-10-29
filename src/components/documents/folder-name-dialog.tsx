"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlusIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { FOLDER_NAME_LABEL, type DocumentFolderOption, type FolderActionResult } from "../../lib/document-folders";
import { createDocumentFolderAction, renameDocumentFolderAction } from "../../server/actions/document-folders";
import { validateName } from "../../server/validation";
import { folderErrorMessage } from "./folder-presentation";

/** Valida antes da action; o servidor continua sendo a autoridade do nome. */
export async function submitFolderName(
  name: string,
  action: (input: { name: string }) => Promise<FolderActionResult<{ folder: DocumentFolderOption }>>,
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>> {
  const check = validateName(name, FOLDER_NAME_LABEL);
  if (!check.ok) return { ok: false, code: "nome-invalido", error: check.error };
  return action({ name });
}

export function CreateFolderDialog() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button label="Nova pasta" variant="secondary" icon={<FolderPlusIcon />} onClick={() => setIsOpen(true)} />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} purpose="form">
        {isOpen && <FolderNameForm onClose={() => setIsOpen(false)} />}
      </Dialog>
    </>
  );
}

export function RenameFolderDialog({ folder, onClose }: {
  folder: DocumentFolderOption | null;
  onClose: () => void;
}) {
  return (
    <Dialog isOpen={folder !== null} onOpenChange={(open) => { if (!open) onClose(); }} purpose="form">
      {folder && <FolderNameForm key={folder.id} folder={folder} onClose={onClose} />}
    </Dialog>
  );
}

function FolderNameForm({ folder, onClose }: { folder?: DocumentFolderOption; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(folder?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await submitFolderName(name, folder
        ? (input) => renameDocumentFolderAction({ folderId: folder.id, ...input })
        : createDocumentFolderAction);
      if (!result.ok) {
        setError(folderErrorMessage(result));
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Layout
      header={<DialogHeader title={folder ? "Renomear pasta" : "Nova pasta"} onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <TextInput
            label={FOLDER_NAME_LABEL}
            value={name}
            onChange={(value) => { setName(value); setError(null); }}
            hasAutoFocus
            isRequired
            isDisabled={isSubmitting}
            status={error ? { type: "error", message: error } : undefined}
          />
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} isDisabled={isSubmitting} />
            <Button label={folder ? "Salvar" : "Criar pasta"} variant="primary" clickAction={submit} isLoading={isSubmitting} />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
