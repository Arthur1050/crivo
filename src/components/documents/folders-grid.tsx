"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { FolderIcon } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { LinkProvider } from "@astryxdesign/core/Link";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { folderHref } from "../../lib/document-folders";
import { FolderActionsMenu } from "./folder-actions-menu";
import { formatFolderCount, type FolderCardItem } from "./folder-presentation";

export function FoldersGrid({ folders, canWrite, createAction }: {
  folders: FolderCardItem[];
  canWrite: boolean;
  createAction?: ReactNode;
}) {
  return (
    <LinkProvider component={NextLink}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill"><Heading level={2}>Pastas</Heading></StackItem>
          <Text type="supporting">{formatFolderCount(folders.length)}</Text>
        </HStack>
        {folders.length === 0 ? (
          <EmptyState
            isCompact
            title="Nenhuma pasta ainda"
            description={canWrite ? "Crie uma pasta para organizar os arquivos." : "As pastas criadas pela equipe aparecem aqui."}
            actions={canWrite ? createAction : undefined}
          />
        ) : (
          <Grid columns={{ minWidth: 220, max: 4 }} gap={3}>
            {folders.map((folder) => (
              <ClickableCard key={folder.id} href={folderHref(folder.id)} label={`Pasta ${folder.name}`} padding={3}>
                <VStack gap={4}>
                  <HStack gap={3} vAlign="center">
                    <Card variant="muted" padding={2}><Icon icon={FolderIcon} size="sm" color="secondary" /></Card>
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold" maxLines={1}>{folder.name}</Text>
                        <Text type="supporting">{folder.fileCountLabel}</Text>
                      </VStack>
                    </StackItem>
                    <FolderActionsMenu folder={folder} canWrite={canWrite} />
                  </HStack>
                  <HStack gap={1.5} vAlign="center">
                    <Icon icon="clock" size="xsm" color="secondary" />
                    <StackItem size="fill"><Text type="supporting" maxLines={1}>{folder.updatedLabel}</Text></StackItem>
                    <Text type="supporting">{folder.sizeLabel}</Text>
                  </HStack>
                </VStack>
              </ClickableCard>
            ))}
          </Grid>
        )}
      </VStack>
    </LinkProvider>
  );
}
