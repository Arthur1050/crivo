"use client";

import NextLink from "next/link";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { FolderActionsMenu } from "./folder-actions-menu";

export function FolderPath({ name }: { name: string }) {
  return (
    <Breadcrumbs label="Caminho" variant="supporting">
      <BreadcrumbItem href="/documentos" as={NextLink}>Documentos</BreadcrumbItem>
      <BreadcrumbItem isCurrent>{name}</BreadcrumbItem>
    </Breadcrumbs>
  );
}

// Título da seção de arquivos com a pasta aberta (PABRIR-01 AC5): o nome e o menu ao lado.
export function FolderHeading({ folder, canWrite }: {
  folder: { id: string; name: string; fileCount: number };
  canWrite: boolean;
}) {
  return (
    <HStack gap={2} vAlign="center">
      <Heading level={2}>{folder.name}</Heading>
      <FolderActionsMenu folder={folder} canWrite={canWrite} showOpen={false} afterDeleteHref="/documentos" />
    </HStack>
  );
}
