"use client";

import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { fetchDocumentPreview, type DocumentPreview } from "./preview-client";

interface DocumentPreviewDialogProps {
  documentId: string | null;
  documentName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Preview do texto extraído (lote-12 — T24, DOCVIEW-01/DOCLIM-01).
 *
 * Duas propriedades importam aqui. Primeiro, o texto não acompanha a listagem:
 * a busca só dispara quando o dialog abre com um documento, e o resultado é
 * descartado ao fechar. Segundo, o conteúdo é sempre inerte — `CodeBlock` com
 * `language="plaintext"` renderiza texto por nós de texto do React, então HTML,
 * Markdown, script ou link dentro do documento aparecem como caracteres
 * literais e nunca são interpretados pelo navegador.
 */
export function DocumentPreviewDialog({
  documentId,
  documentName,
  isOpen,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  // O resultado carrega o documento a que pertence. Isso deixa o estado ser
  // derivado em vez de sincronizado por efeito: trocar de documento ou fechar
  // o dialog já descarta o conteúdo anterior, sem setState de limpeza.
  const [result, setResult] = useState<{ id: string; preview: DocumentPreview } | null>(null);

  useEffect(() => {
    if (!isOpen || !documentId) return;

    let isCurrent = true;
    void fetchDocumentPreview(documentId).then((preview) => {
      // Resposta que chega depois de fechar ou de trocar de documento nunca
      // pode pintar o conteúdo do documento anterior.
      if (isCurrent) setResult({ id: documentId, preview });
    });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, documentId]);

  const preview = isOpen && result?.id === documentId ? result.preview : null;
  const isLoading = isOpen && documentId !== null && preview === null;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="info" variant="fullscreen">
      <Layout
        header={
          <DialogHeader
            title={documentName}
            subtitle="Texto extraído do documento"
            onOpenChange={() => onOpenChange(false)}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {isLoading && (
                <HStack gap={2} vAlign="center">
                  <Spinner size="sm" label="Carregando o texto extraído" />
                  <Text>Carregando o texto extraído…</Text>
                </HStack>
              )}

              {preview?.ok === false && <Banner status="error" title={preview.message} />}

              {preview?.ok === true && preview.warning && (
                <Banner status="warning" title={preview.warning} />
              )}

              {preview?.ok === true && (
                <CodeBlock
                  code={preview.text}
                  language="plaintext"
                  isWrapped
                  hasLineNumbers
                  maxHeight="60vh"
                  width="100%"
                  container="section"
                />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label="Fechar" variant="secondary" onClick={() => onOpenChange(false)} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
