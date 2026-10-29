"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon } from "lucide-react";
import { DropdownMenu, type DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { useToast } from "@astryxdesign/core/Toast";
import { folderHref } from "../../lib/document-folders";
import { DeleteFolderDialog } from "./delete-folder-dialog";
import { RenameFolderDialog } from "./folder-name-dialog";

interface FolderActionsMenuProps {
  folder: { id: string; name: string; fileCount: number };
  canWrite: boolean;
  showOpen?: boolean;
  afterDeleteHref?: string;
}

export function FolderActionsMenu({ folder, canWrite, showOpen = true, afterDeleteHref }: FolderActionsMenuProps) {
  const router = useRouter();
  const showToast = useToast();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(folderHref(folder.id), window.location.origin).toString());
      showToast({ body: "Link copiado" });
    } catch {
      showToast({ body: "Não foi possível copiar o link.", type: "error" });
    }
  }

  const items: DropdownMenuOption[] = [
    ...(showOpen ? [{ label: "Abrir pasta", onClick: () => router.push(folderHref(folder.id)) }] : []),
    { label: "Copiar link", onClick: copyLink },
    ...(canWrite ? [
      { label: "Renomear", onClick: () => setIsRenaming(true) },
      { type: "divider" as const },
      { label: "Excluir", onClick: () => setIsDeleting(true) },
    ] : []),
  ];

  return (
    <>
      <DropdownMenu
        button={{ label: `Ações da pasta ${folder.name}`, icon: <EllipsisVerticalIcon />, variant: "ghost", size: "sm", isIconOnly: true }}
        hasChevron={false}
        menuWidth={180}
        items={items}
      />
      {canWrite && <RenameFolderDialog folder={isRenaming ? folder : null} onClose={() => setIsRenaming(false)} />}
      {canWrite && <DeleteFolderDialog folder={isDeleting ? folder : null} onClose={() => setIsDeleting(false)} afterDeleteHref={afterDeleteHref} />}
    </>
  );
}
