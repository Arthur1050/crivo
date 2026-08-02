"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { BookmarkIcon } from "@/src/components/icons/bookmark";
import { DeleteIcon } from "@/src/components/icons/delete";
import {
  deleteDocumentCategoryAction,
  updateDocumentCategoryAction,
} from "@/src/server/actions/documents";
import type { CategoryColor, DocumentCategory } from "@/src/server/data";
import { CATEGORY_COLOR_PALETTE } from "@/src/server/validation";

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
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) {
      setConfirmingId(null);
      setError(null);
      setEditingColorId(null);
      setColorError(null);
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

  async function handleChangeColor(categoryId: string, color: CategoryColor) {
    setColorError(null);
    setIsSavingColor(true);

    const result = await updateDocumentCategoryAction({ categoryId, color });

    setIsSavingColor(false);

    if (!result.ok) {
      setColorError(result.error);
      return;
    }

    setEditingColorId(null);
    router.refresh();
  }

  return (
    <>
      <Button
        label="Gerenciar categorias"
        variant="secondary"
        icon={<BookmarkIcon size={16} />}
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
                {colorError && <Banner status="error" title={colorError} />}

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
                        startContent={
                          <Token
                            label={category.name}
                            color={category.color}
                            size="sm"
                            isLabelHidden
                          />
                        }
                        endContent={
                          editingColorId === category.id ? (
                            <VStack gap={2}>
                              <HStack gap={1} wrap="wrap">
                                {CATEGORY_COLOR_PALETTE.map((color) => (
                                  <Token
                                    key={color}
                                    label={color}
                                    color={color}
                                    size="sm"
                                    onClick={() => handleChangeColor(category.id, color)}
                                    endContent={
                                      category.color === color ? (
                                        <Icon icon="check" size="xsm" />
                                      ) : undefined
                                    }
                                  />
                                ))}
                              </HStack>
                              <HStack>
                                <Button
                                  label="Fechar"
                                  variant="ghost"
                                  size="sm"
                                  isLoading={isSavingColor}
                                  onClick={() => setEditingColorId(null)}
                                />
                              </HStack>
                            </VStack>
                          ) : confirmingId === category.id ? (
                            <HStack gap={2}>
                              <Text type="supporting" color="secondary">
                                Confirmar exclusão?
                              </Text>
                              <Button
                                label="Excluir"
                                variant="destructive"
                                size="sm"
                                icon={<DeleteIcon size={16} />}
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
                            <HStack gap={2}>
                              <Button
                                label="Cor"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setColorError(null);
                                  setEditingColorId(category.id);
                                }}
                              />
                              <Button
                                label="Excluir"
                                variant="ghost"
                                size="sm"
                                icon={<DeleteIcon size={16} />}
                                onClick={() => {
                                  setError(null);
                                  setConfirmingId(category.id);
                                }}
                              />
                            </HStack>
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
