"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { NO_FOLDER_LABEL, type DocumentFolderOption } from "../../lib/document-folders";
import { moveDocumentsToFolderAction } from "../../server/actions/document-folders";
import { folderErrorMessage, folderIdFromSelector, folderSelectorOptions, NO_FOLDER_OPTION_VALUE } from "./folder-presentation";

interface DocumentToMove {
  id: string;
  name: string;
  folderId: string | null;
}

export function MoveDocumentDialog({ document, folders, onClose }: {
  document: DocumentToMove | null;
  folders: DocumentFolderOption[];
  onClose: () => void;
}) {
  return (
    <Dialog isOpen={document !== null} onOpenChange={(open) => { if (!open) onClose(); }} purpose="form">
      {document && <MoveDocumentForm key={document.id} document={document} folders={folders} onClose={onClose} />}
    </Dialog>
  );
}

function MoveDocumentForm({ document, folders, onClose }: {
  document: DocumentToMove;
  folders: DocumentFolderOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState(document.folderId ?? NO_FOLDER_OPTION_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await moveDocumentsToFolderAction({ documentIds: [document.id], folderId: folderIdFromSelector(destination) });
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
      header={<DialogHeader title="Mover para pasta" subtitle={document.name} onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            {error && <Banner status="error" title={error} />}
            <Selector
              label="Pasta"
              placeholder={NO_FOLDER_LABEL}
              options={folderSelectorOptions(folders)}
              value={destination}
              onChange={(value) => { setDestination(value); setError(null); }}
              isDisabled={isSubmitting}
            />
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} isDisabled={isSubmitting} />
            <Button label="Mover" variant="primary" clickAction={submit} isLoading={isSubmitting} />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
