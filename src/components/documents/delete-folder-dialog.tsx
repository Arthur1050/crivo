"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import type { FolderActionResult } from "../../lib/document-folders";
import { deleteDocumentFolderAction } from "../../server/actions/document-folders";
import { deleteFolderCopy, folderErrorMessage } from "./folder-presentation";

interface FolderToDelete {
  id: string;
  name: string;
  fileCount: number;
}

/** Uma confirmação executa uma tentativa; erro mantém a consequência visível. */
export async function submitFolderDeletion(
  folder: FolderToDelete,
  action: (input: { folderId: string }) => Promise<FolderActionResult<{ movedToRootCount: number }>>,
): Promise<{ ok: true } | { ok: false; description: string }> {
  const result = await action({ folderId: folder.id });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    description: `${deleteFolderCopy(folder.name, folder.fileCount).description} ${folderErrorMessage(result)}`,
  };
}

export function DeleteFolderDialog({ folder, onClose, afterDeleteHref }: {
  folder: FolderToDelete | null;
  onClose: () => void;
  afterDeleteHref?: string;
}) {
  return folder && (
    <DeleteFolderConfirmation key={folder.id} folder={folder} onClose={onClose} afterDeleteHref={afterDeleteHref} />
  );
}

function DeleteFolderConfirmation({ folder, onClose, afterDeleteHref }: {
  folder: FolderToDelete;
  onClose: () => void;
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  const [errorDescription, setErrorDescription] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const copy = deleteFolderCopy(folder.name, folder.fileCount);

  async function confirm() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await submitFolderDeletion(folder, deleteDocumentFolderAction);
      if (!result.ok) {
        setErrorDescription(result.description);
        return;
      }
      if (afterDeleteHref) router.replace(afterDeleteHref);
      router.refresh();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      isOpen
      title={copy.title}
      description={errorDescription ?? copy.description}
      actionLabel="Excluir pasta"
      actionVariant="destructive"
      cancelLabel="Cancelar"
      isActionLoading={isDeleting}
      onAction={confirm}
      onOpenChange={(open) => { if (!open && !isDeleting) onClose(); }}
    />
  );
}
