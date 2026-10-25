"use client";

import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  MODALITY_BADGE_VARIANT,
  MODALITY_LABELS,
  type DocumentTableItem,
} from "@/src/components/documents/document-presentation";
import { deriveDocumentState, describeFailure } from "@/src/components/documents/document-row-state";
import { FILE_KIND_LABELS, FileKindGlyph } from "@/src/components/documents/file-type-icon";
import { resolveFileKind } from "@/src/lib/file-type";
import { formatFileSize } from "@/src/lib/format";
import type { DocumentCategory } from "@/src/server/data";

interface DocumentsGridProps {
  documents: DocumentTableItem[];
  categoryById: Map<string, DocumentCategory>;
  renderActions: (document: DocumentTableItem) => ReactNode;
}

/**
 * Visão em grade de `/documentos`: um card por arquivo, como na galeria do
 * gerenciador de arquivos. A prévia mostra o ícone do tipo, a modalidade e o
 * estado no topo, e o tipo e o tamanho na base; abaixo vêm o nome, a data de
 * envio (com a categoria, quando houver) e o menu de ações (⋮).
 */
export function DocumentsGrid({ documents, categoryById, renderActions }: DocumentsGridProps) {
  return (
    <Grid columns={{ minWidth: 220, max: 4 }} gap={3}>
      {documents.map((document) => {
        const presentation = deriveDocumentState(document);
        const category = document.categoryId ? categoryById.get(document.categoryId) : undefined;

        return (
          <Card key={document.id} padding={3}>
            <VStack gap={3}>
              <Card variant="muted" padding={3}>
                <VStack gap={2}>
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill">
                      <Badge
                        label={MODALITY_LABELS[document.modality]}
                        variant={MODALITY_BADGE_VARIANT[document.modality]}
                      />
                    </StackItem>
                    <StatusDot
                      variant={presentation.variant}
                      label={presentation.label}
                      tooltip={
                        presentation.state === "falha"
                          ? describeFailure(document.failureCode)
                          : presentation.description
                      }
                      isPulsing={presentation.state === "processando"}
                    />
                    <Text type="supporting">{presentation.label}</Text>
                  </HStack>
                  <Center height={88}>
                    <FileKindGlyph mimeType={document.mimeType} size={44} />
                  </Center>
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill">
                      <Text type="supporting">
                        {FILE_KIND_LABELS[resolveFileKind(document.mimeType)]}
                      </Text>
                    </StackItem>
                    <Text type="supporting">{formatFileSize(document.sizeBytes)}</Text>
                  </HStack>
                </VStack>
              </Card>

              <HStack gap={2} vAlign="start">
                <StackItem size="fill">
                  <VStack gap={0.5}>
                    <Text type="body" weight="semibold" maxLines={1}>
                      {document.name}
                    </Text>
                    <HStack gap={1} vAlign="center">
                      <Text type="supporting">Enviado em</Text>
                      <Timestamp value={document.uploadedAt.toISOString()} format="date" />
                      {category && (
                        <Text type="supporting" maxLines={1}>
                          · {category.name}
                        </Text>
                      )}
                    </HStack>
                  </VStack>
                </StackItem>
                {renderActions(document)}
              </HStack>
            </VStack>
          </Card>
        );
      })}
    </Grid>
  );
}
