"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { deleteDocumentCategoryAction } from "@/src/server/actions/documents";
import type { DocumentCategory } from "@/src/server/data";

interface CategoryManagerDialogProps {
  categories: DocumentCategory[];
}

/**
 * Gerenciamento de categorias de documentos (lote-2 — DOC-06): permite
 * excluir uma categoria a partir de uma lista, com confirmação inline por
 * linha (em vez de um AlertDialog aninhado — Astryx recomenda não aninhar
 * dialogs). Excluir uma categoria não apaga seus documentos: eles passam a
 * aparecer como "Sem categoria" (FK `ON DELETE SET NULL`, já garantido pela
 * DAL/action da Fase 1).
 */
export function CategoryManagerDialog({ categories }: CategoryManagerDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) {
      setConfirmingId(null);
      setError(null);
    }
  }

  async function handleConfirmDelete(categoryId: string) {
    setError(null);
    setIsDeletingId(categoryId);

    const result = await deleteDocumentCategoryAction({ categoryId });

    setIsDeletingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirmingId(null);
    router.refresh();
  }

  return (
    <>
      <Button
        label="Gerenciar categorias"
        variant="secondary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={420}>
        <Layout
          header={
            <DialogHeader
              title="Gerenciar categorias"
              subtitle="Excluir uma categoria não apaga seus documentos: eles passam a aparecer como “Sem categoria”."
              onOpenChange={() => handleOpenChange(false)}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                {error && <Banner status="error" title={error} />}

                {categories.length === 0 ? (
                  <EmptyState
                    isCompact
                    title="Nenhuma categoria cadastrada"
                    description="Categorias criadas ao enviar documentos aparecerão aqui."
                  />
                ) : (
                  <List density="balanced">
                    {categories.map((category) => (
                      <ListItem
                        key={category.id}
                        label={category.name}
                        endContent={
                          confirmingId === category.id ? (
                            <HStack gap={2}>
                              <Text type="supporting" color="secondary">
                                Confirmar exclusão?
                              </Text>
                              <Button
                                label="Excluir"
                                variant="destructive"
                                size="sm"
                                isLoading={isDeletingId === category.id}
                                onClick={() => handleConfirmDelete(category.id)}
                              />
                              <Button
                                label="Cancelar"
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmingId(null)}
                              />
                            </HStack>
                          ) : (
                            <Button
                              label="Excluir"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setError(null);
                                setConfirmingId(category.id);
                              }}
                            />
                          )
                        }
                      />
                    ))}
                  </List>
                )}
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
