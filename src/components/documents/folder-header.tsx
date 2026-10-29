"use client";

import NextLink from "next/link";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { FolderActionsMenu } from "./folder-actions-menu";

export function FolderHeader({ folder, canWrite }: {
  folder: { id: string; name: string; fileCount: number };
  canWrite: boolean;
}) {
  return (
    <VStack gap={3}>
      <Breadcrumbs label="Caminho" variant="supporting">
        <BreadcrumbItem href="/documentos" as={NextLink}>Documentos</BreadcrumbItem>
        <BreadcrumbItem isCurrent>{folder.name}</BreadcrumbItem>
      </Breadcrumbs>
      <HStack gap={3} vAlign="center">
        <StackItem size="fill"><Heading level={2}>{folder.name}</Heading></StackItem>
        <FolderActionsMenu folder={folder} canWrite={canWrite} showOpen={false} afterDeleteHref="/documentos" />
      </HStack>
    </VStack>
  );
}
